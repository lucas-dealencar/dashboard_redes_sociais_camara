"""Transformação: limpeza -> publicações -> validação -> métricas -> agregações -> benchmark."""
from prefect import task

from src import config
from src.transformacao.benchmark import calcular_benchmark
from src.transformacao.limpeza import limpar
from src.transformacao.metricas import (
    adicionar_metricas,
    agregado_conteudos,
    resumo_diario,
)
from src.transformacao.publicacoes import preparar_publicacoes
from src.transformacao.validacao import _validar, _validar_taxas


@task(name="Transformar dados", log_prints=True)
def transformar_dados(bruto, qualitativo: dict | None = None) -> dict:
    """Bruto da coleta -> tabelas analíticas prontas para a carga."""
    df, rel_limpeza = limpar(bruto)
    df, rel_pub = preparar_publicacoes(df)
    print(f"Duplicados removidos (Post - Link): {rel_pub['duplicados_removidos']}")
    df, avisos = _validar(df)
    df = adicionar_metricas(df)
    df, avisos_taxa = _validar_taxas(df)
    avisos += avisos_taxa
    for aviso in avisos:
        print(f"Aviso: {aviso}")
    if rel_limpeza["falhas_conversao"]:
        print(f"Aviso: células ilegíveis tratadas como NA: {rel_limpeza['falhas_conversao']}")

    relatorio = {
        "linhas_lidas": rel_limpeza["linhas_entrada"],
        "linhas_processadas": len(df),
        "metricas_por_rede": rel_limpeza["metricas_por_rede"],
        **rel_pub,
        "avisos": avisos,
    }
    print(f"Linhas lidas: {relatorio['linhas_lidas']} | processadas: {relatorio['linhas_processadas']}")
    return {
        "base": df,
        "resumo_diario": resumo_diario(df),
        "conteudos": agregado_conteudos(df),
        "benchmark": calcular_benchmark(df, config.JANELA_BENCHMARK_DIAS, config.PERIODO_AVALIADO_DIAS),
        "relatorio": relatorio,
        "qualitativo": qualitativo,
    }
