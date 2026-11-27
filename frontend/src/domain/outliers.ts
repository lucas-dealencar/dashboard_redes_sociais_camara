import type { PlatformId, Post } from '../types';
import { postEngagement } from './aggregate';

/**
 * Outliers pela dispersão "base × engajamento" de cada rede.
 *
 * Cada publicação é um ponto (log da base, log do engajamento), em que a base é o alcance, as
 * visualizações ou as impressões (a mesma da taxa). Como as redes têm escalas muito diferentes,
 * cada rede forma o seu próprio agrupamento. A distância ao centro do agrupamento é a de
 * Mahalanobis robusta (mediana e MAD no lugar de média e desvio), que respeita a correlação
 * entre base e engajamento: um post com muito alcance e muito engajamento segue a tendência e não
 * é outlier; um post com engajamento muito fora do esperado para a sua base é.
 * Sem base, o ponto é avaliado só pelo engajamento.
 */

const MIN_POR_REDE = 8; // abaixo disso não há agrupamento para comparar
const LIMITE_2D = 13.82; // qui-quadrado com 2 g.l., 99,9%
const LIMITE_1D = 10.83; // qui-quadrado com 1 g.l., 99,9%
const MAD_MIN = 0.1; // em log10: evita escala zero quando quase todos os valores são iguais

export interface ScatterPoint { post: Post; base: number | null; engagement: number; distance: number; outlier: boolean }

/** Base da taxa da publicação (alcance, visualizações ou impressões), se houver. */
export function postBase(p: Post): number | null {
  const m = p.metrics;
  const v = m.erBase === 'reach' ? m.reach : m.erBase === 'views' ? m.views : m.erBase === 'impressions' ? m.impressions : (m.reach ?? m.views ?? m.impressions);
  return v !== null && v !== undefined && v > 0 ? v : null;
}

const lg = (v: number) => Math.log10(1 + v);
function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function robust(v: number[]) {
  const med = median(v);
  const mad = Math.max(MAD_MIN, 1.4826 * median(v.map((x) => Math.abs(x - med))));
  return { med, mad };
}

/** Pontos da dispersão (só publicações com engajamento), com a distância e a marca de outlier. */
export function scatterPoints(posts: Post[]): ScatterPoint[] {
  const byNet = new Map<PlatformId, Post[]>();
  for (const p of posts) if (postEngagement(p) !== null) (byNet.get(p.platform) ?? byNet.set(p.platform, []).get(p.platform)!).push(p);
  const out: ScatterPoint[] = [];
  for (const ps of byNet.values()) {
    const ys = ps.map((p) => lg(postEngagement(p) as number));
    const withBase = ps.map((p) => postBase(p));
    const xs = withBase.filter((b): b is number => b !== null).map(lg);
    const enough = ps.length >= MIN_POR_REDE;
    const Y = robust(ys);
    const X = xs.length >= MIN_POR_REDE ? robust(xs) : null;
    // correlação entre os eixos padronizados, com os extremos limitados para não puxarem o resultado
    let r = 0;
    if (X) {
      const pares = ps.map((p, i) => [withBase[i], ys[i]] as const).filter(([b]) => b !== null).map(([b, y]) => [clip(((lg(b as number)) - X.med) / X.mad), clip((y - Y.med) / Y.mad)] as const);
      const sxy = pares.reduce((s, [a, b]) => s + a * b, 0), sxx = pares.reduce((s, [a]) => s + a * a, 0), syy = pares.reduce((s, [, b]) => s + b * b, 0);
      r = sxx && syy ? Math.max(-0.95, Math.min(0.95, sxy / Math.sqrt(sxx * syy))) : 0;
    }
    ps.forEach((p, i) => {
      const zy = (ys[i] - Y.med) / Y.mad;
      const b = withBase[i];
      let distance: number, limit: number;
      if (b !== null && X) {
        const zx = (lg(b) - X.med) / X.mad;
        distance = (zx * zx - 2 * r * zx * zy + zy * zy) / (1 - r * r);
        limit = LIMITE_2D;
      } else { distance = zy * zy; limit = LIMITE_1D; }
      out.push({ post: p, base: b, engagement: postEngagement(p) as number, distance, outlier: enough && distance > limit });
    });
  }
  return out;
}
const clip = (v: number) => Math.max(-3, Math.min(3, v));
