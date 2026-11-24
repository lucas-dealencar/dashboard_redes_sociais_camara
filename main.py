"""Flow principal: coleta (Google Sheets) -> transformação -> carga (JSONs) -> publicação (git).

  python main.py --sem-publicar              teste local (padrão ao testar)
  python main.py --sem-publicar --do-cache   reusa cache/bruto.parquet, sem chamar a API
  python main.py                             coleta, gera e publica (commit + push)
  python main.py --agendar                   roda todo dia às 11:30 (America/Sao_Paulo)
"""
import argparse

from prefect import flow
from prefect.schedules import Cron

from src import config
from src.carga import salvar_dados_json
from src.coleta import extrair_dados_qualitativos, extrair_dados_sheets
from src.publicacao import publicar_dados_git
from src.transformacao import transformar_dados

CRON_DIARIO = Cron("30 11 * * *", timezone="America/Sao_Paulo")


@flow(name="Atualizar Dashboard Câmara nas Redes", log_prints=True)
def atualizar_dashboard(publicar: bool = True, do_cache: bool = False) -> dict:
    bruto = extrair_dados_sheets(do_cache=do_cache)
    qualitativo = None
    if do_cache or not config.SPREADSHEET_ID_QUALITATIVO:
        print("Planilha qualitativa não configurada; seguindo sem anotações.")
    else:
        try:  # planilha qualitativa é opcional: se falhar, segue sem ela
            qualitativo = extrair_dados_qualitativos()
        except Exception as erro:
            print(f"Aviso: análise qualitativa indisponível ({erro}); seguindo sem ela.")
    tabelas = transformar_dados(bruto, qualitativo)
    manifest = salvar_dados_json(tabelas)
    if publicar:
        publicar_dados_git()
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--agendar", action="store_true", help="roda todo dia às 11:30 (Brasília)")
    parser.add_argument("--sem-publicar", action="store_true", help="não faz commit/push")
    parser.add_argument("--do-cache", action="store_true", help="usa cache/bruto.parquet")
    args = parser.parse_args()

    if args.agendar:
        atualizar_dashboard.serve(name="dashboard-diario-1130", schedule=CRON_DIARIO)
    else:
        atualizar_dashboard(publicar=not args.sem_publicar, do_cache=args.do_cache)
