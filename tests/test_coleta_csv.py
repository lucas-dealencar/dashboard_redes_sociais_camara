"""Coleta via CSV exportado: leitura do arquivo, download e falhas."""
import pytest
import requests

from src import coleta, config

CAB = "Post - Link,01 - Data,02 - Rede,Post - Descrição,Mtrc - Alcance,Coluna extra\r\n"


def _csv(*linhas) -> bytes:
    return (CAB + "\r\n".join(linhas)).encode("utf-8")


def test_le_acentos_aspas_e_so_colunas_do_mapa():
    cab, df = coleta._ler_csv(_csv('https://a,11 de março de 2025,Rede X,"Título, com ""aspas""",2.253,z'))
    assert len(cab) == 6 and "Coluna extra" not in df.columns
    assert df["Post - Descrição"].iloc[0] == 'Título, com "aspas"'
    assert df["Mtrc - Alcance"].iloc[0] == "2.253"


def test_quebra_de_linha_na_descricao_nao_desloca_linha_planilha():
    _, df = coleta._ler_csv(_csv('https://a,d,Rede X,"um\ndois",1,', ",,,,,", "https://b,d,Threads,x,2,"))
    assert df["linha_planilha"].tolist() == [2, 3, 4]  # linha vazia no meio conta
    assert df["Post - Descrição"].iloc[0] == "um\ndois"


def test_bom_no_inicio_nao_quebra_o_cabecalho():
    _, df = coleta._ler_csv(b"\xef\xbb\xbf" + _csv("https://a,d,Rede X,x,1,"))
    assert "Post - Link" in df.columns


@pytest.mark.parametrize("cortado", ["https://a,d,Rede", 'https://a,d,Rede X,"texto sem fim'])
def test_csv_cortado_falha_em_vez_de_seguir_incompleto(cortado):
    with pytest.raises(coleta.ErroColeta, match="incompleto"):
        coleta._ler_csv(_csv("https://z,d,Rede X,x,1,", cortado))


def test_cabecalho_sem_obrigatoria_falha():
    with pytest.raises(coleta.ErroColeta, match="obrigatórias"):
        coleta._ler_csv(b"Post - Link,Outra\r\na,b\r\n")


class _Sessao:
    def __init__(self, status=200, tipo="text/csv; charset=utf-8"):
        self.r = requests.Response()
        self.r.status_code, self.r._content = status, b"conteudo"
        self.r.headers["content-type"] = tipo

    def get(self, url, params, timeout):
        self.url, self.params = url, params
        return self.r


def test_download_pede_csv_da_aba_certa():
    s = _Sessao()
    assert coleta._requisitar_csv(s) == b"conteudo"
    assert s.params == {"format": "csv", "gid": config.GID_CONSOLIDADO}
    assert config.SPREADSHEET_ID in s.url


def test_pagina_html_de_login_nao_passa_por_csv():
    with pytest.raises(coleta.ErroColeta, match="não devolveu CSV"):
        coleta._requisitar_csv(_Sessao(tipo="text/html"))


@pytest.mark.parametrize("status,repete", [(500, True), (503, True), (429, True), (403, False), (404, False)])
def test_erro_http_do_download_repete_so_se_passageiro(status, repete):
    with pytest.raises(requests.exceptions.HTTPError) as e:
        coleta._requisitar_csv(_Sessao(status=status))
    assert coleta._eh_transitorio(e.value) is repete


def test_download_interrompido_e_passageiro():
    assert coleta._eh_transitorio(requests.exceptions.ChunkedEncodingError())


def test_coleta_descarta_preenchimento_e_mantem_linha_real(monkeypatch):
    conteudo = _csv(",,,,,", "https://a,11 de março de 2025,Rede X,x,10,", ",,,,,preenchimento")
    monkeypatch.setattr(coleta, "_baixar_csv", lambda: conteudo)
    monkeypatch.setattr(coleta, "_gravar_estado", lambda *a: None)
    df = coleta._coletar_sheets.fn()
    assert df["linha_planilha"].tolist() == [3]


def test_coleta_sem_dados_falha(monkeypatch):
    monkeypatch.setattr(coleta, "_baixar_csv", lambda: _csv(",,,,,"))
    monkeypatch.setattr(coleta, "_gravar_estado", lambda *a: None)
    with pytest.raises(coleta.ErroColeta, match="nenhuma linha"):
        coleta._coletar_sheets.fn()
