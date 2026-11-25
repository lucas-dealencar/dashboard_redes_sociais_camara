import json

import pandas as pd
import pytest

from src import carga, coleta, config
from src.transformacao import transformar_dados


def test_cabecalho_sem_obrigatoria_falha_claro():
    with pytest.raises(coleta.ErroColeta, match="obrigatórias"):
        coleta._resolver_colunas(["01 - Data", "Mtrc - Curtidas"])


def test_cabecalho_ok_mapeia_indices():
    pos = coleta._resolver_colunas(["x", "Post - Link", "01 - Data", "02 - Rede"])
    assert pos == {"Post - Link": 1, "01 - Data": 2, "02 - Rede": 3}


def test_uniformizar_tipos_para_parquet(tmp_path):
    df = pd.DataFrame({"n": [1, 2.5, None], "t": ["a", "", None], "m": ["11 de maio de 2025", 45000.0, 2253.0]})
    out = coleta._uniformizar_tipos(df)
    assert out["n"].dtype == "float64"
    assert out["t"].tolist() == ["a", None, None]
    assert out["m"].tolist() == ["11 de maio de 2025", "45000", "2253"]
    out.to_parquet(tmp_path / "x.parquet")  # não pode levantar


def test_cache_roundtrip(tmp_path, monkeypatch, bruto):
    monkeypatch.setattr(config, "PASTA_CACHE", tmp_path)
    monkeypatch.setattr(config, "ARQUIVO_BRUTO", tmp_path / "bruto.parquet")
    coleta._gravar_cache(coleta._uniformizar_tipos(bruto))
    lido = coleta._ler_cache()
    assert len(lido) == len(bruto)


def test_carga_ponta_a_ponta_json_valido_e_manifest_coerente(tmp_path, monkeypatch, bruto):
    monkeypatch.setattr(config, "PASTA_DADOS", tmp_path)
    monkeypatch.setattr(config, "PASTA_PUBLICACOES", tmp_path / "publicacoes")
    tabelas = transformar_dados.fn(coleta._uniformizar_tipos(bruto), {"anotacoes": [{"titulo": "evento"}]})
    manifest = carga.salvar_dados_json.fn(tabelas)

    for arquivo in tmp_path.rglob("*.json"):
        json.loads(arquivo.read_text(encoding="utf-8"))  # JSON estrito (sem NaN)
        assert "NaN" not in arquivo.read_text(encoding="utf-8")
    for p in manifest["particoes"]:
        assert (tmp_path / p["arquivo"]).exists()
    assert manifest["totais"]["publicacoes"] == 4  # 5 linhas válidas - 1 sem link
    assert not list(tmp_path.rglob("*.tmp"))        # escrita atômica não deixa resíduo
    anot = json.loads((tmp_path / "anotacoes.json").read_text(encoding="utf-8"))
    assert anot == [{"titulo": "evento"}]


def test_carga_idempotente(tmp_path, monkeypatch, bruto):
    monkeypatch.setattr(config, "PASTA_DADOS", tmp_path)
    monkeypatch.setattr(config, "PASTA_PUBLICACOES", tmp_path / "publicacoes")
    b = coleta._uniformizar_tipos(bruto)
    carga.salvar_dados_json.fn(transformar_dados.fn(b))
    antes = (tmp_path / "resumo_diario.json").read_text(encoding="utf-8")
    carga.salvar_dados_json.fn(transformar_dados.fn(b))
    assert (tmp_path / "resumo_diario.json").read_text(encoding="utf-8") == antes
