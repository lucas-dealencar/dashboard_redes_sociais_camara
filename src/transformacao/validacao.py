"""Validação (`_validar`): falha alto em problemas estruturais; problemas pontuais de linha
(data inválida, taxa fora de 0–100) excluem/anulam a linha com aviso e só falham acima do
limite `LIMITE_DATAS_INVALIDAS` (5%). Mensagens em pt-BR com linha da planilha e coluna."""
import pandas as pd

from src import config

COLUNAS_NAO_NEGATIVAS = [
    "alcance", "impressoes", "curtidas", "comentarios", "compartilhamentos", "salvos",
]
EXEMPLOS = 5


class ErroValidacao(ValueError):
    """Validação reprovada; a mensagem lista rede/linha/coluna/motivo."""


def _exemplos(df: pd.DataFrame, mascara: pd.Series, coluna: str, motivo: str) -> list[str]:
    linhas = df.loc[mascara, ["linha_planilha", "rede"]].head(EXEMPLOS)
    return [
        f"  - linha {int(r.linha_planilha)} | rede {r.rede or '?'} | coluna '{coluna}': {motivo}"
        for r in linhas.itertuples()
    ]


def _validar(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Devolve (df sem linhas de data inválida, avisos). Levanta ErroValidacao se reprovar."""
    erros: list[str] = []
    avisos: list[str] = []
    n = len(df)

    obrigatorias = ["linha_planilha", "data", "rede", "link"]
    faltando = [c for c in obrigatorias if c not in df.columns]
    if faltando:
        raise ErroValidacao(f"Colunas obrigatórias ausentes após a limpeza: {faltando}.")

    # duplicidade de link (após deduplicar não pode sobrar)
    dup = df["link"].notna() & df.duplicated(subset="link", keep=False)
    if dup.any():
        erros.append(f"{int(dup.sum())} linhas com 'Post - Link' duplicado após a deduplicação.")
        erros += _exemplos(df, dup, "Post - Link", "link duplicado")

    # negativos em contagens
    for col in COLUNAS_NAO_NEGATIVAS:
        neg = df[col].notna() & (df[col].fillna(0) < 0)
        if neg.any():
            erros.append(f"{int(neg.sum())} valor(es) negativo(s) em '{col}'.")
            erros += _exemplos(df, neg, col, "valor negativo")

    # rede ausente
    sem_rede = df["rede"].isna()
    if sem_rede.any():
        erros.append(f"{int(sem_rede.sum())} linha(s) sem rede em '02 - Rede'.")
        erros += _exemplos(df, sem_rede, "02 - Rede", "rede vazia")

    # datas: ausentes ou implausíveis
    minimo = pd.Timestamp(config.DATA_MINIMA_PLAUSIVEL)
    maximo = pd.Timestamp.today().normalize() + pd.Timedelta(days=1)
    ruim = df["data"].isna() | (df["data"] < minimo) | (df["data"] > maximo)
    if ruim.any():
        frac = ruim.sum() / max(n, 1)
        msg = f"{int(ruim.sum())} linha(s) ({frac:.1%}) com data ausente/ilegível/implausível."
        if frac > config.LIMITE_DATAS_INVALIDAS:
            erros.append(msg + f" Acima do limite de {config.LIMITE_DATAS_INVALIDAS:.0%}.")
            erros += _exemplos(df, ruim, "01 - Data", "data inválida")
        else:
            avisos.append(msg + " Linhas excluídas da análise.")
            avisos += _exemplos(df, ruim, "01 - Data", "data inválida")
    if erros:
        raise ErroValidacao("Validação reprovada:\n" + "\n".join(erros))
    return df[~ruim].reset_index(drop=True), avisos


def _validar_taxas(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Taxa de engajamento deve estar entre 0 e 100. Fora disso: anula (NA) com aviso;
    falha se passar do limite (5% das taxas calculadas)."""
    avisos: list[str] = []
    calculada = df["taxa_engajamento"].notna()
    fora = calculada & ((df["taxa_engajamento"] < 0) | (df["taxa_engajamento"] > 100))
    if fora.any():
        frac = fora.sum() / max(int(calculada.sum()), 1)
        msg = f"{int(fora.sum())} taxa(s) de engajamento fora de 0–100 ({frac:.1%})."
        if frac > config.LIMITE_DATAS_INVALIDAS:
            raise ErroValidacao(
                msg + " Acima do limite.\n"
                + "\n".join(_exemplos(df, fora, "taxa_engajamento", "fora de 0–100"))
            )
        avisos.append(msg + " Valores anulados (NA).")
        avisos += _exemplos(df, fora, "taxa_engajamento", "fora de 0–100")
        df = df.copy()
        df.loc[fora, "taxa_engajamento"] = pd.NA
    return df, avisos
