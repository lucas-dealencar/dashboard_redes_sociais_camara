"""Coleta: lê a aba `Consolidado` do Google Sheets por blocos de linhas e grava o bruto em cache.

A planilha é SOMENTE LEITURA. Aqui não se converte tipo de negócio (datas, %, milhares):
isso é da limpeza. Só se uniformizam tipos por coluna para poder gravar em Parquet.
"""
import hashlib
import json
import random
import time
from datetime import datetime

import pandas as pd
from prefect import task

from config.colunas import ABAS_ESPERADAS, COLUNAS_OBRIGATORIAS, MAPA_COLUNAS
from src import config


class ErroColeta(RuntimeError):
    """Falha de coleta com mensagem pronta para o usuário (pt-BR)."""


# ----------------------------- funções puras ----------------------------- #
def _letra_coluna(indice: int) -> str:
    """Índice 0-based -> letra A1 (0 -> A, 26 -> AA)."""
    letras = ""
    n = indice + 1
    while n:
        n, resto = divmod(n - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


def _hash_cabecalho(cabecalho: list[str]) -> str:
    return hashlib.sha256("\x1f".join(cabecalho).encode("utf-8")).hexdigest()[:16]


def _resolver_colunas(cabecalho: list[str]) -> dict[str, int]:
    """Nome na origem -> índice, só das colunas do mapa. Falha se faltar obrigatória."""
    posicoes: dict[str, int] = {}
    for i, nome in enumerate(cabecalho):
        nome = str(nome).strip()
        if nome in MAPA_COLUNAS and nome not in posicoes:  # primeira ocorrência vale
            posicoes[nome] = i
    faltando = [c for c in COLUNAS_OBRIGATORIAS if c not in posicoes]
    if faltando:
        raise ErroColeta(
            f"Cabeçalho da aba inesperado: faltam as colunas obrigatórias {faltando}. "
            "A coleta foi interrompida para não seguir com colunas deslocadas. "
            "Rode `python scripts/inspecionar_cabecalho.py` e ajuste config/colunas.py."
        )
    ausentes = [c for c in MAPA_COLUNAS if c not in posicoes]
    if ausentes:
        print(f"Aviso: {len(ausentes)} coluna(s) do mapa não existem na planilha: {ausentes}")
    return posicoes


def _vazio(v) -> bool:
    if v is None or (isinstance(v, float) and v != v):  # None ou NaN (pandas 3 troca None por NaN)
        return True
    return isinstance(v, str) and v.strip() == ""


def _uniformizar_tipos(df: pd.DataFrame) -> pd.DataFrame:
    """Garante um tipo por coluna (exigência do Parquet), sem perder informação.

    - só números -> float64; só texto -> texto; vazio -> nulo;
    - coluna mista (ex.: data por extenso + serial): números viram texto ("45000"),
      float inteiro sem casas ("2253.0" -> "2253").
    """
    def _nulo(v) -> bool:
        return _vazio(v) or (isinstance(v, float) and v != v)  # None, "" ou NaN

    def _txt(v):
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        return str(v)

    saida = {}
    for col in df.columns:
        # listas Python: o pandas 3 converteria None em NaN dentro de Series
        itens = [None if _nulo(v) else v for v in df[col].tolist()]
        valores = [v for v in itens if v is not None]
        e_num = [isinstance(v, (int, float)) and not isinstance(v, bool) for v in valores]
        if valores and all(e_num):
            saida[col] = pd.Series([float("nan") if v is None else float(v) for v in itens],
                                   index=df.index, dtype="float64")
        else:
            if any(e_num):
                print(f"Aviso: coluna '{col}' mista (número e texto); números gravados como texto.")
            saida[col] = pd.Series([None if v is None else _txt(v) for v in itens],
                                   index=df.index, dtype="object")
    return pd.DataFrame(saida, index=df.index)


def _montar_dataframe(dados: dict[str, list], linha_inicial: int) -> pd.DataFrame:
    """`dados`: nome na origem -> valores (mesmo comprimento). Adiciona `linha_planilha`."""
    df = pd.DataFrame(dados)
    df.insert(0, "linha_planilha", range(linha_inicial, linha_inicial + len(df)))
    return df


# --------------------------- tolerância a falhas do Google --------------------------- #
# Erros de servidor/cota/rede são passageiros: repete com espera crescente (~5 min no total)
# antes de desistir. Erros de configuração (403, 404, cabeçalho, credencial) NÃO são repetidos.
ESPERAS_S = (5, 10, 20, 40, 60, 60, 60, 60)  # 9 tentativas
CODIGOS_TRANSITORIOS = {408, 429, 500, 502, 503, 504}
TIMEOUT_REQUISICAO_S = 120


def _eh_transitorio(erro: BaseException) -> bool:
    """500/502/503/504 (Google), 429 (cota por minuto), 408 e quedas de rede/timeout."""
    import requests
    from gspread.exceptions import APIError

    if isinstance(erro, APIError):
        return getattr(erro, "code", None) in CODIGOS_TRANSITORIOS
    return isinstance(
        erro,
        (requests.exceptions.ConnectionError, requests.exceptions.Timeout, ConnectionError, TimeoutError),
    )


def _com_retry(funcao, descricao: str, esperas=None, dormir=time.sleep):
    """Executa `funcao()`; em falha passageira espera e tenta de novo. Outros erros sobem na hora."""
    esperas = ESPERAS_S if esperas is None else esperas
    for tentativa in range(len(esperas) + 1):
        try:
            return funcao()
        except Exception as erro:
            if not _eh_transitorio(erro) or tentativa == len(esperas):
                raise
            espera = esperas[tentativa] * random.uniform(0.8, 1.2)
            print(
                f"Aviso: falha passageira do Google em '{descricao}' ({type(erro).__name__}: "
                f"{str(erro)[:80]}); tentativa {tentativa + 1}/{len(esperas) + 1}, nova em {espera:.0f}s."
            )
            dormir(espera)


def _retentar_se_transitorio(task, task_run, state) -> bool:
    """Condição de retry do Prefect: só repete a coleta inteira se a falha final foi passageira."""
    erro = state.result(raise_on_failure=False)
    return isinstance(erro, BaseException) and _eh_transitorio(erro)


# ------------------------------ acesso ao Google ------------------------------ #
def _cliente():
    import gspread

    if not config.CAMINHO_CREDENCIAIS.exists():
        raise ErroColeta(
            f"Credenciais não encontradas em {config.CAMINHO_CREDENCIAIS}. "
            "Coloque o JSON da conta de serviço nesse caminho (arquivo fora do git)."
        )
    cliente = gspread.service_account(filename=str(config.CAMINHO_CREDENCIAIS))
    cliente.set_timeout(TIMEOUT_REQUISICAO_S)  # sem isso uma conexão pendurada trava o flow
    return cliente


def _abrir_aba(spreadsheet_id: str, aba: str, variavel: str = "SPREADSHEET_ID"):
    if not spreadsheet_id:
        raise ErroColeta(f"ID da planilha não definido (variável de ambiente {variavel}).")
    cliente = _cliente()
    planilha = _com_retry(lambda: cliente.open_by_key(spreadsheet_id), "abrir planilha")
    abas = _com_retry(planilha.worksheets, "listar abas")
    nomes = [w.title for w in abas]
    if aba not in nomes:
        raise ErroColeta(f"Aba '{aba}' não encontrada. Abas existentes: {nomes}.")
    return abas[nomes.index(aba)]


@task(name="Ler bloco da planilha", log_prints=True)
def _ler_bloco(ws, posicoes: dict[str, int], inicio: int, fim: int) -> dict[str, list]:
    """Lê as colunas necessárias das linhas [inicio, fim] (1-based) em UMA requisição."""
    from gspread.utils import ValueRenderOption

    nomes = list(posicoes)
    faixas = [
        f"{_letra_coluna(posicoes[n])}{inicio}:{_letra_coluna(posicoes[n])}{fim}" for n in nomes
    ]
    resultado = _com_retry(
        lambda: ws.batch_get(faixas, value_render_option=ValueRenderOption.unformatted),
        f"ler linhas {inicio}–{fim}",
    )
    tamanho = fim - inicio + 1
    dados: dict[str, list] = {}
    for nome, faixa in zip(nomes, resultado):
        col = [(linha[0] if linha else None) for linha in faixa]
        dados[nome] = col + [None] * (tamanho - len(col))  # a API corta vazios finais
    return dados


def _bloco_vazio(dados: dict[str, list]) -> bool:
    return all(_vazio(v) for col in dados.values() for v in col)


@task(
    name="Coletar aba Consolidado", log_prints=True,
    retries=2, retry_delay_seconds=120, retry_condition_fn=_retentar_se_transitorio,
)
def _coletar_sheets() -> pd.DataFrame:
    t0 = time.time()
    ws = _abrir_aba(config.SPREADSHEET_ID, config.ABA_CONSOLIDADO)
    cabecalho = [str(c).strip() for c in _com_retry(lambda: ws.row_values(1), "ler cabeçalho")]
    posicoes = _resolver_colunas(cabecalho)

    hash_atual = _hash_cabecalho(cabecalho)
    anterior = _ler_estado().get("hash_cabecalho")
    if anterior and anterior != hash_atual:
        print("Aviso: o cabeçalho da planilha mudou desde a última coleta; confira o mapa de colunas.")

    pedacos: list[pd.DataFrame] = []
    linha = 2
    while linha <= ws.row_count:
        fim = min(linha + config.BLOCO_LINHAS - 1, ws.row_count)
        dados = _ler_bloco(ws, posicoes, linha, fim)
        if _bloco_vazio(dados):
            break
        pedacos.append(_montar_dataframe(dados, linha))
        print(f"Linhas {linha}–{fim} lidas.")
        linha = fim + 1
        time.sleep(config.PAUSA_ENTRE_BLOCOS_S)

    if not pedacos:
        raise ErroColeta("A aba não retornou nenhuma linha de dados.")
    bruto = pd.concat(pedacos, ignore_index=True)
    # descarta linhas de preenchimento: colunas de fórmula (ex.: Tag Brandwatch = "Não") vão até
    # o fim da grade. Linha útil = tem link, data ou rede.
    util = bruto[COLUNAS_OBRIGATORIAS].map(lambda v: not _vazio(v)).any(axis=1)
    print(f"Linhas de preenchimento descartadas: {int((~util).sum())}")
    bruto = _uniformizar_tipos(bruto[util].reset_index(drop=True))
    print(f"Coleta concluída: {len(bruto)} linhas em {time.time() - t0:.1f}s.")
    _gravar_estado(len(bruto), hash_atual)
    return bruto


# ----------------------------------- cache ----------------------------------- #
def _ler_estado() -> dict:
    try:
        return json.loads(config.ARQUIVO_ESTADO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _gravar_estado(linhas: int, hash_cabecalho: str) -> None:
    config.PASTA_CACHE.mkdir(exist_ok=True)
    estado = {
        "lido_em": datetime.now().isoformat(timespec="seconds"),
        "linhas": linhas,
        "hash_cabecalho": hash_cabecalho,
    }
    config.ARQUIVO_ESTADO.write_text(json.dumps(estado, ensure_ascii=False), encoding="utf-8")


def _gravar_cache(bruto: pd.DataFrame) -> None:
    config.PASTA_CACHE.mkdir(exist_ok=True)
    tmp = config.ARQUIVO_BRUTO.with_suffix(".tmp")
    bruto.to_parquet(tmp, index=False)
    tmp.replace(config.ARQUIVO_BRUTO)


def _ler_cache() -> pd.DataFrame:
    if not config.ARQUIVO_BRUTO.exists():
        raise ErroColeta("Cache inexistente: rode uma vez sem --do-cache para coletar da planilha.")
    return pd.read_parquet(config.ARQUIVO_BRUTO)


# ------------------------------------ API ------------------------------------ #
@task(name="Extrair dados do Sheets", log_prints=True)
def extrair_dados_sheets(do_cache: bool = False) -> pd.DataFrame:
    """Retorna o bruto (colunas com nome da origem + `linha_planilha`)."""
    if do_cache:
        bruto = _ler_cache()
        print(f"Cache lido: {len(bruto)} linhas (sem chamar a API).")
        return bruto
    bruto = _coletar_sheets()
    _gravar_cache(bruto)
    return bruto


@task(name="Extrair dados qualitativos (opcional)", log_prints=True)
def extrair_dados_qualitativos() -> dict:
    """Anotações editoriais da planilha qualitativa. Levanta erro se indisponível;
    o flow captura e segue sem ela."""
    ws = _abrir_aba(
        config.SPREADSHEET_ID_QUALITATIVO, config.ABA_ANOTACOES, "SPREADSHEET_ID_QUALITATIVO"
    )
    return {"anotacoes": ws.get_all_records()}
