"""Publicações: deduplicação, canal (YouTube/Shorts), formato, tema, perfil e maturidade.

Linhas SEM link não são publicações (podem ser linhas de conta/dia): ficam na base com
`eh_post = False` e alimentam só o resumo diário.

Decisões (validadas com a amostra real de 76 mil linhas):
- Deduplicação por link NORMALIZADO (x.com = twitter.com, sem `www.`, sem query/barra final).
  Em duplicatas vence a linha mais COMPLETA (com data e mais métricas); empate: a mais recente
  na planilha. Evita que uma linha vazia ao final apague a linha preenchida.
- `Rede Local Post` separa o que `02 - Rede` mistura: "Shorts - YouTube" vira o canal
  "YouTube Shorts"; "Stories - ..." vira o formato "Stories".
- `formato` é padronizado (proposta, seção 10); `formato_nativo` preserva o original.
- Tema só vale se estiver na taxonomia editável (`config/taxonomia_temas.json`); lixo da
  planilha (ementa colada no campo, "Cadastrar na Tabela Excel") vira "Sem tema" e é contado.
"""
import json
import re

import pandas as pd

from src import config
from src.transformacao.limpeza import _eh_nulo

SEM_TEMA = "Sem tema"
SEM_FORMATO = "Não informado"

_COLUNAS_METRICA = [
    "alcance", "impressoes", "visualizacoes", "curtidas", "comentarios", "compartilhamentos",
    "salvos", "cliques_link", "engajamento_x", "gostei", "nao_gostei",
]
_RE_COLAB = re.compile(r"\s*-\s*colab\s*$", re.IGNORECASE)
_RE_PERFIL = re.compile(r"^https?://(?:www\.)?(?:x\.com|twitter\.com|facebook\.com|threads\.(?:com|net))/@?([^/?#]+)", re.IGNORECASE)
_NAO_PERFIL = {"reel", "reels", "photo.php", "events", "watch", "p", "tv", "share", "permalink.php"}
_FORMATO_BASE = {
    "carrossel": "Carrossel",
    "texto": "Texto",
    "link": "Link",
    "imagem estática": "Imagem",
    "imagem dinâmica": "Imagem",
    "vídeo": "Vídeo",
}


# ----------------------------------------------------------------------------- deduplicação
def _chave_link(link) -> str | None:
    """Link -> chave de deduplicação (host sem www, twitter->x, sem query nem barra final)."""
    if _eh_nulo(link):
        return None
    s = str(link).strip().lower()
    s = re.sub(r"^https?://(www\.)?", "", s)
    s = re.sub(r"^(twitter\.com|mobile\.twitter\.com)/", "x.com/", s)
    s = re.sub(r"^threads\.net/", "threads.com/", s)
    s = re.sub(r"[?#].*$", "", s) if "watch?v=" not in s else re.sub(r"&.*$", "", s)
    return s.rstrip("/")


