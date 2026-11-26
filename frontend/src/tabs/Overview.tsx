import { useMemo, useRef, useState } from 'react';
import { PLATFORMS, PLATFORM_BY_ID } from '../data/catalog';
import { buildTable, activePlatforms } from '../domain/aggregate';
import { computeKpi, evalKpi, KPI_BY_ID, KPI_DEFS, principalId, type KpiId } from '../domain/kpis';
import { prevRange, rangeLen } from '../domain/dates';
import { fmtCompact, fmtDeltaPP, fmtDeltaPct, fmtInt, fmtPct, fmtShare, ND } from '../domain/format';
import { useStore } from '../state/store';
import { Section, Panel, Well, Note, Select, ExportButtons, DataTable, PlatformBadge, type Col } from '../components/ui/ui';
import { KpiLite, SectionCard, fmtKpi } from '../components/Kpi';
import { describeSection, SECTIONS, type NetRow } from '../domain/narrative';
import { HBars, LineChart, Legend, PngButton } from '../components/charts/charts';
import { bucketValues, makeBuckets, type Granularity } from '../domain/series';
import type { PlatformId } from '../types';
import type { Table } from '../utils/export';

const SHARE_METRICS: { id: KpiId; label: string }[] = [
  { id: 'engagement', label: 'Engajamento total' }, { id: 'posts', label: 'Publicações' }, { id: 'followers', label: 'Seguidores atuais' },
  { id: 'newF', label: 'Novos seguidores' }, { id: 'reach', label: 'Alcance (soma de vínculos, ≠ audiência única)' }, { id: 'views', label: 'Visualizações' }, { id: 'impressions', label: 'Impressões' },
];

export function Overview() {
  const { ds, state } = useStore();
  const hasFollowers = PLATFORMS.some((p) => p.hasFollowers);
  const { sel, range, benchDays } = state;
  const prev = prevRange(range);
  const kpis = useMemo(() => Object.fromEntries(KPI_DEFS.map((d) => [d.id, computeKpi(ds, sel, d.id, range, prev, benchDays)])) as Record<KpiId, ReturnType<typeof computeKpi>>, [ds, sel, range, prev.start, benchDays]);
  const plats = activePlatforms(sel).filter((p) => !sel.profileIds.length || sel.profileIds.some((id) => id.startsWith(p + '-')));
  const nets = useMemo(() => Object.fromEntries(SECTIONS.map((c) => [c.id, plats.map((p) => {
    const r = computeKpi(ds, { ...sel, platforms: [p] }, c.main, range, prev, benchDays, false);
    return { name: PLATFORM_BY_ID[p].name, value: r.value, delta: r.delta };
  })])) as Record<string, NetRow[]>, [ds, sel, range, prev.start, benchDays, plats.join()]);
  const SHORT: Record<string, string> = { audiencia: 'Audiência', distribuicao: 'Alcance', interacoes: 'Interações', eficiencia: 'Eficiência' };
  const SUPPORT: Record<string, string> = {
    audiencia: 'seguidores atuais, perdas, saldo líquido e crescimento',
    distribuicao: 'alcance, visualizações, impressões e publicações',
    interacoes: 'curtidas, comentários, compartilhamentos e salvamentos',
    eficiencia: 'médias por publicação, taxa de engajamento e alcance/seguidores',
  };

  return (
    <div className="stack">
      <Section title="Resumo de Métricas">
        {!hasFollowers && <Note>Audiência (seguidores, novos, perdas e saldo) não aparece: a planilha atual traz essas colunas vazias. Veja “Limitações da base” em Metodologia.</Note>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', marginTop: hasFollowers ? 0 : 12 }}>
          {SECTIONS.filter((c) => hasFollowers || c.id !== 'audiencia').map((c) => <SectionCard key={c.id} title={SHORT[c.id]} support={SUPPORT[c.id]} principal={c.id === 'interacoes'} main={kpis[c.main]} others={c.others.map((id) => kpis[id])} />)}
        </div>
      </Section>

      <ShareSection />
      <CompareSection />
      <WeeklyByNetwork />
    </div>
  );
}

/* ---------- participação de cada rede ---------- */
function ShareSection() {
  const { ds, state } = useStore();
  const { sel, range } = state;
  const [metric, setMetric] = useState<KpiId>('engagement');
  const ref = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const out = activePlatforms(sel).filter((p) => !sel.profileIds.length || sel.profileIds.some((id) => id.startsWith(p + '-'))).map((p) => {
      const t = buildTable(ds, { ...sel, platforms: [p] });
      return { p, v: evalKpi(metric, t, range.start, range.end) };
    });
    const total = out.reduce((s, r) => s + (r.v ?? 0), 0);
    return { out, total };
  }, [ds, sel, range, metric]);
  const sorted = [...rows.out].sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  const def = KPI_DEFS.find((d) => d.id === metric)!;
  return (
    <Section title="Participação de cada rede nos resultados" sub="Participação percentual dentro do recorte selecionado">
      <Panel title={`Participação por rede — ${def.label}`} sub="Redes sem a métrica aparecem como indisponíveis (não entram no 100%)." tools={<><Select label="Métrica de participação" value={metric} options={SHARE_METRICS.filter((m) => PLATFORMS.some((p) => KPI_BY_ID[m.id].covers(p.id)))} onChange={setMetric} /><PngButton target={ref} name="participacao-por-rede" /></>}>
        <Well><div ref={ref}>
          <HBars aria={`Participação de cada rede em ${def.label}`} labelW={130} rows={sorted.map((r) => ({
            key: r.p, label: PLATFORM_BY_ID[r.p].name, value: r.v, color: PLATFORM_BY_ID[r.p].color,
            text: r.v === null ? ND : `${fmtKpi(r.v, def.fmt)} · ${fmtShare((r.v / (rows.total || 1)) * 100)}`,
          }))} />
        </div></Well>
      </Panel>
    </Section>
  );
}

