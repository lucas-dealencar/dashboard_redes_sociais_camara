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