def _deduplicar(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    chave = df["link"].map(_chave_link)
    exata_dup = df["link"].notna() & df.duplicated(subset="link", keep="last")
    completude = df[[c for c in _COLUNAS_METRICA if c in df]].notna().sum(axis=1) + df["data"].notna() * 100
    ordem = pd.DataFrame({"chave": chave, "pts": completude, "pos": range(len(df))}, index=df.index)
    vencedora = (
        ordem[ordem["chave"].notna()].sort_values(["pts", "pos"]).drop_duplicates("chave", keep="last").index
    )
    manter = chave.isna() | df.index.isin(vencedora)
    total = int((~manter).sum())
    return df[manter].reset_index(drop=True), {
        "duplicados_removidos": total,
        "duplicados_por_normalizacao": total - int(exata_dup.sum()),
    }


# ----------------------------------------------------------------------------- canal e formato
def _canal(df: pd.DataFrame) -> pd.DataFrame:
    """Separa YouTube Shorts do YouTube pelo `Rede Local Post`."""
    shorts = df["rede_local"].fillna("").str.lower().str.startswith("shorts")
    df["rede"] = df["rede"].where(~shorts, "YouTube Shorts")
    return df


def _formato_padronizado(linha) -> str:
    nativo, local, rede, link = linha
    if isinstance(local, str) and local.lower().startswith("stories"):
        return "Stories"
    if not isinstance(nativo, str):
        return SEM_FORMATO
    base = _FORMATO_BASE.get(_RE_COLAB.sub("", nativo).strip().lower(), "Outros")
    if base != "Vídeo":
        return base
    if rede == "YouTube Shorts" or (isinstance(link, str) and "/reel" in link.lower()):
        return "Vídeo curto/Reels"
    if rede == "YouTube" or (isinstance(link, str) and "/tv/" in link.lower()):
        return "Vídeo longo"
    return "Vídeo"  # duração indisponível: não dá para dizer se é curto ou longo


def _atribuir_formato(df: pd.DataFrame) -> pd.DataFrame:
    nativo = df["formato"]  # "Tipo de mídia" da origem
    df["colab"] = nativo.fillna("").str.contains(_RE_COLAB).astype(bool)
    df["formato_nativo"] = nativo.map(lambda v: _RE_COLAB.sub("", v).strip() if isinstance(v, str) else None)
    df["formato"] = [
        _formato_padronizado(t) for t in zip(nativo, df["rede_local"], df["rede"], df["link"])
    ]
    return df


# ----------------------------------------------------------------------------- tema
def _carregar_taxonomia() -> dict:
    caminho = config.BASE_DIR / "config" / "taxonomia_temas.json"
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _canonizar_tema(valor, canonicos: dict[str, str], aliases: dict[str, str]):
    """Devolve (tema canônico | None, valor_invalido | None)."""
    if _eh_nulo(valor):
        return None, None
    v = aliases.get(str(valor).strip(), str(valor).strip())
    if not canonicos:  # sem taxonomia: usa o texto como vem
        return v, None
    canon = canonicos.get(v.casefold())
    return (canon, None) if canon else (None, str(valor).strip()[:80])


def _atribuir_tema(df: pd.DataFrame, taxonomia: dict) -> tuple[pd.DataFrame, dict]:
    """`tema` = principal (Prop 1, senão Prop 2); `tema_secundario` = Prop 2 se diferente."""
    canonicos = {t.casefold(): t for t in taxonomia.get("temas", [])}
    aliases = taxonomia.get("aliases", {})
    invalidos: dict[str, int] = {}

    def _resolver(coluna):
        saida = []
        for v in df[coluna]:
            tema, ruim = _canonizar_tema(v, canonicos, aliases)
            if ruim:
                invalidos[ruim] = invalidos.get(ruim, 0) + 1
            saida.append(tema)
        return pd.Series(saida, index=df.index, dtype="object")

    t1, t2 = _resolver("prop1_tema"), _resolver("prop2_tema")
    principal = t1.where(t1.notna(), t2)
    df["tema"] = principal.fillna(SEM_TEMA)
    df["tema_secundario"] = t2.where(t1.notna() & t2.notna() & (t1 != t2))
    return df, invalidos


# ----------------------------------------------------------------------------- perfil e maturidade
def _extrair_perfil(link) -> str | None:
    """Perfil (@) quando o link traz (X, Threads, Facebook); Instagram/YouTube não trazem."""
    if not isinstance(link, str):
        return None
    m = _RE_PERFIL.match(link.strip())
    if not m or m.group(1).lower() in _NAO_PERFIL:
        return None
    return m.group(1).lower()


def _maturidade(df: pd.DataFrame) -> pd.DataFrame:
    """Idade do post em dias contra a última data da base. A planilha traz um único retrato das
    métricas (sem data de coleta): posts muito novos ainda estão acumulando, então ficam fora
    das comparações com o histórico (`metrica_madura = False`)."""
    referencia = df["data"].max()
    df["idade_dias"] = (referencia - df["data"]).dt.days.astype("Int64")
    df["metrica_madura"] = (df["idade_dias"] >= config.IDADE_MINIMA_METRICA_DIAS).fillna(False).astype(bool)
    return df


def _ao_vivo_bool(df: pd.DataFrame) -> pd.DataFrame:
    """Sim/Não -> booleano (vazio = NA). Indica post sobre/durante transmissão, não o formato."""
    mapa = {"sim": True, "não": False, "nao": False}
    df["ao_vivo"] = pd.array(
        [mapa.get(v.strip().lower()) if isinstance(v, str) else None for v in df["ao_vivo"]],
        dtype="boolean",
    )
    return df


# ----------------------------------------------------------------------------- orquestração
def preparar_publicacoes(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    df, rel = _deduplicar(df)
    df["eh_post"] = df["link"].notna()
    df = _canal(df)
    df = _atribuir_formato(df)
    df, invalidos = _atribuir_tema(df, _carregar_taxonomia())
    df["perfil"] = df["link"].map(_extrair_perfil)
    df = _ao_vivo_bool(df)
    df["mes"] = df["data"].dt.strftime("%Y-%m")
    df = _maturidade(df)

    posts = df[df["eh_post"]]
    rel.update({
        "linhas_sem_link": int((~df["eh_post"]).sum()),
        "temas_invalidos": dict(sorted(invalidos.items(), key=lambda kv: -kv[1])[:10]),
        "cobertura_tema_pct": float((posts["tema"] != SEM_TEMA).mean() * 100) if len(posts) else None,
        "formatos": {k: int(v) for k, v in posts["formato"].value_counts().items()},
    })
    return df, rel
