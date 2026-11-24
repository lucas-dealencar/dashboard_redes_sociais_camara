"""Lê SÓ a linha 1 da aba Consolidado e compara com config/colunas.py.

  python scripts/inspecionar_cabecalho.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.colunas import COLUNAS_OBRIGATORIAS, MAPA_COLUNAS  # noqa: E402
from src import config  # noqa: E402
from src.coleta import _abrir_aba  # noqa: E402

ws = _abrir_aba(config.SPREADSHEET_ID, config.ABA_CONSOLIDADO)
cab = [str(c).strip() for c in ws.row_values(1)]
print(f"{len(cab)} colunas; {ws.row_count} linhas na grade.\n")
for i, nome in enumerate(cab):
    marca = "mapeada" if nome in MAPA_COLUNAS else "-"
    print(f"{i:3d}  {nome!r:55} {marca}")
print("\nNo mapa mas ausentes na planilha:")
for nome in MAPA_COLUNAS:
    if nome not in cab:
        print(f"  {nome!r}" + ("  <-- OBRIGATÓRIA" if nome in COLUNAS_OBRIGATORIAS else ""))
