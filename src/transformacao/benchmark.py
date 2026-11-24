"""Benchmark interno: janela móvel (90 dias) ANTES do período avaliado, com mediana e quartis.

O período avaliado é excluído da janela. Sinal: abaixo (< Q1), dentro, acima (> Q3);
"amostra insuficiente" com menos de `N_MINIMO` publicações na janela.
Limitação: a comparação de posts em idade equivalente exige data de coleta das métricas,
que a planilha não traz; o benchmark compara medianas por publicação por período.
"""
import pandas as pd

METRICAS = ["engajamento", "taxa_engajamento", "alcance"]
N_MINIMO = 5


def _classificar(valor, q1, q3) -> str | None:
    if valor is None or q1 is None or q3 is None or pd.isna(valor):
        return None
    if valor < q1:
        return "abaixo"
    if valor > q3:
        return "acima"
    return "dentro"


def _estatisticas(serie: pd.Series) -> dict:
    s = serie.dropna().astype(float)
    if s.empty:
        return {"n": 0, "mediana": None, "media": None, "q1": None, "q3": None}
    return {
        "n": int(len(s)), "mediana": float(s.median()), "media": float(s.mean()),
        "q1": float(s.quantile(0.25)), "q3": float(s.quantile(0.75)),
    }


def calcular_benchmark(df: pd.DataFrame, janela_dias: int, periodo_dias: int) -> dict:
    """Avalia os últimos `periodo_dias` de dados contra os `janela_dias` anteriores a eles."""
    posts = df[df["eh_post"]]
    fim = posts["data"].max()
    inicio_aval = fim - pd.Timedelta(days=periodo_dias - 1)
    inicio_jan = inicio_aval - pd.Timedelta(days=janela_dias)
    aval = posts[posts["data"] >= inicio_aval]
    janela = posts[(posts["data"] >= inicio_jan) & (posts["data"] < inicio_aval)]  # exclui o avaliado

    redes: dict = {}
    for rede in sorted(posts["rede"].dropna().unique()):
        a, j = aval[aval["rede"] == rede], janela[janela["rede"] == rede]
        por_metrica = {}
        for m in METRICAS:
            ej, ea = _estatisticas(j[m]), _estatisticas(a[m])
            sinal = "amostra insuficiente" if ej["n"] < N_MINIMO else _classificar(
                ea["mediana"], ej["q1"], ej["q3"]
            )
            por_metrica[m] = {"janela": ej, "avaliado": ea, "sinal": sinal}
        por_metrica["publicacoes"] = {
            "janela": len(j), "avaliado": len(a),
            "por_dia_janela": len(j) / janela_dias, "por_dia_avaliado": len(a) / periodo_dias,
        }
        redes[rede] = por_metrica
    return {
        "janela_dias": janela_dias,
        "periodo_avaliado": {"inicio": inicio_aval.date().isoformat(), "fim": fim.date().isoformat()},
        "periodo_janela": {
            "inicio": inicio_jan.date().isoformat(),
            "fim": (inicio_aval - pd.Timedelta(days=1)).date().isoformat(),
        },
        "n_minimo": N_MINIMO,
        "observacoes": [
            "Período avaliado excluído da janela.",
            "Comparação por idade equivalente indisponível: a planilha não traz a data de coleta das métricas.",
        ],
        "redes": redes,
    }
