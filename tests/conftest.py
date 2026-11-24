import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _linha(n, data, rede, link, **kw):
    base = {
        "linha_planilha": n, "01 - Data": data, "02 - Rede": rede, "Post - Link": link,
        "Tipo de mídia": "Vídeo", "Prop 1 - Tema": "Saúde",
        "Mtrc - Curtidas": 10, "Mtrc - Comentários": 2, "Mtrc - Compartilhar": 3, "Mtrc - Alcance": 100,
        "Seguidores acumulado": 1000, "Seguidores Evolução Novos": 5,
    }
    base.update(kw)
    return base


@pytest.fixture
def bruto():
    """Amostra pequena no formato da coleta (nomes da origem)."""
    linhas = [
        _linha(2, "11 de dezembro de 2025", "Rede X", "https://x.com/1"),
        _linha(3, "12 de dezembro de 2025", "Instagram", "https://ig.com/1", **{"Instagram - Salvos": 4}),
        _linha(4, "45000", "Instagram", "https://ig.com/2"),          # serial do Sheets
        _linha(5, "11 de dezembro de 2025", "Rede X", "https://x.com/1", **{"Mtrc - Curtidas": 20}),  # link duplicado
        _linha(6, "13 de dezembro de 2025", "Bluesky", "https://bs.com/1",
               **{"Mtrc - Alcance": None, "YT & Shorts - Impressões": "2.253", "Mtrc - Curtidas": None,
                  "Mtrc - Comentários": None, "Mtrc - Compartilhar": None}),
        _linha(7, "14 de dezembro de 2025", "Facebook", None, **{"Mtrc/Calc - Taxa Engajamento": "14%"}),
    ]
    return pd.DataFrame(linhas)
