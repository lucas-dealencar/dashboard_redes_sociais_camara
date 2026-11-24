"""Transformações que atendem à proposta com o que a planilha realmente traz."""
import pandas as pd

from src.transformacao.benchmark import _estatisticas, benchmark_com_alternativas
from src.transformacao.cobertura import cobertura_metricas, kpi_por_rede
from src.transformacao.limpeza import limpar
from src.transformacao.metricas import adicionar_metricas, agregado_conteudos, resumo_diario
from src.transformacao.publicacoes import _chave_link, preparar_publicacoes


def _l(n, link, rede="Instagram", data="11 de dezembro de 2025", **kw):
    base = {
        "linha_planilha": n, "01 - Data": data, "02 - Rede": rede, "Post - Link": link,
        "Tipo de mídia": "Vídeo", "Rede Local Post": "Feed", "Ao vivo?": "Não",
        "Prop 1 - Tema": "Saúde", "Mtrc - Curtidas": 10, "Mtrc - Comentários": 2,
        "Mtrc - Compartilhar": 3, "Mtrc - Alcance": 100,
    }
    base.update(kw)
    return base


def _pronto(linhas):
    df, _ = limpar(pd.DataFrame(linhas))
    df, rel = preparar_publicacoes(df)
    return df, rel


def test_chave_link_unifica_x_twitter_e_ignora_query():
    assert _chave_link("https://twitter.com/camaradeputados/status/1?s=20") == _chave_link(
        "https://www.x.com/camaradeputados/status/1/"
    )
    assert _chave_link("https://www.youtube.com/watch?v=abc&t=3") == "youtube.com/watch?v=abc"


def test_dedup_prefere_linha_completa_mesmo_sendo_a_primeira():
    vazia = _l(9, "https://x.com/a/status/1", **{"Mtrc - Alcance": None, "Mtrc - Curtidas": None,
                                                  "Mtrc - Comentários": None, "Mtrc - Compartilhar": None})
    cheia = _l(5, "https://twitter.com/a/status/1")  # mesmo post, outro host
    df, rel = _pronto([cheia, vazia])
    assert len(df) == 1 and df.iloc[0]["alcance"] == 100
    assert rel["duplicados_removidos"] == 1 and rel["duplicados_por_normalizacao"] == 1


def test_shorts_e_stories_viram_canal_e_formato():
    df, _ = _pronto([
        _l(2, "https://y.com/watch?v=1", rede="Youtube"),
        _l(3, "https://y.com/watch?v=2", rede="Youtube", **{"Rede Local Post": "Shorts - YouTube"}),
        _l(4, "123", **{"Rede Local Post": "Stories - Instagram", "Tipo de mídia": "Imagem estática"}),
        _l(5, "https://instagram.com/reel/x/", **{"Tipo de mídia": "Vídeo - Colab"}),
        _l(6, "https://instagram.com/p/y/", **{"Tipo de mídia": "Imagem dinâmica"}),
    ])
    por_link = df.set_index("link")
    assert por_link.loc["https://y.com/watch?v=1", ["rede", "formato"]].tolist() == ["YouTube", "Vídeo longo"]
    assert por_link.loc["https://y.com/watch?v=2", ["rede", "formato"]].tolist() == ["YouTube Shorts", "Vídeo curto/Reels"]
    assert por_link.loc["123", "formato"] == "Stories"
    reel = por_link.loc["https://instagram.com/reel/x/"]
    assert reel["formato"] == "Vídeo curto/Reels" and reel["formato_nativo"] == "Vídeo" and reel["colab"]
    assert por_link.loc["https://instagram.com/p/y/", "formato"] == "Imagem"  # nativo preservado:
    assert por_link.loc["https://instagram.com/p/y/", "formato_nativo"] == "Imagem dinâmica"


def test_tema_normaliza_caixa_e_descarta_lixo():
    df, rel = _pronto([
        _l(2, "a", **{"Prop 1 - Tema": "EConomia"}),
        _l(3, "b", **{"Prop 1 - Tema": "Cadastrar na Tabela Excel", "Prop 2 - Tema": "saúde"}),
        _l(4, "c", **{"Prop 1 - Tema": "PEC 8/2025 8 2025/PEC 8/2025"}),
        _l(5, "d", **{"Prop 1 - Tema": "Direitos humanos", "Prop 2 - Tema": "Economia"}),
    ])
    t = df.set_index("link")
    assert t.loc["a", "tema"] == "Economia"
    assert t.loc["b", "tema"] == "Saúde"            # lixo no principal: cai para o secundário válido
    assert t.loc["c", "tema"] == "Sem tema"
    assert t.loc["d", "tema"] == "Direitos humanos" and t.loc["d", "tema_secundario"] == "Economia"
    assert "Cadastrar na Tabela Excel" in rel["temas_invalidos"]


