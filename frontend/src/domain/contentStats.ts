import type { FormatId, Post, PlatformId } from '../types';
import { PLATFORM_BY_ID } from '../data/catalog';
import { mean, median, postEngagement } from './aggregate';

export type PostMetricId = 'reach' | 'views' | 'impressions' | 'engagement' | 'er' | 'likes' | 'comments' | 'shares' | 'saves' | 'clicks' | 'kpi' | 'watch' | 'retention' | 'completion';
export type Agg = 'media' | 'mediana' | 'total';

export const POST_METRICS: { id: PostMetricId; label: string; fmt: 'compact' | 'pct' | 'sec' }[] = [
  { id: 'kpi', label: 'KPI principal da rede', fmt: 'compact' },
  { id: 'reach', label: 'Alcance', fmt: 'compact' },
  { id: 'views', label: 'Visualizações', fmt: 'compact' },
  { id: 'impressions', label: 'Impressões', fmt: 'compact' },
  { id: 'engagement', label: 'Engajamento', fmt: 'compact' },
  { id: 'er', label: 'Taxa de engajamento', fmt: 'pct' },
  { id: 'likes', label: 'Curtidas / reações', fmt: 'compact' },
  { id: 'comments', label: 'Comentários / respostas', fmt: 'compact' },
  { id: 'shares', label: 'Compartilhamentos', fmt: 'compact' },
  { id: 'saves', label: 'Salvamentos', fmt: 'compact' },
  { id: 'clicks', label: 'Cliques', fmt: 'compact' },
  { id: 'watch', label: 'Tempo médio assistido', fmt: 'sec' },
  { id: 'retention', label: 'Retenção média', fmt: 'pct' },
  { id: 'completion', label: 'Taxa de conclusão', fmt: 'pct' },
];

/** Denominador usado pelo pipeline na taxa da publicação (`denominador_tipo`). */
export const erDenominator = (p: Post): { den: number; base: 'reach' | 'views' | 'impressions' } | null => {
  const m = p.metrics;
  if (m.er === null || !m.erBase) return null;
  const den = m[m.erBase];
  return den ? { den, base: m.erBase } : null;
};

export function postMetric(p: Post, id: PostMetricId): number | null {
  const m = p.metrics;
  switch (id) {
    case 'reach': return m.reach;
    case 'views': return m.views;
    case 'impressions': return m.impressions;
    case 'engagement': return postEngagement(p);
    case 'er': return p.metrics.er;
    case 'likes': return m.likes;
    case 'comments': return m.comments;
    case 'shares': return m.shares;
    case 'saves': return m.saves;
    case 'clicks': return m.clicks;
    case 'watch': return m.avgWatchSec;
    case 'retention': return m.retention === null ? null : m.retention * 100;
    case 'completion': return m.completion === null ? null : m.completion * 100;
    case 'kpi': {
      const k = PLATFORM_BY_ID[p.platform].kpi;
      return k === 'engagement' ? postEngagement(p) : m[k];
    }
  }
}

export interface GroupStat {
  key: string;
  n: number; // publicações no grupo
  nValid: number; // publicações com a métrica disponível
  value: number | null;
}

export function aggregate(posts: Post[], metric: PostMetricId, agg: Agg): { value: number | null; n: number; nValid: number } {
  if (metric === 'er' && agg === 'total') {
    let num = 0, den = 0, k = 0;
    // taxa agregada = Σ engajamento ÷ Σ denominador, só com a base predominante (alcance) para não misturar bases
    for (const p of posts) { const d = erDenominator(p); const e = postEngagement(p); if (d && e !== null && d.base === 'reach') { num += e; den += d.den; k++; } }
    return { value: den ? (num / den) * 100 : null, n: posts.length, nValid: k };
  }
  const vals = posts.map((p) => postMetric(p, metric)).filter((v): v is number => v !== null);
  const value = !vals.length ? null : agg === 'total' ? vals.reduce((s, v) => s + v, 0) : agg === 'media' ? mean(vals) : median(vals);
  return { value, n: posts.length, nValid: vals.length };
}

export function groupBy(posts: Post[], keyOf: (p: Post) => string, metric: PostMetricId, agg: Agg): GroupStat[] {
  const g = new Map<string, Post[]>();
  for (const p of posts) { const k = keyOf(p); (g.get(k) ?? g.set(k, []).get(k)!).push(p); }
  return [...g.entries()].map(([key, ps]) => ({ key, ...aggregate(ps, metric, agg) }));
}

export type { FormatId, PlatformId };
