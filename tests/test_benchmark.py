import pandas as pd

from src.transformacao.benchmark import calcular_benchmark


def _df(datas_valores):
    return pd.DataFrame({
        "data": pd.to_datetime([d for d, _ in datas_valores]),
        "rede": "X",
        "eh_post": True,
        "engajamento": pd.array([v for _, v in datas_valores], dtype="Float64"),
        "taxa_engajamento": pd.array([v for _, v in datas_valores], dtype="Float64"),
        "alcance": pd.array([v for _, v in datas_valores], dtype="Float64"),
    })


def test_janela_exclui_periodo_avaliado_e_classifica():
    jan = [(f"2025-10-{d:02d}", v) for d, v in zip(range(1, 11), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])]
    aval = [("2025-12-01", 100), ("2025-12-02", 120)]  # muito acima do Q3 da janela
    r = calcular_benchmark(_df(jan + aval), janela_dias=90, periodo_dias=10)
    x = r["redes"]["X"]["engajamento"]
    assert r["periodo_avaliado"]["fim"] == "2025-12-02"
    assert x["janela"]["n"] == 10          # os valores do avaliado NÃO entram
    assert x["janela"]["mediana"] == 14.5
    assert x["avaliado"]["n"] == 2
    assert x["sinal"] == "acima"


def test_amostra_insuficiente():
    df = _df([("2025-10-01", 5), ("2025-12-01", 6)])
    r = calcular_benchmark(df, janela_dias=90, periodo_dias=10)
    assert r["redes"]["X"]["engajamento"]["sinal"] == "amostra insuficiente"
