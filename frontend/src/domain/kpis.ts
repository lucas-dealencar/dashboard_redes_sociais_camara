import type { Dataset, PlatformId, Post } from '../types';
import { PLATFORM_BY_ID, type AvailKey } from '../data/catalog';
import { buildTable, median, quantile, type DailyTable, type Selection, filterPosts, postEngagement } from './aggregate';
import { LAST_DAY, rangeLen, type Range } from './dates';

export type KpiId =
  | 'followers' | 'newF' | 'lost' | 'net' | 'growth'
  | 'reach' | 'views' | 'impressions' | 'posts'
  | 'likes' | 'comments' | 'shares' | 'saves' | 'engagement'
  | 'er' | 'reachPerPost' | 'viewsPerPost' | 'imprPerPost' | 'engPerPost' | 'reachPerFollower';

export type ValueFormat = 'int' | 'pct' | 'compact';
export interface KpiDef {
  id: KpiId;
  label: string;
  group: 'audiencia' | 'distribuicao' | 'interacoes' | 'eficiencia';
  fmt: ValueFormat;
  /** como a variação é expressa: % relativa ou pontos percentuais (taxas) */
  delta: 'pct' | 'pp';
  /** estoque (saldo em um instante): sem benchmark */
  stock?: boolean;
  /** indicador de conta: não é afetado por filtros de tema/formato/pago */
  accountLevel?: boolean;
  /** plataformas que entregam o dado (função de cobertura) */
  covers: (p: PlatformId) => boolean;
  hint?: string;
}

const av = (k: AvailKey) => (p: PlatformId) => PLATFORM_BY_ID[p].available[k];
const fol = (p: PlatformId) => PLATFORM_BY_ID[p].hasFollowers;

export const KPI_DEFS: KpiDef[] = [
  { id: 'followers', label: 'Seguidores atuais', group: 'audiencia', fmt: 'compact', delta: 'pct', stock: true, accountLevel: true, covers: fol, hint: 'Soma de vínculos de seguimento, não de pessoas únicas.' },
  { id: 'newF', label: 'Novos seguidores', group: 'audiencia', fmt: 'compact', delta: 'pct', accountLevel: true, covers: (p) => PLATFORM_BY_ID[p].hasNewFollowers },
  { id: 'lost', label: 'Perdas de seguidores', group: 'audiencia', fmt: 'compact', delta: 'pct', accountLevel: true, covers: (p) => PLATFORM_BY_ID[p].hasLost },
  { id: 'net', label: 'Saldo líquido', group: 'audiencia', fmt: 'compact', delta: 'pct', accountLevel: true, covers: fol },
  { id: 'growth', label: 'Crescimento de seguidores', group: 'audiencia', fmt: 'pct', delta: 'pp', accountLevel: true, covers: fol },
  { id: 'reach', label: 'Alcance', group: 'distribuicao', fmt: 'compact', delta: 'pct', covers: av('reach'), hint: 'Alcance somado entre redes não representa audiência única.' },
  { id: 'views', label: 'Visualizações', group: 'distribuicao', fmt: 'compact', delta: 'pct', covers: av('views') },
  { id: 'impressions', label: 'Impressões', group: 'distribuicao', fmt: 'compact', delta: 'pct', covers: av('impressions') },
  { id: 'posts', label: 'Publicações', group: 'distribuicao', fmt: 'int', delta: 'pct', covers: () => true },
  { id: 'likes', label: 'Curtidas / reações', group: 'interacoes', fmt: 'compact', delta: 'pct', covers: av('likes') },
  { id: 'comments', label: 'Comentários / respostas', group: 'interacoes', fmt: 'compact', delta: 'pct', covers: av('comments') },
  { id: 'shares', label: 'Compartilhamentos / republicações', group: 'interacoes', fmt: 'compact', delta: 'pct', covers: av('shares') },
  { id: 'saves', label: 'Salvamentos', group: 'interacoes', fmt: 'compact', delta: 'pct', covers: av('saves'), hint: 'Exibidos à parte do engajamento básico.' },
  { id: 'engagement', label: 'Engajamento total', group: 'interacoes', fmt: 'compact', delta: 'pct', covers: av('engagement'), hint: 'Curtidas/reações + comentários/respostas + compartilhamentos/republicações.' },
  { id: 'er', label: 'Taxa de engajamento', group: 'eficiencia', fmt: 'pct', delta: 'pp', covers: av('er'), hint: 'Engajamento ÷ alcance (base informada pelo pipeline) × 100; consolidada só entre redes com a mesma base.' },
  { id: 'reachPerPost', label: 'Alcance por publicação', group: 'eficiencia', fmt: 'compact', delta: 'pct', covers: av('reach') },
  { id: 'viewsPerPost', label: 'Visualizações por publicação', group: 'eficiencia', fmt: 'compact', delta: 'pct', covers: av('views') },
  { id: 'imprPerPost', label: 'Impressões por publicação', group: 'eficiencia', fmt: 'compact', delta: 'pct', covers: av('impressions') },
  { id: 'engPerPost', label: 'Engajamento por publicação', group: 'eficiencia', fmt: 'compact', delta: 'pct', covers: av('engagement'), hint: 'Média entre as publicações com engajamento completo.' },
  { id: 'reachPerFollower', label: 'Alcance/Seguidores', group: 'eficiencia', fmt: 'pct', delta: 'pp', covers: (p) => PLATFORM_BY_ID[p].available.reach && fol(p), hint: 'Alcance médio por publicação ÷ seguidores no fim do período.' },
];
export const KPI_BY_ID = Object.fromEntries(KPI_DEFS.map((k) => [k.id, k])) as Record<KpiId, KpiDef>;

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Valor do KPI na janela [a,b]. `null` = indisponível / não calculável (diferente de zero). */
export function evalKpi(id: KpiId, t: DailyTable, a: number, b: number): number | null {
  const covered = t.platforms.some((p) => KPI_BY_ID[id].covers(p));
  if (!covered) return null;
  const S = (k: Parameters<DailyTable['sum']>[0]) => t.sum(k, a, b);
  switch (id) {
    case 'followers': return t.s.followers[Math.min(b, LAST_DAY)] || null;
    case 'newF': return S('newF');
    case 'lost': return S('lostF');
    case 'net': return S('net');
    case 'growth': { const start = a > 0 ? t.s.followers[a - 1] : t.s.followers[0] - t.s.net[0]; return div(S('net'), start) === null ? null : (S('net') / start) * 100; }
    // sem nenhuma publicação com a métrica no recorte = indisponível (n/d), não zero
    case 'reach': return S('postsReach') ? S('reach') : null;
    case 'views': return S('postsViews') ? S('views') : null;
    case 'impressions': return S('postsImpr') ? S('impressions') : null;
    case 'posts': return S('posts');
    case 'likes': return S('likes');
    case 'comments': return S('comments');
    case 'shares': return S('shares');
    case 'saves': return S('saves');
    case 'engagement': return S('postsEng') ? S('engagement') : null;
    case 'er': { const r = div(S('erNum'), S('erDen')); return r === null ? null : r * 100; }
    case 'reachPerPost': return div(S('reach'), S('postsReach'));
    case 'viewsPerPost': return div(S('views'), S('postsViews'));
    case 'imprPerPost': return div(S('impressions'), S('postsImpr'));
    case 'engPerPost': return div(S('engagement'), S('postsEng'));
    case 'reachPerFollower': { const per = div(S('reach'), S('postsReach')); const f = t.s.followers[Math.min(b, LAST_DAY)]; return per === null || !f ? null : (per / f) * 100; }
  }
}

