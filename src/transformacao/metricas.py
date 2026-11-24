"""Regras de cálculo da proposta. Funções puras: sem I/O.

- Engajamento básico = curtidas + comentários + compartilhamentos (salvos e demais ficam fora).
  Só é calculado com as TRÊS parcelas presentes (`engajamento_completo`); com parcela faltando
  é dado INCOMPLETO (ex.: Stories do Instagram não trazem curtidas) e fica NA, nunca um valor
  menor disfarçado. A soma parcial é guardada em `engajamento_parcial` (não publicada).
- Taxa = engajamento ÷ denominador × 100; denominador = alcance, senão visualizações, senão
  impressões (valor > 0), sempre acompanhado de `denominador_tipo`.
- Nunca soma alcance, visualizações e impressões num total único.
"""
import pandas as pd

PARCELAS_ENGAJAMENTO = ["curtidas", "comentarios", "compartilhamentos"]
ORDEM_DENOMINADOR = [
    ("alcance", "alcance"),
    ("visualizacoes", "visualizações"),
    ("impressoes", "impressões"),
]


def adicionar_metricas(df: pd.DataFrame) -> pd.DataFrame:
    """Acrescenta engajamento, denominador_valor, denominador_tipo e taxa_engajamento."""
    df = df.copy()
    parcelas = df[PARCELAS_ENGAJAMENTO]
    df["engajamento_completo"] = parcelas.notna().all(axis=1)
    df["engajamento_parcial"] = parcelas.sum(axis=1, min_count=1).astype("Float64")
    df["engajamento"] = df["engajamento_parcial"].where(df["engajamento_completo"]).astype("Float64")

    valor = pd.Series(pd.NA, index=df.index, dtype="Float64")
    tipo = pd.Series(None, index=df.index, dtype="object")
    for coluna, nome in ORDEM_DENOMINADOR:
        usar = valor.isna() & df[coluna].notna() & (df[coluna].fillna(0) > 0)
        valor = valor.where(~usar, df[coluna])
        tipo = tipo.where(~usar, nome)
    df["denominador_valor"] = valor
    df["denominador_tipo"] = tipo
    df["taxa_engajamento"] = (df["engajamento"] / valor * 100).astype("Float64")
    return df


def taxa_consolidada(df: pd.DataFrame) -> dict:
    """Σ engajamento ÷ Σ denominador × 100, só com bases compatíveis (mesmo tipo)."""
    base = df[df["engajamento"].notna() & df["denominador_valor"].notna()]
    if base.empty:
        return {"taxa": None, "denominador_tipo": None, "n": 0, "motivo": "sem base"}
    tipos = sorted(base["denominador_tipo"].unique())
    if len(tipos) > 1:
        return {"taxa": None, "denominador_tipo": None, "n": len(base),
                "motivo": f"bases incompatíveis: {tipos}"}
    taxa = float(base["engajamento"].sum() / base["denominador_valor"].sum() * 100)
    return {"taxa": taxa, "denominador_tipo": tipos[0], "n": len(base), "motivo": None}


def variacao_pct(atual, anterior) -> float | None:
    """(atual − anterior) ÷ anterior × 100; anterior zero/ausente -> None (não calculável)."""
    if atual is None or anterior is None or pd.isna(atual) or pd.isna(anterior) or anterior == 0:
        return None
    return float((atual - anterior) / anterior * 100)


def variacao_pp(atual, anterior) -> float | None:
    """Diferença de taxas em pontos percentuais."""
    if atual is None or anterior is None or pd.isna(atual) or pd.isna(anterior):
        return None
    return float(atual - anterior)


def crescimento_seguidores(saldo_liquido, seguidores_inicio) -> float | None:
    """Saldo líquido ÷ seguidores no início × 100."""
    return variacao_pct_base(saldo_liquido, seguidores_inicio)


def variacao_pct_base(numerador, base) -> float | None:
    if numerador is None or base is None or pd.isna(numerador) or pd.isna(base) or base == 0:
        return None
    return float(numerador / base * 100)


