"""Tolerância a falhas passageiras do Google (HTTP 500/429/503, rede) na coleta."""
import pytest
import requests
from gspread.exceptions import APIError

from src import coleta


def _api_erro(codigo: int) -> APIError:
    r = requests.Response()
    r.status_code = codigo
    r._content = (
        '{"error":{"code":%d,"message":"Internal error encountered.","status":"INTERNAL"}}' % codigo
    ).encode()
    return APIError(r)


class _Falha:
    """Falha `n` vezes com `erro` e depois devolve 'ok'."""

    def __init__(self, n, erro):
        self.n, self.erro, self.chamadas = n, erro, 0

    def __call__(self):
        self.chamadas += 1
        if self.chamadas <= self.n:
            raise self.erro
        return "ok"


def _sem_espera(_):
    pass


def test_500_do_google_e_repetido_ate_dar_certo():
    f = _Falha(3, _api_erro(500))
    assert coleta._com_retry(f, "x", esperas=(1, 1, 1, 1), dormir=_sem_espera) == "ok"
    assert f.chamadas == 4


@pytest.mark.parametrize("codigo", [429, 500, 502, 503, 504])
def test_codigos_transitorios(codigo):
    assert coleta._eh_transitorio(_api_erro(codigo))


def test_queda_de_rede_e_timeout_sao_repetidos():
    f = _Falha(2, requests.exceptions.ConnectionError("caiu"))
    assert coleta._com_retry(f, "x", esperas=(1, 1, 1), dormir=_sem_espera) == "ok"
    assert coleta._eh_transitorio(requests.exceptions.ReadTimeout())


@pytest.mark.parametrize("codigo", [400, 401, 403, 404])
def test_erro_de_configuracao_nao_e_repetido(codigo):
    f = _Falha(5, _api_erro(codigo))
    with pytest.raises(APIError):
        coleta._com_retry(f, "x", esperas=(1, 1, 1), dormir=_sem_espera)
    assert f.chamadas == 1  # repetir 403/404 só atrasaria o diagnóstico


def test_erro_do_proprio_pipeline_nao_e_repetido():
    f = _Falha(5, coleta.ErroColeta("cabeçalho inesperado"))
    with pytest.raises(coleta.ErroColeta):
        coleta._com_retry(f, "x", esperas=(1, 1), dormir=_sem_espera)
    assert f.chamadas == 1


def test_esgota_as_tentativas_e_levanta_o_erro_original():
    f = _Falha(99, _api_erro(500))
    with pytest.raises(APIError):
        coleta._com_retry(f, "x", esperas=(1, 1), dormir=_sem_espera)
    assert f.chamadas == 3  # 1 + 2 repetições


def test_espera_cresce_conforme_a_tabela():
    dormiu = []
    coleta._com_retry(_Falha(3, _api_erro(500)), "x", esperas=(10, 20, 40), dormir=dormiu.append)
    assert dormiu[0] < dormiu[1] < dormiu[2]
    for d, base in zip(dormiu, (10, 20, 40)):
        assert 0.8 * base <= d <= 1.2 * base  # jitter de ±20%


def test_total_de_espera_dentro_de_alguns_minutos():
    assert 180 <= sum(coleta.ESPERAS_S) <= 600


class _Estado:
    def __init__(self, resultado):
        self._r = resultado

    def result(self, raise_on_failure=True):
        return self._r


def test_condicao_de_retry_do_prefect():
    assert coleta._retentar_se_transitorio(None, None, _Estado(_api_erro(500))) is True
    assert coleta._retentar_se_transitorio(None, None, _Estado(_api_erro(403))) is False
    assert coleta._retentar_se_transitorio(None, None, _Estado(coleta.ErroColeta("x"))) is False


def test_row_values_com_500_passageiro_recupera():
    """Reproduz o erro real: o 500 vem na leitura do cabeçalho e a coleta se recupera."""

    class Ws:
        chamadas = 0

        def row_values(self, n):
            Ws.chamadas += 1
            if Ws.chamadas == 1:
                raise _api_erro(500)
            return ["Post - Link", "01 - Data", "02 - Rede"]

    ws = Ws()
    cab = coleta._com_retry(lambda: ws.row_values(1), "ler cabeçalho", dormir=_sem_espera)
    assert cab[0] == "Post - Link" and Ws.chamadas == 2
