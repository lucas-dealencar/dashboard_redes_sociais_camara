"""Mede tempo, nº de linhas e tamanho do payload da leitura da planilha (não grava cache).

  python scripts/benchmark_coleta.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.coleta import _coletar_sheets  # noqa: E402

t0 = time.time()
df = _coletar_sheets.fn()
seg = time.time() - t0
mb = df.memory_usage(deep=True).sum() / 1e6
print(f"\nLinhas: {len(df)} | colunas: {df.shape[1]} | tempo: {seg:.1f}s | memória: {mb:.1f} MB")
print("Meta: < ~3 min; acima disso, considerar leitura incremental.")
