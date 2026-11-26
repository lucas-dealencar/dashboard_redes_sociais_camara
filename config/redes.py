"""Redes, ordem de exibição e KPI principal por rede.

O KPI principal de todas as redes é o engajamento (decisão da equipe em nov/2026; substitui os
KPIs por rede da proposta, como alcance no Instagram). `kpi` é o nome interno da medida.
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
    rede: "engajamento"
    for rede in [*ORDEM_REDES, "Kwai", "Pinterest"]
}

# Redes do escopo da proposta (seção 2). As que não aparecem na planilha são reportadas
# como "sem dados" em vez de sumirem em silêncio.
REDES_ESCOPO = ["Instagram", "Facebook", "TikTok", "X", "Threads", "Bluesky", "LinkedIn"]

# Quando a planilha não traz engajamento para a rede, usa-se o primeiro substituto com dado,
# SEMPRE sinalizado como substituto (`kpi_por_rede` no benchmark.json).
KPI_SUBSTITUTOS: dict[str, list[str]] = {}
KPI_SUBSTITUTO_PADRAO = ["alcance", "impressoes", "visualizacoes"]