def test_perfil_so_quando_o_link_traz():
    df, _ = _pronto([
        _l(2, "https://x.com/CamaraDeputados/status/1", rede="Rede X"),
        _l(3, "https://www.threads.com/@camaradosdeputados/post/x", rede="Threads"),
        _l(4, "https://www.facebook.com/reel/123", rede="Facebook"),
        _l(5, "https://instagram.com/p/y/"),
    ])
    assert df["perfil"].tolist()[:2] == ["camaradeputados", "camaradosdeputados"]
    assert df["perfil"].iloc[2:].isna().all()


def test_engajamento_incompleto_fica_na_e_nao_vira_taxa():
    df, _ = _pronto([
        _l(2, "a"),
        _l(3, "b", **{"Mtrc - Curtidas": None}),  # stories: sem curtidas
    ])
    df = adicionar_metricas(df).set_index("link")
    assert df.loc["a", "engajamento"] == 15 and df.loc["a", "engajamento_completo"]
    assert pd.isna(df.loc["b", "engajamento"]) and not df.loc["b", "engajamento_completo"]
    assert df.loc["b", "engajamento_parcial"] == 5 and pd.isna(df.loc["b", "taxa_engajamento"])


def test_maturidade_marca_posts_recentes():
    df, _ = _pronto([
        _l(2, "a", data="1 de dezembro de 2025"),
        _l(3, "b", data="12 de dezembro de 2025"),
        _l(4, "c", data="14 de dezembro de 2025"),
    ])
    assert df.set_index("link")["metrica_madura"].to_dict() == {"a": True, "b": False, "c": False}


def test_resumo_diario_traz_parcelas_e_base_da_taxa():
    df, _ = _pronto([_l(2, "a"), _l(3, "b", **{"Mtrc - Curtidas": None})])
    r = resumo_diario(adicionar_metricas(df)).iloc[0]
    assert r["posts"] == 2 and r["posts_com_alcance"] == 2 and r["posts_engajamento"] == 1
    assert r["alcance"] == 200 and r["engajamento"] == 15
    assert r["taxa_num"] == 15 and r["taxa_den"] == 100  # só o post com engajamento completo
    assert pd.isna(r["seguidores"]) and pd.isna(r["salvos"])  # indisponível != 0


def test_agregado_taxa_consolidada_e_soma_sobre_soma():
    df, _ = _pronto([
        _l(2, "a", **{"Mtrc - Curtidas": 8, "Mtrc - Comentários": 1, "Mtrc - Compartilhar": 1, "Mtrc - Alcance": 100}),
        _l(3, "b", **{"Mtrc - Curtidas": 0, "Mtrc - Comentários": 0, "Mtrc - Compartilhar": 0, "Mtrc - Alcance": 900}),
    ])
    ag = agregado_conteudos(adicionar_metricas(df)).iloc[0]
    assert ag["taxa_consolidada"] == 10 / 1000 * 100  # não é a média das taxas (5%)
    assert ag["taxa_consolidada_n"] == 2


def test_cobertura_e_kpi_com_substituto_e_rede_sem_dados():
    linhas = [_l(i, f"x{i}", rede="Rede X") for i in range(2, 8)]
    df, _ = _pronto(linhas)
    cob = cobertura_metricas(adicionar_metricas(df))
    assert cob["X"]["metricas"]["impressoes"]["status"] == "indisponível"
    assert cob["X"]["metricas"]["alcance"]["status"] == "disponível"
    kpis = kpi_por_rede(cob)
    assert kpis["X"]["kpi_proposto"] == "impressoes" and kpis["X"]["kpi_usado"] == "alcance" and kpis["X"]["substituto"]
    assert kpis["TikTok"]["situacao"] == "sem_dados"


def test_boxplot_bigodes_e_outlier():
    e = _estatisticas(pd.Series([10, 11, 12, 13, 14, 15, 1000], dtype="Float64"))
    assert e["outliers"] == 1 and e["lim_sup"] == 15 and e["lim_inf"] == 10


def test_benchmark_por_formato_janelas_alternativas_e_maturidade():
    linhas = [_l(i, f"j{i}", rede="Rede X", data=f"{d} de outubro de 2025",
                 **{"Mtrc - Alcance": 100 + i}) for i, d in zip(range(2, 12), range(1, 11))]
    linhas += [_l(20, "novo", rede="Rede X", data="30 de novembro de 2025", **{"Mtrc - Alcance": 5000}),
               _l(21, "recem", rede="Rede X", data="1 de dezembro de 2025", **{"Mtrc - Alcance": 9000})]
    df, _ = _pronto(linhas)
    df = adicionar_metricas(df)
    b = benchmark_com_alternativas(df, 90, 10, (30, 60))
    x = b["redes"]["X"]
    assert "Vídeo" in x["por_formato"] and set(b["alternativas"]) == {"30", "60"}
    assert b["posts_imaturos_fora_do_avaliado"] == 2   # 30/11 e 01/12 têm menos de 7 dias
    assert x["publicacoes"]["avaliado"] == 2           # volume conta todos
    assert x["alcance"]["avaliado"]["n"] == 0          # medianas só com posts maduros