/* ---------- tabela comparativa ---------- */
interface PRow {
  p: PlatformId; main: ReturnType<typeof computeKpi>; followers: number | null; newF: number | null; posts: number | null; eng: number | null;
  er: number | null; erBase: string; medianMain: number | null; delta: number | null;
}
function CompareSection() {
  const { ds, state, setOpenPost } = useStoreFix();
  void setOpenPost;
  const { sel, range, benchDays } = state;
  const prev = prevRange(range);
  const rows = useMemo<PRow[]>(() => activePlatforms(sel).filter((p) => !sel.profileIds.length || sel.profileIds.some((id) => id.startsWith(p + '-'))).map((p) => {
    const s2 = { ...sel, platforms: [p] };
    const t = buildTable(ds, s2);
    const main = computeKpi(ds, s2, principalId(p), range, prev, benchDays, false);
    const med = computeKpi(ds, s2, PLATFORM_BY_ID[p].kpi === 'engagement' ? 'engagement' : PLATFORM_BY_ID[p].kpi, range, prev, benchDays, true).medianPerPost;
    return {
      p, main, followers: evalKpi('followers', t, range.start, range.end), newF: PLATFORM_BY_ID[p].hasNewFollowers ? evalKpi('newF', t, range.start, range.end) : null,
      posts: evalKpi('posts', t, range.start, range.end), eng: evalKpi('engagement', t, range.start, range.end), er: evalKpi('er', t, range.start, range.end),
      erBase: t.erBase === 'reach' ? 'alcance' : t.erBase === 'views' ? 'visualizações' : t.erBase === 'impressions' ? 'impressões' : '', medianMain: med, delta: main.delta,
    };
  }), [ds, sel, range, prev.start, benchDays]);

  const cols: Col<PRow>[] = [
    { id: 'p', label: 'Rede', render: (r) => <PlatformBadge id={r.p} />, sort: (r) => PLATFORM_BY_ID[r.p].name },
    { id: 'kpi', label: 'KPI principal', num: true, render: (r) => <span><b>{fmtKpi(r.main.value, r.main.def.fmt)}</b><br /><small className="muted">{KPI_BY_ID[principalId(r.p)].label}</small></span>, sort: (r) => r.main.value },
    { id: 'd', label: 'Δ vs. anterior', num: true, render: (r) => r.delta === null ? <span className="nd">{ND}</span> : <span className={`k-delta ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'flat'}`}>{r.main.def.delta === 'pp' ? fmtDeltaPP(r.delta) : fmtDeltaPct(r.delta)}</span>, sort: (r) => r.delta },
    { id: 'b', label: 'Benchmark', render: (r) => r.main.bench ? <span className={`pill ${r.main.bench.status}`}>{r.main.bench.status === 'acima' ? '▲ acima' : r.main.bench.status === 'abaixo' ? '▼ abaixo' : '● dentro'}</span> : <span className="nd">{ND}</span>, sort: (r) => (r.main.bench ? ({ abaixo: 0, dentro: 1, acima: 2 })[r.main.bench.status] : null) },
    { id: 'f', label: 'Seguidores', num: true, render: (r) => r.followers === null ? <span className="nd">{ND}</span> : fmtCompact(r.followers), sort: (r) => r.followers },
    { id: 'n', label: 'Novos seg.', num: true, render: (r) => r.newF === null ? <span className="nd" title="A rede informa apenas o saldo líquido">{ND}</span> : fmtCompact(r.newF), sort: (r) => r.newF },
    { id: 'po', label: 'Publicações', num: true, render: (r) => r.posts === null ? ND : fmtInt(r.posts), sort: (r) => r.posts },
    { id: 'e', label: 'Engajamento', num: true, render: (r) => r.eng === null ? ND : fmtCompact(r.eng), sort: (r) => r.eng },
    { id: 'er', label: 'Taxa de engaj.', num: true, render: (r) => r.er === null ? <span className="nd">{ND}</span> : <span>{fmtPct(r.er, 2)}<br /><small className="muted">base: {r.erBase}</small></span>, sort: (r) => r.er },
    { id: 'm', label: 'Mediana por pub. (KPI)', num: true, render: (r) => r.medianMain === null ? <span className="nd">{ND}</span> : fmtCompact(r.medianMain), sort: (r) => r.medianMain },
  ];
  const exp = (): Table => ({
    name: 'comparativo-redes', headers: ['Rede', 'KPI principal', 'Valor KPI', 'Variação', 'Benchmark', 'Seguidores', 'Novos seguidores', 'Publicações', 'Engajamento', 'Taxa de engajamento (%)', 'Base da taxa', 'Mediana por publicação (KPI)'],
    rows: rows.map((r) => [PLATFORM_BY_ID[r.p].name, KPI_BY_ID[principalId(r.p)].label, r.main.value, r.delta, r.main.bench?.status ?? null, r.followers, r.newF, r.posts, r.eng, r.er, r.erBase, r.medianMain]),
  });
  return (
    <Section title="Tabela comparativa entre redes" sub="“n/d” = a rede não fornece a métrica (diferente de zero)">
      <Panel light title="Comparativo por rede" sub="Clique nos títulos das colunas para ordenar. Taxas só são comparáveis dentro da mesma base." tools={<ExportButtons table={exp} />}>
        <DataTable rows={rows} cols={cols} rowKey={(r) => r.p} defaultSort="kpi" />
        <p className="small muted" style={{ marginTop: 8 }}>KPI principal: engajamento (curtidas, comentários e compartilhamentos). Redes sem esse dado na planilha usam um substituto, indicado abaixo do valor.</p>
      </Panel>
    </Section>
  );
}
const useStoreFix = useStore;

