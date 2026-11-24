"""Benchmark interno: janela móvel ANTES do período avaliado, com mediana e quartis.

- O período avaliado é excluído da janela.
- Sinal: abaixo (< Q1), dentro, acima (> Q3); "amostra insuficiente" com menos de `N_MINIMO`
  publicações na janela.
- Boxplot: além de Q1/mediana/Q3, `lim_inf`/`lim_sup` (bigodes 1,5×IQR) e `outliers`.
- Por rede e, dentro de cada rede, por formato (análise editorial).
- Maturidade: a planilha traz um único retrato das métricas (sem data de coleta), então a
  comparação em "idade equivalente" é aproximada excluindo do avaliado os posts mais novos que
  `IDADE_MINIMA_METRICA_DIAS` (ainda acumulando métrica). O volume (publicações) conta todos.
- Janelas alternativas (30/60/180 dias) são calculadas em `alternativas` para o front alternar
  a janela de referência sem recalcular.
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
        return {"n": 0, "mediana": None, "media": None, "q1": None, "q3": None,
                "lim_inf": None, "lim_sup": None, "outliers": 0}
    q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
    iqr = q3 - q1
    dentro = s[(s >= q1 - 1.5 * iqr) & (s <= q3 + 1.5 * iqr)]
    return {
        "n": int(len(s)), "mediana": float(s.median()), "media": float(s.mean()),
        "q1": q1, "q3": q3,
        "lim_inf": float(dentro.min()), "lim_sup": float(dentro.max()),
        "outliers": int(len(s) - len(dentro)),
    }


def _bloco_metricas(j: pd.DataFrame, a: pd.DataFrame) -> dict:
    """Estatísticas da janela (j) e do avaliado (a) por métrica, com o sinal."""
    saida = {}
    for m in METRICAS:
        ej, ea = _estatisticas(j[m]), _estatisticas(a[m])
        sinal = "amostra insuficiente" if ej["n"] < N_MINIMO else _classificar(ea["mediana"], ej["q1"], ej["q3"])
        saida[m] = {"janela": ej, "avaliado": ea, "sinal": sinal}
    return saida


def calcular_benchmark(df: pd.DataFrame, janela_dias: int, periodo_dias: int) -> dict:
    """Avalia os últimos `periodo_dias` de dados contra os `janela_dias` anteriores a eles."""
    posts = df[df["eh_post"]]
    fim = posts["data"].max()
    inicio_aval = fim - pd.Timedelta(days=periodo_dias - 1)
    inicio_jan = inicio_aval - pd.Timedelta(days=janela_dias)
    aval = posts[posts["data"] >= inicio_aval]
    janela = posts[(posts["data"] >= inicio_jan) & (posts["data"] < inicio_aval)]  # exclui o avaliado

    imaturos = 0
    aval_metricas = aval
    if "metrica_madura" in aval:
        aval_metricas = aval[aval["metrica_madura"]]
        imaturos = int(len(aval) - len(aval_metricas))

    redes: dict = {}
    for rede in sorted(posts["rede"].dropna().unique()):
        j, a_all = janela[janela["rede"] == rede], aval[aval["rede"] == rede]
        a = aval_metricas[aval_metricas["rede"] == rede]
        bloco = _bloco_metricas(j, a)
        bloco["publicacoes"] = {
            "janela": len(j), "avaliado": len(a_all),
            "por_dia_janela": len(j) / janela_dias, "por_dia_avaliado": len(a_all) / periodo_dias,
        }
        if "formato" in posts:
            bloco["por_formato"] = {
                f: {**_bloco_metricas(j[j["formato"] == f], a[a["formato"] == f]),
                    "publicacoes": {"janela": int((j["formato"] == f).sum()),
                                    "avaliado": int((a_all["formato"] == f).sum())}}
                for f in sorted(set(j["formato"]) | set(a_all["formato"]))
            }
        redes[rede] = bloco

    return {
        "janela_dias": janela_dias,
        "periodo_avaliado": {"inicio": inicio_aval.date().isoformat(), "fim": fim.date().isoformat()},
        "periodo_janela": {
            "inicio": inicio_jan.date().isoformat(),
            "fim": (inicio_aval - pd.Timedelta(days=1)).date().isoformat(),
        },
        "n_minimo": N_MINIMO,
        "posts_imaturos_fora_do_avaliado": imaturos,
        "observacoes": [
            "Período avaliado excluído da janela.",
            "Idade equivalente aproximada: posts muito recentes ficam fora das medianas do avaliado.",
            "Algumas métricas não existem em todas as redes: ver `cobertura` e `kpi_por_rede`.",
        ],
        "redes": redes,
    }


def benchmark_com_alternativas(df: pd.DataFrame, janela_dias: int, periodo_dias: int,
                               alternativas: tuple[int, ...]) -> dict:
    """Benchmark da janela padrão + `alternativas` por duração de janela (chave = dias)."""
    principal = calcular_benchmark(df, janela_dias, periodo_dias)
    principal["alternativas"] = {
        str(j): calcular_benchmark(df, j, periodo_dias) for j in alternativas if j != janela_dias
    }
    return principal
