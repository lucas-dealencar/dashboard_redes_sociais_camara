"""Publicação: commit só de `docs/dados/`, `pull --rebase --autostash` e `push`.

ATENÇÃO: faz push na branch atual de verdade. Só é chamada por `main.py` sem `--sem-publicar`.
"""
import subprocess
from datetime import datetime

from prefect import task

from src import config


def _git(*args: str) -> str:
    r = subprocess.run(
        ["git", *args], cwd=config.BASE_DIR, capture_output=True, text=True, encoding="utf-8"
    )
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} falhou: {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()


@task(name="Publicar dados via git", retries=2, retry_delay_seconds=[30, 120], log_prints=True)
def publicar_dados_git() -> bool:
    """Devolve True se houve commit/push; False se não havia mudança em docs/dados/."""
    try:
        _git("rev-parse", "--is-inside-work-tree")
    except RuntimeError as erro:
        raise RuntimeError("A pasta do projeto não é um repositório git; nada foi publicado.") from erro
    _git("add", "--", "docs/dados")
    if subprocess.run(["git", "diff", "--cached", "--quiet", "--", "docs/dados"], cwd=config.BASE_DIR).returncode == 0:
        print("Sem mudanças em docs/dados/; nada a publicar.")
        return False
    _git("commit", "-m", f"chore: atualiza dados do dashboard ({datetime.now():%Y-%m-%d %H:%M})",
         "--", "docs/dados")
    _git("pull", "--rebase", "--autostash")
    _git("push")
    print("Dados publicados.")
    return True
