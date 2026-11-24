"""Carga: grava os JSONs particionados em `docs/dados/` (atômico) e confere os tamanhos-alvo.

Tabelas grandes usam formato colunar `{"colunas": [...], "linhas": [[...], ...]}` (menor que
lista de objetos). Dados publicados: só agregados e links já públicos.
"""
import json
import math
import re
from datetime import date, datetime

import numpy as np
import pandas as pd
from prefect import task

from src import config

_PADRAO_PARTICAO = re.compile(r"^\d{4}-\d{2}\.json$")
COLUNAS_PUBLICACAO = [
    "data", "rede", "perfil", "link", "formato", "formato_nativo", "colab", "ao_vivo",
    "tema", "tema_secundario", "tipo_classificacao", "projeto",
    "alcance", "impressoes", "visualizacoes", "curtidas", "comentarios", "compartilhamentos",
    "salvos", "cliques_link", "engajamento", "engajamento_completo", "taxa_engajamento",
    "denominador_tipo", "descricao",
]


def _nativo(obj):
    """Converte NaN/NA/numpy/Timestamp em tipos JSON nativos (NA -> null)."""
    if obj is None or obj is pd.NA or obj is pd.NaT:
        return None
    if isinstance(obj, dict):
        return {str(k): _nativo(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_nativo(v) for v in obj]
    if isinstance(obj, (pd.Timestamp, datetime, date)):
        return obj.date().isoformat() if isinstance(obj, (pd.Timestamp, datetime)) else obj.isoformat()
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return round(obj, 4)
    return obj


def _gravar_json(caminho, obj) -> int:
    """Escrita atômica (.tmp + replace). Devolve o tamanho em bytes."""
    caminho.parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps(_nativo(obj), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    tmp = caminho.with_suffix(caminho.suffix + ".tmp")
    tmp.write_text(texto, encoding="utf-8")
    tmp.replace(caminho)
    return len(texto.encode("utf-8"))


def _tabela(df: pd.DataFrame) -> dict:
    """DataFrame -> formato colunar."""
    return {"colunas": list(df.columns), "linhas": df.astype(object).values.tolist()}


def _gravar_particoes(base: pd.DataFrame) -> list[dict]:
    posts = base[base["eh_post"]].copy()
    posts["descricao"] = posts["descricao"].str.slice(0, config.DESCRICAO_MAX_CARACTERES)
    fim = posts["data"].max()
    corte = (fim.to_period("M") - (config.JANELA_MESES_POSTS - 1)).to_timestamp()
    posts = posts[posts["data"] >= corte]
    config.PASTA_PUBLICACOES.mkdir(parents=True, exist_ok=True)

    meses_novos = set()
    particoes = []
    for mes, g in posts.groupby("mes", sort=True):
        colunas = [c for c in COLUNAS_PUBLICACAO if c in g.columns]
        g = g.sort_values("data", ascending=False)
        tamanho = _gravar_json(config.PASTA_PUBLICACOES / f"{mes}.json", _tabela(g[colunas]))
        if tamanho > config.TAMANHO_ALVO_PARTICAO:  # reduz colunas: encurta a descrição
            g = g.assign(descricao=g["descricao"].str.slice(0, 80))
            tamanho = _gravar_json(config.PASTA_PUBLICACOES / f"{mes}.json", _tabela(g[colunas]))
            print(f"Aviso: partição {mes} acima do alvo; descrição encurtada para 80 caracteres.")
        meses_novos.add(f"{mes}.json")
        particoes.append({"mes": mes, "arquivo": f"publicacoes/{mes}.json", "n": int(len(g)), "bytes": tamanho})

    for antigo in config.PASTA_PUBLICACOES.glob("*.json"):  # remove partições fora da janela
        if _PADRAO_PARTICAO.match(antigo.name) and antigo.name not in meses_novos:
            antigo.unlink()
    return particoes


def _tabela_tamanhos(tamanhos: dict[str, int], particoes: list[dict]) -> None:
    print(f"{'arquivo':32}{'bytes':>12}{'alvo':>12}  situação")
    for nome, tam in tamanhos.items():
        alvo = config.TAMANHOS_ALVO.get(nome)
        situacao = "-" if alvo is None else ("ok" if tam <= alvo else "ACIMA DO ALVO")
        print(f"{nome:32}{tam:>12}{(alvo or 0):>12}  {situacao}")
    for p in particoes:
        situacao = "ok" if p["bytes"] <= config.TAMANHO_ALVO_PARTICAO else "ACIMA DO ALVO"
        print(f"{p['arquivo']:32}{p['bytes']:>12}{config.TAMANHO_ALVO_PARTICAO:>12}  {situacao}")


@task(name="Salvar JSONs em docs/dados", log_prints=True)
def salvar_dados_json(tabelas: dict) -> dict:
    """Grava todos os JSONs e o manifest (por último). Devolve o manifest."""
    base: pd.DataFrame = tabelas["base"]
    pasta = config.PASTA_DADOS
    tamanhos: dict[str, int] = {}

    tamanhos["resumo_diario.json"] = _gravar_json(pasta / "resumo_diario.json", _tabela(tabelas["resumo_diario"]))
    tamanhos["benchmark.json"] = _gravar_json(pasta / "benchmark.json", tabelas["benchmark"])
    tamanhos["conteudos_agregado.json"] = _gravar_json(
        pasta / "conteudos_agregado.json", _tabela(tabelas["conteudos"])
    )
    qual = tabelas.get("qualitativo") or {}
    tamanhos["anotacoes.json"] = _gravar_json(pasta / "anotacoes.json", qual.get("anotacoes", []))
    dicionario = json.loads((config.BASE_DIR / "config" / "dicionario_metricas.json").read_text(encoding="utf-8"))
    tamanhos["dicionario_metricas.json"] = _gravar_json(pasta / "dicionario_metricas.json", dicionario)
    particoes = _gravar_particoes(base)

    posts = base[base["eh_post"]]
    redes_pres = set(base["rede"].dropna().unique())
    from config.redes import ORDEM_REDES

    manifest = {
        "versao_esquema": config.VERSAO_ESQUEMA,
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "redes": [r for r in ORDEM_REDES if r in redes_pres] + sorted(redes_pres - set(ORDEM_REDES)),
        "periodo": {"inicio": base["data"].min(), "fim": base["data"].max()},
        "janela_meses_posts": config.JANELA_MESES_POSTS,
        "totais": {"linhas": int(len(base)), "publicacoes": int(len(posts))},
        "formato_tabelas": "colunar: {colunas: [...], linhas: [[...]]}",
        "arquivos": {n: n for n in tamanhos},
        "particoes": particoes,
        "qualitativo_disponivel": bool(qual),
        "limitacoes": tabelas.get("limitacoes", []),
    }
    tamanhos["manifest.json"] = _gravar_json(pasta / "manifest.json", manifest)
    _tabela_tamanhos(tamanhos, particoes)
    return manifest
