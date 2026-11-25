"""Configuração central: planilha, caminhos, janelas e limites."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Google Sheets (somente leitura) --- #
CAMINHO_CREDENCIAIS = BASE_DIR / "src" / "credentials.json"  # nunca versionar
# ID da planilha "Consolidado Redes Sociais - Simplificado": informe por variável de ambiente.
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "1nucAY1rCnKG-lYPMhxRFJQm7U4GV4JrtFntameyFepE")
ABA_CONSOLIDADO = "Consolidado"
GID_CONSOLIDADO = os.getenv("GID_CONSOLIDADO", "1568822592")  # id fixo da aba Consolidado (o `gid` da URL); não muda se renomear
URL_EXPORTACAO = "https://docs.google.com/spreadsheets/d/{id}/export"

# Planilha qualitativa (opcional): se falhar, o flow segue sem ela.
SPREADSHEET_ID_QUALITATIVO = os.getenv("SPREADSHEET_ID_QUALITATIVO", "")
ABA_ANOTACOES = "anotacoes"

# --- Cache (gitignored) --- #
PASTA_CACHE = BASE_DIR / "cache"
ARQUIVO_BRUTO = PASTA_CACHE / "bruto.parquet"
ARQUIVO_ESTADO = PASTA_CACHE / "estado.json"

# --- Saída (versionada e publicada) --- #
PASTA_SITE = BASE_DIR / "docs"
PASTA_DADOS = PASTA_SITE / "dados"
PASTA_PUBLICACOES = PASTA_DADOS / "publicacoes"
VERSAO_ESQUEMA = 1

# --- Regras --- #
JANELA_MESES_POSTS = 12
JANELA_BENCHMARK_DIAS = 90
PERIODO_AVALIADO_DIAS = 30  # período avaliado por padrão: últimos N dias de dados
DATA_MINIMA_PLAUSIVEL = "2015-01-01"
LIMITE_DATAS_INVALIDAS = 0.05  # acima de 5% de linhas com data inválida, a validação falha

# Tamanhos-alvo (bytes) por arquivo de `docs/dados/`
TAMANHOS_ALVO = {
    "manifest.json": 5 * 1024,
    "resumo_diario.json": int(1.5 * 1024 * 1024),
    "benchmark.json": 200 * 1024,
    "conteudos_agregado.json": 500 * 1024,
    "anotacoes.json": 50 * 1024,
    "dicionario_metricas.json": 50 * 1024,
}
TAMANHO_ALVO_PARTICAO = 1024 * 1024

# --- Transformação (regras de negócio ajustáveis) --- #
JANELAS_BENCHMARK_ALTERNATIVAS = (30, 60, 180)  # além de JANELA_BENCHMARK_DIAS (proposta: janela ajustável)
IDADE_MINIMA_METRICA_DIAS = 7  # post mais novo que isso tem métrica ainda em formação (fora do benchmark)
LIMIAR_COBERTURA_DISPONIVEL = 0.95  # ≥95% das linhas com dado = "disponível"; entre 0 e isso = "parcial"
DESCRICAO_MAX_CARACTERES = 140  # mantém as partições mensais < 1 MB
