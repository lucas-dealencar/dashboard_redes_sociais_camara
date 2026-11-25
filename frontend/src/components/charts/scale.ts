export function niceScale(min: number, max: number, count = 5): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) { max = min + 1; if (min === 0) min = 0; }
  const span = max - min;
  const rough = span / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { min: lo, max: hi, ticks };
}
export const SEQ = ['#d7e6e8', '#b3d6d3', '#86c1bb', '#4fa7a1', '#2b8a8a', '#1a6a74', '#134e5e'];
/** índice 0..1 → cor sequencial em 5 degraus (como a matriz da proposta) */
export const HEAT = ['#e3efee', '#b5dbd2', '#7fc0b2', '#3d9a89', '#17705f'];
export function heatColor(t: number): { bg: string; fg: string } {
  const i = Math.max(0, Math.min(HEAT.length - 1, Math.floor(t * HEAT.length - 1e-9)));
  return { bg: HEAT[i], fg: i >= 3 ? '#fff' : '#07333a' };
}
export const AGE_COLORS = SEQ;
export const GENDER_COLORS = ['#134e5e', '#36c7a6', '#b7cdd0'];
