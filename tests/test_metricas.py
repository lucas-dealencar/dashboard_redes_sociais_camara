import pandas as pd

from src.transformacao.limpeza import limpar
from src.transformacao.metricas import (
    adicionar_metricas, agregado_conteudos, crescimento_seguidores, taxa_consolidada,
    variacao_pct, variacao_pp,
)
from src.transformacao.publicacoes import preparar_publicacoes


def _base(bruto):
    df, _ = limpar(bruto)
    df, _ = preparar_publicacoes(df)
    return adicionar_metricas(df)


def test_engajamento_e_taxa_com_denominador(bruto):
    df = _base(bruto)
    ig = df[df["link"] == "https://ig.com/1"].iloc[0]  # 10+2+3 (salvos fora) sobre alcance 100
    assert ig["engajamento"] == 15
    assert ig["denominador_tipo"] == "alcance"
    assert ig["taxa_engajamento"] == 15.0


def test_sem_alcance_usa_impressoes_e_sem_parcelas_fica_na(bruto):
    df = _base(bruto)
    bs = df[df["link"] == "https://bs.com/1"].iloc[0]
    assert pd.isna(bs["engajamento"])            # NA, não 0
    assert bs["denominador_tipo"] == "impressões"
    assert pd.isna(bs["taxa_engajamento"])


def test_variacao_anterior_zero_nao_calculavel():
    assert variacao_pct(10, 0) is None
    assert variacao_pct(10, None) is None
    assert variacao_pct(110, 100) == 10.0
    assert variacao_pct(50, 100) == -50.0
    assert variacao_pp(12.5, 10.0) == 2.5
    assert crescimento_seguidores(50, 1000) == 5.0
    assert crescimento_seguidores(50, 0) is None


def test_taxa_consolidada_so_com_bases_compativeis():
    df = pd.DataFrame({
        "engajamento": pd.array([10, 20], dtype="Float64"),
        "denominador_valor": pd.array([100, 300], dtype="Float64"),
        "denominador_tipo": ["alcance", "alcance"],
    })
    r = taxa_consolidada(df)
    assert r["taxa"] == 30 / 400 * 100 and r["denominador_tipo"] == "alcance"
    df.loc[1, "denominador_tipo"] = "impressões"
    r = taxa_consolidada(df)
    assert r["taxa"] is None and "incompat" in r["motivo"]


def test_agregado_traz_n_inclusive_grupo_de_um_post(bruto):
    df = _base(bruto)
    ag = agregado_conteudos(df)
    assert (ag["n"] >= 1).all()
    linha = ag[(ag["rede"] == "Bluesky")].iloc[0]
    assert linha["n"] == 1 and linha["engajamento_n"] == 0 and pd.isna(linha["engajamento_mediana"])
