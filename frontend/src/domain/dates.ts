/**
 * Calendário da base: dia 0 = primeira data das partições de publicações (docs/dados/publicacoes);
 * LAST_DAY = manifest.periodo.fim. Definido uma vez por `configureCalendar` antes do primeiro render
 * (exports `let` são ligações vivas em módulos ES: todos os importadores veem o valor atualizado).
 */
const MS = 86400000;
export let START = Date.UTC(2025, 11, 1);
export let DAYS = 365;
export let LAST_DAY = DAYS - 1;

export function configureCalendar(startIso: string, endIso: string) {
  START = Date.parse(startIso + 'T00:00:00Z');
  DAYS = Math.round((Date.parse(endIso + 'T00:00:00Z') - START) / MS) + 1;
  LAST_DAY = DAYS - 1;
}

export const dateOf = (day: number) => new Date(START + day * MS);
export const dayOf = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - START) / MS);
export const isoOf = (day: number) => dateOf(day).toISOString().slice(0, 10);
export const weekday = (day: number) => dateOf(day).getUTCDay(); // 0=dom
export const fmtDM = (day: number) => {
  const d = dateOf(day);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const fmtDMY = (day: number) => `${fmtDM(day)}/${dateOf(day).getUTCFullYear()}`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (day: number) => {
  const d = dateOf(day);
  return `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
};
export const monthKey = (day: number) => {
  const d = dateOf(day);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
/** segunda-feira da semana de `day` */
export const weekStart = (day: number) => day - ((weekday(day) + 6) % 7);

export interface Range {
  start: number;
  end: number;
}
export const rangeLen = (r: Range) => r.end - r.start + 1;
export const prevRange = (r: Range): Range => ({ start: r.start - rangeLen(r), end: r.start - 1 });
