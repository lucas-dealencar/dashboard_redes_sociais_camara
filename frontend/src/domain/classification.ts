import type { Post } from '../types';
import { postEngagement } from './aggregate';

export const NO_CLASS = 'Não informado';
export const OTHERS = '__outros__';
const MAX_SUBTYPES = 14; // o restante vira um bloco "Outros"

export interface ClassPick { type: string | null; sub: string | null }

export interface ClassGroup {
  key: string;
  label: string;
  posts: number;
  /** publicações com engajamento completo (base da soma e da média) */
  withEngagement: number;
  engagement: number;
  perPost: number | null;
  medianPerPost: number | null;
  /** participação no total do nível (0..1) */
  sharePosts: number;
  shareEngagement: number;
  /** nomes reunidos quando o grupo é "Outros" */
  members: string[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export const typeOf = (p: Post) => p.classification || NO_CLASS;
export const subOf = (p: Post) => p.subclassification || NO_CLASS;

/** Agrupa por tipo (ou por subtipo dentro de um tipo), do maior para o menor em publicações. */
export function groupClasses(posts: Post[], keyOf: (p: Post) => string, limit = false): ClassGroup[] {
  const map = new Map<string, { posts: number; withEngagement: number; engagement: number; values: number[] }>();
  for (const p of posts) {
    const k = keyOf(p);
    const g = map.get(k) ?? { posts: 0, withEngagement: 0, engagement: 0, values: [] };
    const e = postEngagement(p);
    g.posts += 1;
    if (e !== null) { g.withEngagement += 1; g.engagement += e; g.values.push(e); }
    map.set(k, g);
  }
  let rows = [...map.entries()].map(([key, g]) => ({ key, label: key, members: [key], ...g })).sort((a, b) => b.posts - a.posts);
  if (limit && rows.length > MAX_SUBTYPES + 1) {
    const rest = rows.slice(MAX_SUBTYPES);
    rows = [...rows.slice(0, MAX_SUBTYPES), {
      key: OTHERS, label: `Outros (${rest.length} subtipos)`, members: rest.map((r) => r.key),
      posts: rest.reduce((s, r) => s + r.posts, 0), withEngagement: rest.reduce((s, r) => s + r.withEngagement, 0), engagement: rest.reduce((s, r) => s + r.engagement, 0),
      values: rest.flatMap((r) => r.values),
    }];
  }
  const totalWith = rows.reduce((s, r) => s + r.withEngagement, 0) || 1;
  const totalEng = rows.reduce((s, r) => s + r.engagement, 0) || 1;
  return rows.map(({ values, ...r }) => ({
    ...r,
    medianPerPost: median(values),
    perPost: r.withEngagement ? r.engagement / r.withEngagement : null,
    // esforço comparado só entre publicações que têm engajamento, para as duas barras terem a mesma base
    sharePosts: r.withEngagement / totalWith,
    shareEngagement: r.engagement / totalEng,
  }));
}

export function matchesPick(p: Post, pick: ClassPick, others: string[]): boolean {
  if (pick.type && typeOf(p) !== pick.type) return false;
  if (!pick.sub) return true;
  return pick.sub === OTHERS ? others.includes(subOf(p)) : subOf(p) === pick.sub;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Treemap "squarified": áreas proporcionais aos valores, com blocos o mais quadrados possível. */
export function squarify(values: number[], box: Rect): Rect[] {
  const total = values.reduce((s, v) => s + v, 0);
  const out: Rect[] = values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  if (total <= 0) return out;
  const areas = values.map((v) => (v / total) * box.w * box.h);
  let { x, y, w, h } = box;
  let i = 0;
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    return Math.max(...row.map((r) => Math.max((side * side * r) / (s * s), (s * s) / (side * side * r))));
  };
  while (i < areas.length && areas[i] > 0) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    while (i + row.length < areas.length && areas[i + row.length] > 0 && worst([...row, areas[i + row.length]], side) <= worst(row, side)) row.push(areas[i + row.length]);
    const sum = row.reduce((a, b) => a + b, 0);
    const thick = sum / side;
    let offset = 0;
    row.forEach((a, k) => {
      const len = a / thick;
      out[i + k] = w >= h ? { x, y: y + offset, w: thick, h: len } : { x: x + offset, y, w: len, h: thick };
      offset += len;
    });
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    i += row.length;
  }
  return out;
}
