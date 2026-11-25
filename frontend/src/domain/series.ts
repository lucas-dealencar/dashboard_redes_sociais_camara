import { weekStart, monthKey, fmtDM, monthLabel, dayOf, type Range, rangeLen } from './dates';
import { evalKpi, type KpiId } from './kpis';
import { quantile, type DailyTable } from './aggregate';

export type Granularity = 'dia' | 'semana' | 'mes';
export type EvoMetric = 'followers' | 'net' | 'reach' | 'views' | 'impressions' | 'engagement' | 'er';

export const EVO_METRICS: { id: EvoMetric; label: string; fmt: 'compact' | 'pct'; kpi: KpiId; peaks: boolean }[] = [
  { id: 'followers', label: 'Seguidores totais', fmt: 'compact', kpi: 'followers', peaks: false },
  { id: 'net', label: 'Saldo diário de seguidores', fmt: 'compact', kpi: 'net', peaks: true },
  { id: 'reach', label: 'Alcance', fmt: 'compact', kpi: 'reach', peaks: true },
  { id: 'views', label: 'Visualizações', fmt: 'compact', kpi: 'views', peaks: true },
  { id: 'impressions', label: 'Impressões', fmt: 'compact', kpi: 'impressions', peaks: true },
  { id: 'engagement', label: 'Engajamento', fmt: 'compact', kpi: 'engagement', peaks: true },
  { id: 'er', label: 'Taxa de engajamento', fmt: 'pct', kpi: 'er', peaks: true },
];

export interface Bucket {
  start: number;
  end: number;
  label: string;
}

export function makeBuckets(r: Range, g: Granularity): Bucket[] {
  const out: Bucket[] = [];
  if (g === 'dia') {
    for (let d = r.start; d <= r.end; d++) out.push({ start: d, end: d, label: fmtDM(d) });
  } else if (g === 'semana') {
    for (let s = weekStart(r.start); s <= r.end; s += 7) {
      const a = Math.max(s, r.start), b = Math.min(s + 6, r.end);
      out.push({ start: a, end: b, label: `${fmtDM(a)}–${fmtDM(b)}` });
    }
  } else {
    let a = r.start;
    while (a <= r.end) {
      let b = a;
      while (b + 1 <= r.end && monthKey(b + 1) === monthKey(a)) b++;
      out.push({ start: a, end: b, label: monthLabel(a) });
      a = b + 1;
    }
  }
  return out;
}

export function bucketValues(t: DailyTable, metric: EvoMetric, buckets: Bucket[]): (number | null)[] {
  const kpi = EVO_METRICS.find((m) => m.id === metric)!.kpi;
  return buckets.map((b) => (kpi === 'followers' ? t.s.followers[b.end] || null : evalKpi(kpi, t, b.start, b.end)));
}

/** Picos: pontos acima de Q3 + 1,5·IQR que também são máximos locais (no máximo `max`). */
export function detectPeaks(values: (number | null)[], max = 4): number[] {
  const xs = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (xs.length < 8) return [];
  const q1 = quantile(xs, 0.25), q3 = quantile(xs, 0.75);
  const lim = q3 + 1.5 * (q3 - q1);
  const cand: number[] = [];
  values.forEach((v, i) => {
    if (v === null || v <= lim) return;
    const l = values[i - 1] ?? -Infinity, r = values[i + 1] ?? -Infinity;
    if (v >= (l ?? -Infinity) && v >= (r ?? -Infinity)) cand.push(i);
  });
  return cand.sort((a, b) => (values[b] as number) - (values[a] as number)).slice(0, max).sort((a, b) => a - b);
}

export const bucketIndexOfDay = (buckets: Bucket[], day: number) => buckets.findIndex((b) => day >= b.start && day <= b.end);
export { dayOf, rangeLen };
