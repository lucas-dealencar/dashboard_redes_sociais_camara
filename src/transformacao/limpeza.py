"""Limpeza e tipagem do bruto da aba `Consolidado`.

Regras: célula vazia vira NA (nunca 0); datas por extenso em pt-BR com mapa de meses
próprio (sem locale); percentuais em texto (`14%`); milhares com ponto (`2.253`).
Sem efeitos colaterais: recebe e devolve DataFrames.
"""
import math
import re
from datetime import date, datetime

import pandas as pd

from config.colunas import (
    COLUNAS_NUMERICAS,
    COLUNAS_PERCENTUAIS,
    COLUNAS_TEXTO,
    MAPA_COLUNAS,
)
from config.redes import NOMES_CANONICOS

MESES = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3, "abril": 4, "maio": 5,
    "junho": 6, "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10,
    "novembro": 11, "dezembro": 12,
}
_NULOS = {"", "-", "—", "n/a", "na", "nan", "none", "null"}
_RE_MILHAR = re.compile(r"^-?\d{1,3}(\.\d{3})+$")
_RE_EXTENSO = re.compile(r"^(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})", re.IGNORECASE)
_RE_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_RE_BR = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})")
_RE_SERIAL = re.compile(r"^\d{5}(\.\d+)?$")
_EPOCA_SHEETS = datetime(1899, 12, 30)


def _eh_nulo(v) -> bool:
    if v is None or v is pd.NA or v is pd.NaT:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    return isinstance(v, str) and v.strip().lower() in _NULOS


def _para_float(v) -> float | None:
    """Número em pt-BR/Sheets -> float; nulo/ilegível -> None."""
    if _eh_nulo(v):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("\xa0", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif _RE_MILHAR.match(s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def _para_percentual(v) -> float | None:
    """Percentual em PONTOS (14.0 = 14%). Texto `14%` vale como está; número ≤ 1 é fração
    do Sheets (0.14 -> 14.0); número > 1 já está em pontos."""
    if _eh_nulo(v):
        return None
    if isinstance(v, str) and v.strip().endswith("%"):
        return _para_float(v.strip()[:-1])
    n = _para_float(v)
    if n is None:
        return None
    return round(n * 100, 10) if abs(n) <= 1 else n


def _para_data(v) -> pd.Timestamp:
    """Data por extenso, ISO, dd/mm/aaaa, serial do Sheets ou datetime -> Timestamp (ou NaT)."""
    if _eh_nulo(v):
        return pd.NaT
    try:
        if isinstance(v, (datetime, date, pd.Timestamp)):
            return pd.Timestamp(v).normalize()
        if isinstance(v, (int, float)):
            return pd.Timestamp(_EPOCA_SHEETS) + pd.Timedelta(days=int(v)) if 20000 < v < 80000 else pd.NaT
        s = str(v).strip()
        if _RE_SERIAL.match(s):
            return _para_data(float(s))
        m = _RE_EXTENSO.match(s)
        if m:
            mes = MESES.get(m.group(2).lower())
            return pd.Timestamp(int(m.group(3)), mes, int(m.group(1))) if mes else pd.NaT
        m = _RE_ISO.match(s)
        if m:
            return pd.Timestamp(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        m = _RE_BR.match(s)
        if m:
            return pd.Timestamp(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except (ValueError, OverflowError):
        return pd.NaT
    return pd.NaT


def _normalizar_rede(v) -> str | None:
    if _eh_nulo(v):
        return None
    s = str(v).strip()
    chave = s.lower()
    if chave in NOMES_CANONICOS:
        return NOMES_CANONICOS[chave]
    if chave.startswith("rede "):
        return NOMES_CANONICOS.get(chave[5:].strip(), s[5:].strip())
    return s


def _texto(v) -> str | None:
    return None if _eh_nulo(v) else str(v).strip()


def _converter(serie: pd.Series, funcao) -> tuple[list, int]:
    """Aplica `funcao`; devolve valores e quantas células NÃO vazias não puderam ser lidas."""
    saida, falhas = [], 0
    for v in serie:
        r = funcao(v)
        if (r is None or r is pd.NaT) and not _eh_nulo(v):
            falhas += 1
        saida.append(r)
    return saida, falhas


def _metricas_por_rede(df: pd.DataFrame) -> dict[str, list[str]]:
    """Quais métricas numéricas têm algum valor em cada rede (registro para o dicionário)."""
    return {
        rede: [c for c in COLUNAS_NUMERICAS if c in g and g[c].notna().any()]
        for rede, g in df.groupby("rede", dropna=True)
    }


def limpar(bruto: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Bruto (nomes da origem) -> DataFrame tipado com nomes internos + relatório."""
    relatorio: dict = {"linhas_entrada": len(bruto), "falhas_conversao": {}}
    renomear = {o: i for o, i in MAPA_COLUNAS.items() if o in bruto.columns}
    df = bruto[["linha_planilha", *renomear]].rename(columns=renomear).copy()
    relatorio["colunas_ausentes"] = [i for i in MAPA_COLUNAS.values() if i not in df.columns]

    for col in {*MAPA_COLUNAS.values(), *COLUNAS_NUMERICAS} - set(df.columns):
        df[col] = None  # coluna inexistente nesta planilha: tudo NA

    for col in COLUNAS_TEXTO:
        df[col] = pd.Series([_texto(v) for v in df[col]], index=df.index, dtype="object")

    for col in COLUNAS_NUMERICAS:
        valores, falhas = _converter(df[col], _para_float)
        df[col] = pd.array(valores, dtype="Float64")
        if falhas:
            relatorio["falhas_conversao"][col] = falhas

    for col in COLUNAS_PERCENTUAIS:
        valores, falhas = _converter(df[col], _para_percentual)
        df[col] = pd.array(valores, dtype="Float64")
        if falhas:
            relatorio["falhas_conversao"][col] = falhas

    datas, falhas = _converter(df["data"], _para_data)
    df["data"] = pd.to_datetime(pd.Series(datas, index=df.index, dtype="object"))
    if falhas:
        relatorio["falhas_conversao"]["data"] = falhas

    df["rede"] = pd.Series([_normalizar_rede(v) for v in df["rede"]], index=df.index, dtype="object")
    relatorio["metricas_por_rede"] = _metricas_por_rede(df)
    return df, relatorio
