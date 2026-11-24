import pandas as pd

from src.transformacao.limpeza import (
    _para_data, _para_float, _para_percentual, _normalizar_rede, limpar,
)
from src.transformacao.publicacoes import preparar_publicacoes


def test_data_por_extenso_sem_locale():
    assert _para_data("11 de dezembro de 2024") == pd.Timestamp(2024, 12, 11)
    assert _para_data("1 de março de 2025") == pd.Timestamp(2025, 3, 1)


def test_data_outros_formatos_e_invalidos():
    assert _para_data("45000") == pd.Timestamp(2023, 3, 15)  # serial do Sheets
    assert _para_data(45000.0) == pd.Timestamp(2023, 3, 15)
    assert _para_data("05/04/2025") == pd.Timestamp(2025, 4, 5)  # dd/mm
    assert pd.isna(_para_data("lixo"))
    assert pd.isna(_para_data(None))


def test_percentual_texto_e_fracao():
    assert _para_percentual("14%") == 14.0
    assert _para_percentual("14,5%") == 14.5
    assert _para_percentual(0.14) == 14.0
    assert _para_percentual(35) == 35


def test_milhar_com_ponto_e_nulos():
    assert _para_float("2.253") == 2253.0
    assert _para_float("1.234.567") == 1234567.0
    assert _para_float("1,5") == 1.5
    assert _para_float(7) == 7.0
    for nulo in (None, "", "-", float("nan")):
        assert _para_float(nulo) is None


def test_zero_e_diferente_de_vazio(bruto):
    df, _ = limpar(bruto)
    assert df["salvos"].isna().sum() == len(df) - 1  # só uma linha tem salvos
    bruto.loc[0, "Mtrc - Curtidas"] = 0
    df, _ = limpar(bruto)
    assert df["curtidas"].iloc[0] == 0 and not pd.isna(df["curtidas"].iloc[0])
    assert pd.isna(df["curtidas"].iloc[4])  # vazio continua NA


def test_rede_normalizada():
    assert _normalizar_rede("Rede X") == "X"
    assert _normalizar_rede("Rede Instagram") == "Instagram"


def test_limpar_mapeia_colunas_e_tipos(bruto):
    df, rel = limpar(bruto)
    assert df["data"].dtype.kind == "M"
    assert df["rede"].iloc[0] == "X"
    assert df["impressoes"].iloc[4] == 2253
    assert df["taxa_planilha"].iloc[5] == 14.0
    assert rel["linhas_entrada"] == 6
    assert "visualizacoes" in df.columns


def test_deduplica_por_link_mantendo_ultimo(bruto):
    df, _ = limpar(bruto)
    df, rel = preparar_publicacoes(df)
    assert rel["duplicados_removidos"] == 1
    assert rel["linhas_sem_link"] == 1
    x = df[df["link"] == "https://x.com/1"]
    assert len(x) == 1 and x["curtidas"].iloc[0] == 20
    assert df["link"].dropna().is_unique