def _ultimo(serie: pd.Series):
    validos = serie.dropna()
    return validos.iloc[-1] if len(validos) else pd.NA


COLUNAS_SOMA_DIARIA = [
    "alcance", "impressoes", "visualizacoes", "curtidas", "comentarios", "compartilhamentos",
    "salvos", "cliques_link", "engajamento",
]


def resumo_diario(df: pd.DataFrame) -> pd.DataFrame:
    """Rede × dia (data de PUBLICAÇÃO do post; a planilha não traz série diária da conta).

    - Somas com `min_count=1`: dia sem nenhum valor fica NA (não 0).
    - `posts_com_alcance` e `posts_engajamento` são os n que sustentam média/mediana por
      publicação (sem diluir por posts que não têm a métrica).
    - `taxa_num`/`taxa_den`: Σ engajamento ÷ Σ alcance só dos posts com as duas coisas, para o
      front recalcular a taxa consolidada em qualquer período/granularidade (denominador: alcance).
    - Seguidores: último valor do dia (a planilha atual não os traz: coluna toda NA).
    - Alcance, impressões e visualizações ficam em colunas separadas (nunca somados entre si).
    """
    d = df.sort_values(["rede", "data", "linha_planilha"]).copy()
    base_taxa = d["engajamento"].notna() & (d["denominador_tipo"] == "alcance")
    d["taxa_num"] = d["engajamento"].where(base_taxa)
    d["taxa_den"] = d["denominador_valor"].where(base_taxa)
    d["tem_alcance"] = d["alcance"].notna() & d["eh_post"]
    d["tem_engajamento"] = d["engajamento"].notna() & d["eh_post"]
    g = d.groupby(["rede", "data"], sort=True)
    return pd.DataFrame({
        "posts": g["eh_post"].sum(),
        "posts_com_alcance": g["tem_alcance"].sum(),
        "posts_engajamento": g["tem_engajamento"].sum(),
        "seguidores": g["seguidores"].agg(_ultimo),
        "seguidores_novos": g["seguidores_novos"].agg(_ultimo),
        **{c: g[c].sum(min_count=1) for c in COLUNAS_SOMA_DIARIA},
        "taxa_num": g["taxa_num"].sum(min_count=1),
        "taxa_den": g["taxa_den"].sum(min_count=1),
    }).reset_index()


def _taxa_grupo(g: pd.DataFrame) -> tuple[float | None, int]:
    """Taxa consolidada do grupo: Σ engajamento ÷ Σ alcance (só posts com ambos)."""
    b = g[g["engajamento"].notna() & (g["denominador_tipo"] == "alcance")]
    den = float(b["denominador_valor"].sum()) if len(b) else 0.0
    return (float(b["engajamento"].sum()) / den * 100 if den > 0 else None), int(len(b))


def agregado_conteudos(df: pd.DataFrame) -> pd.DataFrame:
    """Tema × formato × rede (só publicações): n, soma, média e mediana. `n` em todo grupo.

    `taxa_consolidada` = Σ engajamento ÷ Σ alcance (forma correta de agregar taxas);
    `taxa_engajamento_*` são estatísticas das taxas por publicação."""
    posts = df[df["eh_post"]]
    registros = []
    for (tema, formato, rede), g in posts.groupby(["tema", "formato", "rede"], sort=True):
        reg = {"tema": tema, "formato": formato, "rede": rede, "n": int(len(g))}
        for metrica in ("engajamento", "alcance", "taxa_engajamento"):
            s = g[metrica].dropna().astype(float)
            reg[f"{metrica}_n"] = int(len(s))
            reg[f"{metrica}_soma"] = float(s.sum()) if len(s) and metrica != "taxa_engajamento" else None
            reg[f"{metrica}_media"] = float(s.mean()) if len(s) else None
            reg[f"{metrica}_mediana"] = float(s.median()) if len(s) else None
        reg["taxa_consolidada"], reg["taxa_consolidada_n"] = _taxa_grupo(g)
        registros.append(reg)
    return pd.DataFrame(registros)