export interface Bench {
  median: number;
  q1: number;
  q3: number;
  windows: number;
  status: 'abaixo' | 'dentro' | 'acima';
}

/** Benchmark interno: janelas móveis equivalentes na referência anterior (exclui o período avaliado). */
export function benchmarkFor(id: KpiId, t: DailyTable, r: Range, refDays: number, value: number | null): Bench | null {
  if (KPI_BY_ID[id].stock || value === null) return null;
  const L = rangeLen(r);
  const ref = Math.max(refDays, L);
  const first = Math.max(0, r.start - ref);
  const vals: number[] = [];
  for (let e = r.start - 1; e - L + 1 >= first; e--) {
    const v = evalKpi(id, t, e - L + 1, e);
    if (v !== null) vals.push(v);
  }
  if (vals.length < 3) return null;
  const sorted = vals.sort((x, y) => x - y);
  const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75), med = quantile(sorted, 0.5);
  return { median: med, q1, q3, windows: sorted.length, status: value < q1 ? 'abaixo' : value > q3 ? 'acima' : 'dentro' };
}

export interface KpiResult {
  def: KpiDef;
  value: number | null;
  prev: number | null;
  /** variação: % relativa (null = não calculável) ou p.p. */
  delta: number | null;
  bench: Bench | null;
  have: PlatformId[];
  miss: PlatformId[];
  medianPerPost: number | null;
  spark: number[];
}

const medianOf = (posts: Post[], pick: (p: Post) => number | null) => median(posts.map(pick).filter((v): v is number => v !== null));
const MEDIAN_PICK: Partial<Record<KpiId, (p: Post) => number | null>> = {
  reach: (p) => p.metrics.reach, views: (p) => p.metrics.views, impressions: (p) => p.metrics.impressions, engagement: (p) => postEngagement(p),
};

export function computeKpi(ds: Dataset, sel: Selection, id: KpiId, r: Range, prev: Range, refDays: number, withMedian = true): KpiResult {
  const t = buildTable(ds, sel);
  const def = KPI_BY_ID[id];
  const value = evalKpi(id, t, r.start, r.end);
  const pv = prev.start >= 0 ? evalKpi(id, t, prev.start, prev.end) : null;
  let delta: number | null = null;
  if (value !== null && pv !== null) delta = def.delta === 'pp' ? value - pv : pv === 0 ? null : ((value - pv) / Math.abs(pv)) * 100;
  const have = t.platforms.filter((p) => def.covers(p));
  const miss = t.platforms.filter((p) => !def.covers(p));
  const bench = benchmarkFor(id, t, r, refDays, value);
  const pick = MEDIAN_PICK[id];
  const medianPerPost = withMedian && pick ? medianOf(filterPosts(ds, sel, r.start, r.end), pick) : null;
  const spark: number[] = [];
  const L = rangeLen(r);
  const step = Math.max(1, Math.round(L / 24));
  for (let s = r.start; s <= r.end; s += step) {
    const e = Math.min(r.end, s + step - 1);
    const v = def.stock ? t.s.followers[e] : evalKpi(id, t, s, e);
    spark.push(v ?? 0);
  }
  return { def, value, prev: pv, delta, bench, have, miss, medianPerPost, spark };
}

/** KPI principal da rede, definido pelo pipeline (config/redes.py): hoje, engajamento. */
export function principalId(p: PlatformId): KpiId {
  return PLATFORM_BY_ID[p].kpi;
}
