import pandas as pd
import pytest

from src.transformacao.limpeza import limpar
from src.transformacao.metricas import adicionar_metricas
from src.transformacao.publicacoes import preparar_publicacoes
from src.transformacao.validacao import ErroValidacao, _validar, _validar_taxas


def _pronto(bruto):
    df, _ = limpar(bruto)
    df, _ = preparar_publicacoes(df)
    return df


def _multiplicar(bruto, copias):
    """Repete a amostra com links únicos por linha (evita a deduplicação)."""
    g = pd.concat([bruto] * copias).reset_index(drop=True)
    g["Post - Link"] = [f"https://l.com/{i}" for i in range(len(g))]
    g["linha_planilha"] = range(2, 2 + len(g))
    return g


def test_aprova_amostra_valida(bruto):
    df, avisos = _validar(_pronto(bruto))
    assert len(df) == 5 and avisos == []


def test_data_invalida_abaixo_do_limite_exclui_com_aviso(bruto):
    grande = _multiplicar(bruto, 10)  # 60 linhas
    grande.loc[0, "01 - Data"] = "lixo"  # 1,7% < 5%
    df, avisos = _validar(_pronto(grande))
    assert any("data" in a for a in avisos)
    assert len(df) == 59 and df["data"].notna().all()


def test_data_invalida_acima_do_limite_falha_com_linha_e_coluna(bruto):
    grande = _multiplicar(bruto, 2)
    grande["01 - Data"] = "lixo"
    with pytest.raises(ErroValidacao) as e:
        _validar(_pronto(grande))
    assert "linha 2" in str(e.value) and "01 - Data" in str(e.value)


def test_negativo_em_contagem_reprova(bruto):
    grande = _multiplicar(bruto, 1)
    grande.loc[0, "Mtrc - Curtidas"] = -3
    with pytest.raises(ErroValidacao, match="negativo"):
        _validar(_pronto(grande))


def test_taxa_fora_de_0_100_e_anulada_com_aviso(bruto):
    grande = _multiplicar(bruto, 30)
    grande.loc[0, "Mtrc - Curtidas"] = 5000  # engajamento >> alcance -> taxa > 100
    df, _ = _validar(_pronto(grande))
    df = adicionar_metricas(df)
    df, avisos = _validar_taxas(df)
    assert avisos and df["taxa_engajamento"].dropna().between(0, 100).all()
