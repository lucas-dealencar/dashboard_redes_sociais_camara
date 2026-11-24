"""Publicação git em repositórios temporários (remoto local); nunca toca no repositório real."""
import subprocess

import pytest

from src import config, publicacao


def _g(cwd, *a):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


@pytest.fixture
def repo(tmp_path, monkeypatch):
    remoto, local = tmp_path / "remoto.git", tmp_path / "local"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(remoto)], check=True, capture_output=True)
    subprocess.run(["git", "init", "-b", "main", str(local)], check=True, capture_output=True)
    for k, v in (("user.email", "t@t"), ("user.name", "t")):
        _g(local, "config", k, v)
    _g(local, "remote", "add", "origin", str(remoto))
    (local / "docs" / "dados").mkdir(parents=True)
    (local / "docs" / "dados" / "a.json").write_text("{}")
    _g(local, "add", "."); _g(local, "commit", "-m", "base"); _g(local, "push", "origin", "main")
    monkeypatch.setattr(config, "BASE_DIR", local)
    return local, remoto


def test_sem_mudanca_e_sem_pendencia_nao_publica(repo):
    assert publicacao.publicar_dados_git.fn() is False


def test_publica_mudanca(repo):
    local, remoto = repo
    (local / "docs" / "dados" / "a.json").write_text('{"x":1}')
    assert publicacao.publicar_dados_git.fn() is True
    assert _g(remoto, "rev-list", "--count", "main") == "2"


def test_push_que_falhou_e_retomado_na_proxima_execucao(repo):
    """Commit local sem push (falha anterior) não pode virar 'nada a publicar'."""
    local, remoto = repo
    (local / "docs" / "dados" / "a.json").write_text('{"x":2}')
    _g(local, "add", "."); _g(local, "commit", "-m", "dados")  # simula commit sem push
    assert publicacao.publicar_dados_git.fn() is True
    assert _g(remoto, "rev-list", "--count", "main") == "2"
