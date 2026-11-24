"""Cobertura de métricas por rede, KPI efetivo por rede e reconciliação com a planilha.

Objetivo: tornar explícito o que a planilha NÃO traz (zero ≠ indisponível ≠ incompleto) e
alertar quando o cálculo do pipeline diverge das colunas calculadas na origem.
"""
import pandas as pd

from config.redes import KPI_PRINCIPAL, KPI_SUBSTITUTO_PADRAO, KPI_SUBSTITUTOS, REDES_ESCOPO
from src import config

METRICAS_COBERTURA = [
    "alcance", "impressoes", "visualizacoes", "curtidas", "comentarios", "compartilhamentos",
    "salvos", "cliques_link", "seguidores", "seguidores_novos", "engajamento", "taxa_engajamento",
]

# O que a proposta pede e a planilha atual NÃO traz (revisar quando a origem mudar).
LIMITACOES_FIXAS = [
    "Seguidores, novos seguidores, perdas e saldo líquido: colunas vazias na planilha; cartões e série de seguidores indisponíveis.",
    "Visualizações, tempo assistido, retenção e conclusão: sem coluna na planilha (só 1 valor em '% visualização média').",
    "Aba Público (faixa etária, gênero, localização, horários): sem dados demográficos na planilha.",
    "Hora da publicação, duração do vídeo, campanha e natureza orgânica/paga: ausentes na planilha.",
    "Série diária da conta: a planilha traz um registro por publicação; o resumo diário agrega por data de publicação.",
    "Posts em idade equivalente: a planilha traz um único retrato das métricas (sem data de coleta); usa-se maturidade mínima como aproximação.",
    "Stories não trazem curtidas: engajamento básico fica indisponível (incompleto) para Stories.",
]


def cobertura_metricas(df: pd.DataFrame) -> dict:
    """Por rede × métrica: n de linhas com dado, % e status (disponível/parcial/indisponível)."""
    saida: dict = {}
    for rede, g in df.groupby("rede", dropna=True):
        metricas = {}
        for m in METRICAS_COBERTURA:
            if m not in g:
                continue
            n = int(g[m].notna().sum())
            frac = n / len(g)
            status = (
                "indisponível" if n == 0
                else "disponível" if frac >= config.LIMIAR_COBERTURA_DISPONIVEL
                else "parcial"
            )
            metricas[m] = {"n": n, "pct": round(frac * 100, 1), "status": status}
        saida[rede] = {"linhas": int(len(g)), "metricas": metricas}
    return saida


def kpi_por_rede(cobertura: dict) -> dict:
    """KPI proposto x KPI efetivamente usado por rede; substituto sempre sinalizado.
    Redes do escopo sem nenhuma linha aparecem como `sem_dados`."""
    saida: dict = {}
    for rede in dict.fromkeys([*REDES_ESCOPO, *cobertura]):
        proposto = KPI_PRINCIPAL.get(rede)
        mets = cobertura.get(rede, {}).get("metricas")
        if not mets:
            saida[rede] = {"kpi_proposto": proposto, "kpi_usado": None, "substituto": False,
                           "situacao": "sem_dados", "motivo": "rede ausente da planilha"}
            continue

        def tem(m):
            return mets.get(m, {}).get("status") in ("disponível", "parcial")

        if proposto and tem(proposto):
            saida[rede] = {"kpi_proposto": proposto, "kpi_usado": proposto, "substituto": False,
                           "situacao": mets[proposto]["status"], "motivo": None}
            continue
        usado = next((m for m in KPI_SUBSTITUTOS.get(rede, KPI_SUBSTITUTO_PADRAO) if tem(m)), None)
        motivo = f"'{proposto}' não existe na planilha para esta rede" if proposto else "rede sem KPI definido na proposta"
        saida[rede] = {
            "kpi_proposto": proposto, "kpi_usado": usado, "substituto": usado is not None,
            "situacao": mets[usado]["status"] if usado else "indisponível",
            "motivo": motivo + (f"; usando '{usado}' (validar com a equipe)" if usado else ""),
        }
    return saida


def reconciliar_com_planilha(df: pd.DataFrame) -> dict:
    """Compara interações/taxa do pipeline com as colunas calculadas da planilha.
    Divergência é esperada onde a fórmula da origem usa outras parcelas; serve de alerta."""
    saida: dict = {}
    for rede, g in df[df["eh_post"]].groupby("rede", dropna=True):
        ambos = g["engajamento_parcial"].notna() & g["interacoes_planilha"].notna()
        item: dict = {"n_comparados": int(ambos.sum())}
        if ambos.any():
            dif = (g.loc[ambos, "engajamento_parcial"] - g.loc[ambos, "interacoes_planilha"]).abs()
            item["interacoes_iguais_pct"] = round(float((dif == 0).mean() * 100), 1)
        ta = g["taxa_engajamento"].notna() & g["taxa_planilha"].notna()
        if ta.any():
            dpp = (g.loc[ta, "taxa_engajamento"] - g.loc[ta, "taxa_planilha"]).abs()
            item["taxa_dif_mediana_pp"] = round(float(dpp.median()), 4)
        saida[rede] = item
    return saida
