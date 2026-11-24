"""Publicações: deduplicação por link, tema e formato.

Linhas SEM link não são publicações (podem ser linhas de conta/dia): ficam na base com
`eh_post = False` e alimentam só o resumo diário. A deduplicação mantém a ÚLTIMA ocorrência
de cada link (a mais recente na planilha, com métricas mais atualizadas).
"""
import json

import pandas as pd

from src import config

SEM_TEMA = "Sem tema"
SEM_FORMATO = "Não informado"


def _deduplicar(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    com_link = df["link"].notna()
    duplicada = com_link & df.duplicated(subset="link", keep="last")
    return df[~duplicada].reset_index(drop=True), int(duplicada.sum())


def _carregar_aliases() -> dict[str, str]:
    caminho = config.BASE_DIR / "config" / "taxonomia_temas.json"
    try:
        return json.loads(caminho.read_text(encoding="utf-8")).get("aliases", {})
    except (OSError, ValueError):
        return {}


def _atribuir_tema_formato(df: pd.DataFrame, aliases: dict[str, str]) -> pd.DataFrame:
    """Tema = Prop 1 (ou Prop 2); formato = Tipo de mídia. Só mapeia o que já vem classificado."""
    tema = df["prop1_tema"].where(df["prop1_tema"].notna(), df["prop2_tema"])
    tema = tema.map(lambda t: aliases.get(t, t) if isinstance(t, str) else t)
    df["tema"] = tema.fillna(SEM_TEMA)
    df["formato"] = df["formato"].fillna(SEM_FORMATO)
    return df


def preparar_publicacoes(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    df, removidas = _deduplicar(df)
    df["eh_post"] = df["link"].notna()
    df = _atribuir_tema_formato(df, _carregar_aliases())
    df["mes"] = df["data"].dt.strftime("%Y-%m")
    return df, {"duplicados_removidos": removidas, "linhas_sem_link": int((~df["eh_post"]).sum())}
