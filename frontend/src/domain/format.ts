const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (v: number) => nf.format(Math.round(v));
/** 4,8 mi · 185 mil · 24.580 (como nos cartões da proposta) */
export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${nf1.format(v / 1e6)} mi`;
  if (a >= 1e5) return `${nf.format(Math.round(v / 1e3))} mil`;
  if (a >= 1e4) return `${nf1.format(v / 1e3)} mil`;
  return nf.format(Math.round(v));
}
export const fmtPct = (v: number, d = 2) => `${(d === 1 ? nf1 : nf2).format(v)}%`;
export const fmtSigned = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${(d === 1 ? nf1 : nf2).format(Math.abs(v))}`;
export const fmtDeltaPct = (v: number) => `${fmtSigned(v, 1)}%`;
export const fmtDeltaPP = (v: number) => `${fmtSigned(v, 2)} p.p.`;
export const fmtSec = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}min ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`);
export const fmtShare = (v: number) => `${nf1.format(v)}%`;
export const ND = 'n/d';
