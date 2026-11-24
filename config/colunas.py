"""Mapa coluna da planilha -> nome interno.

Os nomes da origem são EXATOS (inclusive typos como `Engamento`). Para conferir o
cabeçalho real, rode `python scripts/inspecionar_cabecalho.py`.
Colunas do mapa ausentes na planilha geram aviso; só as OBRIGATÓRIAS derrubam a coleta.
"""

ABAS_ESPERADAS = ["Consolidado"]

COLUNAS_OBRIGATORIAS = ["Post - Link", "01 - Data", "02 - Rede"]

MAPA_COLUNAS = {
    # Post
    "01 - Data": "data",
    "02 - Rede": "rede",
    "Post - Link": "link",
    "Post - Descrição": "descricao",
    "Projeto?": "projeto",
    "Rede Local Post": "rede_local",
    "Ao vivo?": "ao_vivo",
    "Tipo de mídia": "formato",
    "Tipo Classificação": "tipo_classificacao",
    "Subtipo Classificação": "subtipo_classificacao",
    "Autor": "autor",
    "Tag Brandwatch": "tag_brandwatch",
    # Proposições (até 2 por post) — confirmar nomes exatos com o inspecionador
    "Prop 1 - Sigla": "prop1_sigla",
    "Prop 1 - Tema": "prop1_tema",
    "Prop 2 - Sigla": "prop2_sigla",
    "Prop 2 - Tema": "prop2_tema",
    # Conta
    "Seguidores acumulado": "seguidores",
    "Seguidores Evolução Novos": "seguidores_novos",
    # Métricas comuns
    "Mtrc - Alcance": "alcance",
    "Mtrc - Compartilhar": "compartilhamentos",
    "Mtrc - Comentários": "comentarios",
    "Mtrc - Curtidas": "curtidas",
    # Específicas
    "Instagram - Salvos": "salvos",
    "Twitter - Click no link": "cliques_link",
    "Twitter - Engamento": "engajamento_x",  # typo da origem, mantido
    "YT & Shorts - Impressões": "impressoes",
    "YT & Shorts - Gostei": "gostei",
    "YT & Shorts - Não gostei": "nao_gostei",
    "YT & Shorts - Porc. Visual. Média (%)": "pct_visualizacao_media",
    # Calculadas na planilha (apenas conferência; o pipeline recalcula)
    "Mtrc/Calc - Interações": "interacoes_planilha",
    "Mtrc/Calc - Taxa Engajamento": "taxa_planilha",
}

# Grupos para a tipagem (nomes internos)
COLUNAS_NUMERICAS = [
    "seguidores", "seguidores_novos", "alcance", "compartilhamentos", "comentarios",
    "curtidas", "salvos", "cliques_link", "engajamento_x", "impressoes", "gostei",
    "nao_gostei", "interacoes_planilha",
    "visualizacoes",  # sem coluna mapeada ainda: fica NA até a origem trazer (TikTok/Threads)
]
COLUNAS_PERCENTUAIS = ["pct_visualizacao_media", "taxa_planilha"]
COLUNAS_TEXTO = [
    "link", "descricao", "projeto", "rede_local", "ao_vivo", "formato",
    "tipo_classificacao", "subtipo_classificacao", "autor", "tag_brandwatch",
    "prop1_sigla", "prop1_tema", "prop2_sigla", "prop2_tema",
]