/* ---------- engajamento semanal por rede ---------- */
function WeeklyByNetwork() {
  const { ds, state } = useStore();
  const { sel, range } = state;
  const [gran, setGran] = useState<Granularity>('semana');
  const [off, setOff] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const buckets = useMemo(() => makeBuckets(range, gran), [range, gran]);
  const plats = activePlatforms(sel).filter((p) => !sel.profileIds.length || sel.profileIds.some((id) => id.startsWith(p + '-')));
  const series = plats.map((p) => ({ id: p, label: PLATFORM_BY_ID[p].name, color: PLATFORM_BY_ID[p].color, dash: PLATFORM_BY_ID[p].dash, values: bucketValues(buildTable(ds, { ...sel, platforms: [p] }), 'engagement', buckets) }));
  return (
    <Section title="Evolução do engajamento por rede" sub="Engajamento básico é comparável entre redes; para outras métricas, veja a aba Evolução e redes">
      <Panel title="Engajamento total por rede" tools={<><Select label="Granularidade" value={gran} options={[{ id: 'dia', label: 'Diária' }, { id: 'semana', label: 'Semanal' }, { id: 'mes', label: 'Mensal' }]} onChange={setGran} /><PngButton target={ref} name="engajamento-por-rede" /></>}>
        <Well><div ref={ref}>
          <LineChart aria="Engajamento total por rede ao longo do período" labels={buckets.map((b) => b.label)} series={series.filter((s) => !off.includes(s.id))} fmt={fmtCompact} height={280} />
        </div>
          <Legend items={series} off={off} toggle={(id) => setOff((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))} />
        </Well>
      </Panel>
    </Section>
  );
}
