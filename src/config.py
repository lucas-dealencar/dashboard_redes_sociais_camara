"""Configuração central: planilha, caminhos, janelas e limites."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Google Sheets (somente leitura) --- #
CAMINHO_CREDENCIAIS = BASE_DIR / "src" / "credentials.json"  # nunca versionar
# ID da planilha "Consolidado Redes Sociais - Simplificado": informe por variável de ambiente.
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "1nucAY1rCnKG-lYPMhxRFJQm7U4GV4JrtFntameyFepE")
ABA_CONSOLIDADO = "Consolidado"
BLOCO_LINHAS = 15_000  # 15–20 mil linhas por requisição
PAUSA_ENTRE_BLOCOS_S = 1.5  # respeita ~60 leituras/min por usuário

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
