import type { Dataset, FormatId, Post, PlatformId } from '../types';
import { PLATFORM_BY_ID, PLATFORM_IDS } from '../data/catalog';
import { DAYS } from './dates';

export interface Selection {
  platforms: PlatformId[]; // vazio = todas
  profileIds: string[]; // vazio = todos
  themeIds: string[];
  formats: FormatId[];
  paid: 'all' | 'organico' | 'pago';
}

export const EMPTY_SELECTION: Selection = { platforms: [], profileIds: [], themeIds: [], formats: [], paid: 'all' };

export const activePlatforms = (s: Selection): PlatformId[] => (s.platforms.length ? s.platforms : PLATFORM_IDS);
export const hasContentFilter = (s: Selection) => s.themeIds.length > 0 || s.formats.length > 0 || s.paid !== 'all';

export type ErBase = 'reach' | 'views' | 'impressions';

type SeriesKey =
  | 'reach' | 'views' | 'impressions' | 'likes' | 'comments' | 'shares' | 'saves' | 'clicks'
  | 'posts' | 'postsReach' | 'postsViews' | 'postsImpr' | 'postsEng' | 'engagement' | 'erNum' | 'erDen'
  | 'followers' | 'newF' | 'lostF' | 'net';

const KEYS: SeriesKey[] = ['reach', 'views', 'impressions', 'likes', 'comments', 'shares', 'saves', 'clicks', 'posts', 'postsReach', 'postsViews', 'postsImpr', 'postsEng', 'engagement', 'erNum', 'erDen', 'followers', 'newF', 'lostF', 'net'];

export interface DailyTable {
  sel: Selection;
  platforms: PlatformId[];
  erBase: ErBase | null;
  erPlatforms: PlatformId[];
  s: Record<SeriesKey, Float64Array>;
  cum: Record<SeriesKey, Float64Array>;
  /** soma no intervalo [a,b] (inclusive) */
  sum: (k: SeriesKey, a: number, b: number) => number;
}

/** Engajamento básico calculado pelo pipeline (null = incompleto/indisponível, nunca zero). */
export const postEngagement = (p: Post): number | null => p.metrics.engagement;
export const postDenominator = (p: Post, base: ErBase | null): number | null => (base ? p.metrics[base] : null);

export function postMatches(p: Post, s: Selection, plats: Set<PlatformId>): boolean {
  if (!plats.has(p.platform)) return false;
  if (s.profileIds.length && !s.profileIds.includes(p.profileId)) return false;
  if (s.themeIds.length && !s.themeIds.includes(p.themeId)) return false;
  if (s.formats.length && !s.formats.includes(p.format)) return false;
  if (s.paid === 'organico' && p.paid) return false;
  if (s.paid === 'pago' && !p.paid) return false;
  return true;
}

const cache = new WeakMap<Dataset, Map<string, DailyTable>>();

export function buildTable(ds: Dataset, sel: Selection): DailyTable {
  let m = cache.get(ds);
  if (!m) { m = new Map(); cache.set(ds, m); }
  const key = JSON.stringify([sel.platforms, sel.profileIds, sel.themeIds, sel.formats, sel.paid]);
  const hit = m.get(key);
  if (hit) return hit;

  const platforms = activePlatforms(sel);
  const plats = new Set(platforms);
  const s = Object.fromEntries(KEYS.map((k) => [k, new Float64Array(DAYS)])) as Record<SeriesKey, Float64Array>;
  // Taxa consolidada só entre bases compatíveis: usa a base (alcance › visualizações › impressões) que alguma rede do recorte tem,
  // e soma apenas publicações cuja taxa (do pipeline) foi calculada com essa mesma base.
  const erBase: ErBase | null = platforms.some((p) => PLATFORM_BY_ID[p].available.er && PLATFORM_BY_ID[p].available.reach) ? 'reach'
    : platforms.some((p) => PLATFORM_BY_ID[p].available.er && PLATFORM_BY_ID[p].available.views) ? 'views'
    : platforms.some((p) => PLATFORM_BY_ID[p].available.er && PLATFORM_BY_ID[p].available.impressions) ? 'impressions' : null;
  const erPlatforms = erBase ? platforms.filter((p) => PLATFORM_BY_ID[p].available.er && PLATFORM_BY_ID[p].available[erBase]) : [];

  for (const p of ds.posts) {
    if (!postMatches(p, sel, plats)) continue;
    const d = p.day;
    if (d < 0 || d >= DAYS) continue;
    const mt = p.metrics;
    s.posts[d] += 1;
    if (mt.reach !== null) { s.reach[d] += mt.reach; s.postsReach[d] += 1; }
    if (mt.views !== null) { s.views[d] += mt.views; s.postsViews[d] += 1; }
    if (mt.impressions !== null) { s.impressions[d] += mt.impressions; s.postsImpr[d] += 1; }
    if (mt.likes !== null) s.likes[d] += mt.likes;
    if (mt.comments !== null) s.comments[d] += mt.comments;
    if (mt.shares !== null) s.shares[d] += mt.shares;
    if (mt.saves !== null) s.saves[d] += mt.saves;
    if (mt.clicks !== null) s.clicks[d] += mt.clicks;
    const eng = mt.engagement;
    if (eng !== null) { s.engagement[d] += eng; s.postsEng[d] += 1; }
    if (erBase && eng !== null && mt.er !== null && mt.erBase === erBase) {
      const den = mt[erBase];
      if (den) { s.erNum[d] += eng; s.erDen[d] += den; }
    }
  }
  for (const a of ds.account) {
    const prof = ds.profiles.find((x) => x.id === a.profileId);
    if (!prof || !plats.has(prof.platform)) continue;
    if (sel.profileIds.length && !sel.profileIds.includes(a.profileId)) continue;
    s.followers[a.day] += a.followers;
    s.net[a.day] += a.net;
    if (a.newFollowers !== null) s.newF[a.day] += a.newFollowers;
    if (a.lost !== null) s.lostF[a.day] += a.lost;
  }
  const cum = Object.fromEntries(KEYS.map((k) => {
    const c = new Float64Array(DAYS + 1);
    for (let i = 0; i < DAYS; i++) c[i + 1] = c[i] + s[k][i];
    return [k, c];
  })) as Record<SeriesKey, Float64Array>;
  const sum = (k: SeriesKey, a: number, b: number) => cum[k][Math.min(DAYS, b + 1)] - cum[k][Math.max(0, a)];
  const t: DailyTable = { sel, platforms, erBase, erPlatforms, s, cum, sum };
  m.set(key, t);
  return t;
}

/** Posts que atendem à seleção (para rankings, picos e estatísticas de conteúdo). */
export function filterPosts(ds: Dataset, sel: Selection, a: number, b: number): Post[] {
  const plats = new Set(activePlatforms(sel));
  return ds.posts.filter((p) => p.day >= a && p.day <= b && postMatches(p, sel, plats));
}

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const quantile = (sorted: number[], q: number): number => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
