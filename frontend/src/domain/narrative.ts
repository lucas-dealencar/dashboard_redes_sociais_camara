import { KPI_BY_ID, type KpiId, type KpiResult } from './kpis';
import { fmtCompact, fmtInt, fmtPct } from './format';

export interface NetRow { name: string; value: number | null; delta: number | null }
export interface SectionCfg {
  id: 'audiencia' | 'distribuicao' | 'interacoes' | 'eficiencia';
  title: string;
  sub: string;
  main: KpiId;
  others: KpiId[];
  caveat: string;
}

export const SECTIONS: SectionCfg[] = [
  { id: 'audiencia', title: 'Audiência', sub: 'Seguidores como vínculos de seguimento, não pessoas únicas', main: 'newF', others: ['followers', 'lost', 'net', 'growth'],
    caveat: 'Lembre que seguidores somados entre redes são vínculos de seguimento, e não pessoas únicas.' },
  { id: 'distribuicao', title: 'Alcance e distribuição', sub: 'Alcance, visualizações e impressões têm definições próprias e não são somados entre si', main: 'reach', others: ['views', 'impressions', 'posts'],
    caveat: 'O alcance somado entre redes não representa audiência única, e visualizações e impressões têm definições próprias.' },
  { id: 'interacoes', title: 'Interações', sub: 'Engajamento básico = curtidas/reações + comentários/respostas + compartilhamentos/republicações', main: 'engagement', others: ['likes', 'comments', 'shares', 'saves'],
    caveat: 'O engajamento considera curtidas, comentários e compartilhamentos; os salvamentos aparecem separadamente.' },
  { id: 'eficiencia', title: 'Eficiência e médias por publicação', sub: 'Evitam que o aumento da frequência distorça a leitura', main: 'engPerPost', others: ['er', 'reachPerPost', 'viewsPerPost', 'imprPerPost', 'reachPerFollower'],
    caveat: 'As médias por publicação evitam que o aumento da frequência de postagens distorça a leitura do desempenho.' },
];

const fmtVal = (r: KpiResult) => {
  if (r.value === null) return 'n/d';
  return r.def.fmt === 'pct' ? fmtPct(r.value, 2) : r.def.fmt === 'int' ? fmtInt(r.value) : fmtCompact(r.value);
};
const dirText = (delta: number | null, kind: 'pct' | 'pp'): string => {
  if (delta === null) return 'variação não calculável';
  if (Math.abs(delta) < 0.05) return 'estabilidade';
  const n = Math.abs(delta).toFixed(kind === 'pp' ? 2 : 1).replace('.', ',');
  return `${delta > 0 ? 'alta' : 'queda'} de ${n}${kind === 'pp' ? ' p.p.' : '%'}`;
};
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const benchPhr = (r: KpiResult, ref: number) => (r.bench ? (r.bench.status === 'acima' ? `acima do padrão dos últimos ${ref} dias` : r.bench.status === 'abaixo' ? `abaixo do padrão dos últimos ${ref} dias` : `dentro do padrão dos últimos ${ref} dias`) : null);
const isGood = (r: KpiResult) => (r.delta === null || Math.abs(r.delta) < 0.05 ? null : r.def.id === 'lost' ? r.delta < 0 : r.delta > 0);
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Resumo de 100 a 150 palavras com base nos cartões da seção. */
export function describeSection(cfg: SectionCfg, k: Record<KpiId, KpiResult>, nets: NetRow[], refDays: number): string {
  const main = k[cfg.main];
  const all = [cfg.main, ...cfg.others].map((id) => k[id]);
  const ok = all.filter((r) => r.value !== null);
  const miss = all.filter((r) => r.value === null && r.def.id !== cfg.main);
  const cand: string[] = [];

  if (main.value !== null) {
    const bp = benchPhr(main, refDays);
    cand.push(`${main.def.label} no período: ${fmtVal(main)}, com ${dirText(main.delta, main.def.delta)} frente ao período anterior${bp ? `, resultado ${bp}` : ''}.`);
  } else cand.push(`${main.def.label} não está disponível para as redes selecionadas neste recorte.`);

  const rest = ok.filter((r) => r.def.id !== cfg.main).map((r) => `${lc(r.def.label)} ${fmtVal(r)} (${dirText(r.delta, r.def.delta)})`);
  if (rest.length) cand.push(`Entre os demais indicadores: ${rest.join('; ')}.`);
  if (miss.length) cand.push(`${miss.map((r) => r.def.label).join(', ')} ${miss.length === 1 ? 'não está disponível' : 'não estão disponíveis'} para as redes selecionadas.`);

  const withVal = nets.filter((n) => n.value !== null);
  if (withVal.length > 1) {
    const lead = [...withVal].sort((a, b) => (b.value as number) - (a.value as number))[0];
    cand.push(`O ${lead.name} lidera em ${lc(main.def.label)}, com ${main.def.fmt === 'pct' ? fmtPct(lead.value as number, 2) : fmtCompact(lead.value as number)}.`);
    const ds = withVal.filter((n) => n.delta !== null);
    if (ds.length > 1) {
      const up = [...ds].sort((a, b) => (b.delta as number) - (a.delta as number))[0], dn = [...ds].sort((a, b) => (a.delta as number) - (b.delta as number))[0];
      if (up.name !== dn.name) cand.push(`A maior alta foi do ${up.name} (${dirText(up.delta, main.def.delta)}), e a maior queda, do ${dn.name} (${dirText(dn.delta, main.def.delta)}).`);
    }
  }

  const withB = all.filter((r) => r.bench);
  if (withB.length) {
    const a = withB.filter((r) => r.bench!.status === 'acima').length, d = withB.filter((r) => r.bench!.status === 'dentro').length, b = withB.filter((r) => r.bench!.status === 'abaixo').length;
    cand.push(`Frente ao benchmark de ${refDays} dias: ${plural(a, 'indicador acima', 'indicadores acima')} do padrão, ${d} dentro e ${b} abaixo.`);
  }
  const pos = ok.filter((r) => isGood(r) === true).slice(0, 3).map((r) => lc(r.def.label));
  const neg = ok.filter((r) => isGood(r) === false).slice(0, 3).map((r) => lc(r.def.label));
  cand.push(`${pos.length ? `Destaques positivos: ${pos.join(', ')}.` : 'Nenhum indicador teve ganho relevante.'} ${neg.length ? `Pontos de atenção: ${neg.join(', ')}.` : 'Nenhum indicador apresentou perda relevante.'}`);
  cand.push(cfg.caveat);
  const filler = ['Os valores consideram apenas as redes e os perfis selecionados nos filtros globais.', 'Indicadores indisponíveis aparecem como n/d e nunca são tratados como zero.', 'As variações comparam o período atual com o período anterior de mesma duração.', 'Os cartões detalhados mostram cada indicador com variação e benchmark interno.', 'A aba Evolução e redes ajuda a investigar as causas das oscilações.', 'Use os filtros globais para recortar por rede, perfil ou período.'];

  const out: string[] = [];
  let n = 0;
  for (const s of cand) { const w = words(s); if (n + w <= 150) { out.push(s); n += w; } }
  for (const s of filler) { if (n >= 100) break; const w = words(s); if (n + w <= 150) { out.push(s); n += w; } }
  return out.join(' ');
}
export const wordCount = words;
export { KPI_BY_ID };
