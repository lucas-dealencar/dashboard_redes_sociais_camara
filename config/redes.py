"""Redes, ordem de exibição e KPI principal por rede.

KPIs de Instagram e TikTok são requisito da proposta; os demais estão a validar.
`kpi` é o nome interno da coluna/medida usada como destaque.
"""

# Prefixo/variações da origem -> nome canônico
NOMES_CANONICOS = {
    "rede x": "X",
    "x": "X",
    "twitter": "X",
    "x (twitter)": "X",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "tiktok": "TikTok",
    "threads": "Threads",
    "bluesky": "Bluesky",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
    "shorts": "YouTube Shorts",
    "youtube shorts": "YouTube Shorts",
}

ORDEM_REDES = [
    "Instagram", "Facebook", "TikTok", "X", "Threads", "Bluesky", "LinkedIn",
    "YouTube", "YouTube Shorts",
]

KPI_PRINCIPAL = {
    "Instagram": "alcance",
    "Facebook": "alcance",
    "TikTok": "visualizacoes",
    "X": "impressoes",
    "Threads": "visualizacoes",
    "Bluesky": "engajamento",
    "LinkedIn": "impressoes",
}

# Redes do escopo da proposta (seção 2). As que não aparecem na planilha são reportadas
# como "sem dados" em vez de sumirem em silêncio.
REDES_ESCOPO = ["Instagram", "Facebook", "TikTok", "X", "Threads", "Bluesky", "LinkedIn"]

# Quando o KPI proposto não existe na planilha para a rede, usa-se o primeiro substituto com
# dado, SEMPRE sinalizado como substituto (`kpi_por_rede` no benchmark.json).
# Padrão para redes sem entrada: alcance -> impressões -> visualizações -> engajamento.
KPI_SUBSTITUTOS = {
    "X": ["alcance"],          # impressões não vêm da planilha; "Mtrc - Alcance" é o mais próximo (validar)
    "Threads": ["alcance"],    # visualizações não vêm da planilha (validar)
    "TikTok": ["alcance"],
    "LinkedIn": ["alcance"],
    "Bluesky": [],
}
KPI_SUBSTITUTO_PADRAO = ["alcance", "impressoes", "visualizacoes", "engajamento"]
