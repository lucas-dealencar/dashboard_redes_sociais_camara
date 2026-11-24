"""Transformação: limpeza -> publicações -> validação -> métricas -> agregações -> benchmark."""
from prefect import task

from src import config
from src.transformacao.benchmark import benchmark_com_alternativas
from src.transformacao.cobertura import (
    LIMITACOES_FIXAS,
    cobertura_metricas,
    kpi_por_rede,
    reconciliar_com_planilha,
)
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
    descartadas = rel_limpeza["linhas_erro_planilha"]
    if descartadas:
        print(
            f"Aviso: {len(descartadas)} linha(s) com erro de fórmula da planilha descartada(s): "
            f"{descartadas[:5]}. A base pode estar INCOMPLETA; confira a fórmula na origem."
        )
    df, rel_pub = preparar_publicacoes(df)
    print(
        f"Duplicados removidos (Post - Link): {rel_pub['duplicados_removidos']} "
        f"({rel_pub['duplicados_por_normalizacao']} só após normalizar o link)"
    )
    if rel_pub["temas_invalidos"]:
        print(f"Aviso: temas fora da taxonomia tratados como 'Sem tema': {rel_pub['temas_invalidos']}")
    df, avisos = _validar(df)
    df = adicionar_metricas(df)
    df, avisos_taxa = _validar_taxas(df)
    avisos += avisos_taxa
    for aviso in avisos:
        print(f"Aviso: {aviso}")
    if rel_limpeza["falhas_conversao"]:
        print(f"Aviso: células ilegíveis tratadas como NA: {rel_limpeza['falhas_conversao']}")

    cobertura = cobertura_metricas(df)
    kpis = kpi_por_rede(cobertura)
    for rede, k in kpis.items():
        if k["situacao"] == "sem_dados" or k["substituto"]:
            print(f"Aviso: {rede}: {k['motivo']}")
    benchmark = benchmark_com_alternativas(
        df, config.JANELA_BENCHMARK_DIAS, config.PERIODO_AVALIADO_DIAS,
        config.JANELAS_BENCHMARK_ALTERNATIVAS,
    )
    benchmark["kpi_por_rede"] = kpis
    benchmark["cobertura"] = cobertura

    relatorio = {
        "linhas_lidas": rel_limpeza["linhas_entrada"],
        "linhas_processadas": len(df),
        "metricas_por_rede": rel_limpeza["metricas_por_rede"],
        **rel_pub,
        "reconciliacao_planilha": reconciliar_com_planilha(df),
        "avisos": avisos,
    }
    print(f"Linhas lidas: {relatorio['linhas_lidas']} | processadas: {relatorio['linhas_processadas']}")
    return {
        "base": df,
        "resumo_diario": resumo_diario(df),
        "conteudos": agregado_conteudos(df),
        "benchmark": benchmark,
        "limitacoes": LIMITACOES_FIXAS,
        "relatorio": relatorio,
        "qualitativo": qualitativo,
    }
