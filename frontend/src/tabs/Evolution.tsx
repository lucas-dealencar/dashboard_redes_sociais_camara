import { useEffect, useMemo, useRef, useState } from 'react';
import { PLATFORM_BY_ID, PLATFORMS } from '../data/catalog';
import { activePlatforms, buildTable, filterPosts, postEngagement } from '../domain/aggregate';
import { benchmarkFor, computeKpi, evalKpi, KPI_BY_ID, principalId, type KpiId } from '../domain/kpis';
import { fmtDM, fmtDMY, prevRange, rangeLen } from '../domain/dates';
import { fmtCompact, fmtDeltaPP, fmtDeltaPct, fmtInt, fmtPct, ND } from '../domain/format';
import { bucketIndexOfDay, bucketValues, detectPeaks, EVO_METRICS, makeBuckets, type EvoMetric, type Granularity } from '../domain/series';
import { postMetric } from '../domain/contentStats';
import { FORMAT_BY_ID } from '../data/catalog';
import { useStore } from '../state/store';
import { noteKey } from '../data/notes';
import type { PlatformId } from '../types';
import { Section, Panel, Well, Note, Select, Segmented, Toggle, ExportButtons, PlatformBadge, Empty } from '../components/ui/ui';
import { Legend, LineChart, PngButton, RangeBar, type LineSeries } from '../components/charts/charts';
import { fmtKpi } from '../components/Kpi';
import type { Table } from '../utils/export';

const fmtFor = (f: 'compact' | 'pct') => (f === 'pct' ? (v: number) => fmtPct(v, 2) : fmtCompact);
const short = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);

export function Evolution() {
  const { ds, state, notes, notesStatus, setOpenPost } = useStore();
  const { sel, range } = state;
  const autoGran: Granularity = rangeLen(range) <= 45 ? 'dia' : rangeLen(range) <= 200 ? 'semana' : 'mes';
  const [granPick, setGranPick] = useState<Granularity | null>(null);
  const gran = granPick ?? autoGran;
  const [metrics, setMetrics] = useState<EvoMetric[]>(['reach', 'engagement', 'er']);
  const [byNet, setByNet] = useState(false);
  const [compare, setCompare] = useState(true);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [off, setOff] = useState<string[]>([]);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const buckets = useMemo(() => makeBuckets(range, gran), [range, gran]);
  const prevBuckets = useMemo(() => makeBuckets(prevRange(range), gran), [range, gran]);
  useEffect(() => setSelIdx(null), [range.start, range.end, gran]);
  const total = buildTable(ds, sel);
  const plats = activePlatforms(sel).filter((p) => !sel.profileIds.length || sel.profileIds.some((id) => id.startsWith(p + '-')));
  const annotated = useMemo(() => filterPosts(ds, sel, range.start, range.end)
    .flatMap((post) => { const note = notes.get(noteKey(post.url)); return note ? [{ post, note }] : []; })
    .sort((a, b) => a.post.day - b.post.day), [ds, sel, range, notes]);
  const markers = useMemo(() => annotated.map((a) => ({ index: bucketIndexOfDay(buckets, a.post.day), label: `${fmtDM(a.post.day)} · ${short(a.note.text)}` })).filter((m) => m.index >= 0), [annotated, buckets]);

  const panels = metrics.map((id) => {
    const def = EVO_METRICS.find((m) => m.id === id)!;
    const vals = bucketValues(total, id, buckets);
    const prevVals = prevRange(range).start >= 0 ? bucketValues(buildTable(ds, sel), id, prevBuckets).slice(0, buckets.length) : [];
    const covered = plats.filter((p) => KPI_BY_ID[def.kpi].covers(p));
    const peaks = def.peaks && vals.some((v) => v !== null) ? detectPeaks(vals) : [];
    const perNet = covered.map((p) => ({ id: p as string, label: PLATFORM_BY_ID[p].name, color: PLATFORM_BY_ID[p].color, dash: PLATFORM_BY_ID[p].dash, values: bucketValues(buildTable(ds, { ...sel, platforms: [p] }), id, buckets) }));
    return { id, def, vals, prevVals, covered, peaks, perNet, missing: plats.filter((p) => !covered.includes(p)) };
  });

  const toggleMetric = (id: EvoMetric) => setMetrics((m) => (m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : m.length >= 4 ? m : [...m, id]));
  const allPeaks = panels.flatMap((p) => p.peaks.map((i) => ({ metric: p.def.label, i })));
  const sb = selIdx !== null ? buckets[selIdx] : null;

  return (
    <div className="stack">
      <Section title="Séries históricas" sub="Clique em um ponto (ou use as setas do teclado) para investigar picos">
        <Panel title="Controles" light>
          <div className="f-row" style={{ alignItems: 'flex-end' }}>
            <div className="f-group" style={{ flex: 1 }}>
              <span className="f-label">Métricas (até 4)</span>
              <div className="chips">{EVO_METRICS.map((m) => <button key={m.id} className="chip" aria-pressed={metrics.includes(m.id)} onClick={() => toggleMetric(m.id)}><i />{m.label}</button>)}</div>
            </div>
            <div className="f-group"><span className="f-label">Granularidade</span><Segmented value={gran} label="Granularidade" options={[{ id: 'dia', label: 'Diária' }, { id: 'semana', label: 'Semanal' }, { id: 'mes', label: 'Mensal' }]} onChange={setGranPick} /></div>
            <div className="f-group"><span className="f-label">Série</span><Segmented value={byNet ? 'rede' : 'total'} label="Série" options={[{ id: 'total', label: 'Consolidado' }, { id: 'rede', label: 'Por rede' }]} onChange={(v) => setByNet(v === 'rede')} /></div>
            <Toggle checked={compare && !byNet} onChange={setCompare} label="Comparar com período anterior" />
          </div>
          {byNet && metrics.length > 1 && <p className="small muted" style={{ marginTop: 8 }}>O modo “por rede” exibe uma métrica por vez; com várias métricas o gráfico mostra o consolidado.</p>}
          {gran === 'mes' && rangeLen(range) < 60 && <p className="small muted" style={{ marginTop: 8 }}>Período curto para granularidade mensal: poucos pontos.</p>}
        </Panel>

        <div style={{ marginTop: 18 }}>
          {(() => {
            const multi = panels.length > 1;
            const one = panels[0];
            const useNet = byNet && !multi;
            const palette = ['#07333a', '#2bc4a0', '#f5a623', '#c2418a'];
            const dashes = [undefined, undefined, undefined, '7 4'];
            const covered = panels.filter((p) => p.covered.length > 0);
            const series: LineSeries[] = multi
              ? covered.map((p, k) => ({ id: p.id, label: p.def.label, color: palette[k % palette.length], dash: dashes[k % 4], values: p.vals, fmt: fmtFor(p.def.fmt) }))
              : useNet && one ? one.perNet.filter((s) => !off.includes(s.id)) : one ? [{ id: 'total', label: 'Consolidado', color: '#134e5e', values: one.vals }] : [];
            const title = multi ? 'Métricas selecionadas' : one?.def.label ?? 'Séries históricas';
            const table = (): Table => multi
              ? { name: 'series-historicas', headers: ['Período', ...covered.map((p) => p.def.label)], rows: buckets.map((b, i) => [b.label, ...covered.map((p) => p.vals[i])]) }
              : { name: `serie-${one.id}`, headers: ['Período', ...(useNet ? one.perNet.map((s) => s.label) : ['Consolidado', 'Período anterior'])], rows: buckets.map((b, i) => [b.label, ...(useNet ? one.perNet.map((s) => s.values[i]) : [one.vals[i], one.prevVals[i] ?? null])]) };
            const peaksOne = !multi && !useNet && one ? one.peaks : [];
            if (!one) return <Empty>Selecione ao menos uma métrica.</Empty>;
            return (
              <Panel title={title}
                sub={multi ? 'Cada linha usa a própria escala (mín. a máx. da métrica no período) para permitir a comparação do formato das curvas; passe o mouse para ver os valores reais.' : one.missing.length && one.covered.length ? `Disponível em ${one.covered.length} de ${plats.length} redes (indisponível em: ${one.missing.map((m) => PLATFORM_BY_ID[m].name).join(', ')}).` : one.id === 'followers' ? 'Soma de vínculos de seguimento, não pessoas únicas.' : undefined}
                tools={covered.length > 0 && <><ExportButtons table={table} /><PngButton target={() => refs.current.main ?? null} name="series-historicas" /></>}>
                {covered.length === 0 ? <Empty>Métrica indisponível para as redes selecionadas.</Empty> : (
                  <Well>
                    <div ref={(el) => { refs.current.main = el; }}>
                      <LineChart aria={`${title} ao longo do período`} labels={buckets.map((b) => b.label)} series={series} rel={multi}
                        compare={!multi && compare && !useNet && one.prevVals.length ? [{ id: 'prev', label: 'Período anterior', color: '#8fa6aa', values: one.prevVals }] : undefined}
                        fmt={fmtFor(one.def.fmt)} zero={one.id !== 'followers' && one.id !== 'er'} peaks={peaksOne} markers={markers} selected={selIdx} onSelect={setSelIdx} height={multi ? 320 : 250} area={!multi && !useNet} />
                    </div>
                    {useNet ? <Legend items={one.perNet} off={off} toggle={(id) => setOff((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))} /> : (
                      <div className="legend">
                        {multi ? covered.map((p, k) => <span key={p.id} className="badge"><i style={{ width: 18, borderTop: `3px ${dashes[k % 4] ? 'dashed' : 'solid'} ${palette[k % palette.length]}`, display: 'inline-block' }} /> {p.def.label}</span>) : <span className="badge"><i style={{ width: 18, borderTop: '3px solid #134e5e', display: 'inline-block' }} /> Consolidado</span>}
                        {!multi && compare && <span className="badge muted"><i style={{ width: 18, borderTop: '3px dashed #8fa6aa', display: 'inline-block' }} /> Período anterior</span>}
                        {peaksOne.length > 0 && <span className="badge"><i style={{ width: 12, height: 12, borderRadius: '50%', background: '#f5a623', border: '2px solid #07333a', display: 'inline-block' }} /> Pico</span>}
                        <span className="badge"><i style={{ width: 10, height: 10, background: '#7a56d6', transform: 'rotate(45deg)', display: 'inline-block' }} /> Anotação</span>
                        {multi && panels.length > covered.length && <span className="badge muted">Indisponíveis para as redes selecionadas: {panels.filter((p) => !covered.includes(p)).map((p) => p.def.label).join(', ')}</span>}
                      </div>
                    )}
                  </Well>
                )}
              </Panel>
            );
          })()}
        </div>
      </Section>

      <Section title="Investigação de picos e anotações" sub="A coincidência temporal indica hipótese, não comprova causalidade">
        <div className="grid g-main">
          <Panel title={sb ? `Período selecionado: ${sb.label}` : 'Selecione um ponto no gráfico'} sub={sb ? `${fmtDMY(sb.start)} a ${fmtDMY(sb.end)}` : 'ou escolha um dos picos detectados'}>
            {allPeaks.length > 0 && <div className="chips" style={{ marginBottom: 12 }}>{allPeaks.map((pk, k) => <button key={k} className="chip" aria-pressed={selIdx === pk.i} onClick={() => setSelIdx(pk.i)}><i />{pk.metric} · {buckets[pk.i].label}</button>)}</div>}
            {sb ? <BucketDetail start={sb.start} end={sb.end} /> : <Empty>Nenhum ponto selecionado. Os picos (círculos laranja) são pontos acima de Q3 + 1,5 × amplitude interquartil.</Empty>}
          </Panel>
          <Panel title="Anotações editoriais" sub="Uma por publicação, no período e filtros ativos" light>
            <div className="grid" style={{ gap: 8, maxHeight: 420, overflow: 'auto' }}>
              {annotated.map(({ post, note }) => (
                <div key={post.id} className="post-item"><span className="flex between"><PlatformBadge id={post.platform} /><span className="small muted">{fmtDMY(post.day)}</span></span><span className="t">{note.text}</span><span className="small muted">{post.title}</span>
                  <span className="flex"><button className="btn sm" onClick={() => setOpenPost(post)}>Abrir publicação</button><button className="btn sm" onClick={() => setSelIdx(bucketIndexOfDay(buckets, post.day))}>Ver no gráfico</button></span></div>
              ))}
              {!annotated.length && <Empty>Sem anotações no período.</Empty>}
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>{notesStatus === 'reserva' ? 'Serviço de anotações indisponível: exibindo a última cópia publicada.' : 'Para anotar, abra uma publicação aqui ou na aba Conteúdos.'}</p>
          </Panel>
        </div>
      </Section>

      <NetworkKpis />
      
    </div>
  );
}


function BucketDetail({ start, end }: { start: number; end: number }) {
  const { ds, state, notes, setOpenPost } = useStore();
  const { sel } = state;
  const total = buildTable(ds, sel);
  const posts = filterPosts(ds, sel, start, end).sort((a, b) => (postEngagement(b) ?? -1) - (postEngagement(a) ?? -1)).slice(0, 8);
  const items = EVO_METRICS.filter((m) => m.id !== 'followers').map((m) => ({ m, v: evalKpi(m.kpi, total, start, end) }));
  const an = filterPosts(ds, sel, start, end).flatMap((p) => { const n = notes.get(noteKey(p.url)); return n ? [`${fmtDM(p.day)} · ${short(n.text)}`] : []; });
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 12 }}>
        {items.slice(0, 4).map(({ m, v }) => <div key={m.id} className="kpi" style={{ padding: '10px 12px' }}><div className="k-label">{m.label}</div><div className="k-value" style={{ fontSize: 24 }}>{v === null ? ND : fmtFor(m.fmt)(v)}</div></div>)}
      </div>
      {an.length > 0 && <Note><b>Anotações no período:</b> {an.join(' | ')}</Note>}
      <h4 style={{ margin: '14px 0 8px' }}>Publicações relevantes (por engajamento)</h4>
      <div className="grid" style={{ gap: 8 }}>
        {posts.map((p) => (
          <div key={p.id} className="post-item">
            <span className="flex between"><PlatformBadge id={p.platform} /><span className="small muted">{fmtDMY(p.day)} · {FORMAT_BY_ID[p.format].name}</span></span>
            <button className="t link" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0 }} onClick={() => setOpenPost(p)}>{p.title}</button>
            <span className="small">{PLATFORM_BY_ID[p.platform].kpiLabel}: <b>{postMetric(p, 'kpi') === null ? ND : fmtCompact(postMetric(p, 'kpi') as number)}</b> · engajamento: <b>{postEngagement(p) === null ? ND : fmtInt(postEngagement(p) as number)}</b> · <a className="link" href={p.url} target="_blank" rel="noopener noreferrer">abrir link</a></span>
          </div>
        ))}
        {!posts.length && <Empty>Sem publicações neste período para os filtros ativos.</Empty>}
      </div>
    </>
  );
}

function NetworkKpis() {
  const { ds, state } = useStore();
  const { sel, range } = state;
  const plats = activePlatforms(sel).filter((p) => !sel.profileIds.length || sel.profileIds.some((id) => id.startsWith(p + '-')));
  const [selNet, setSelNet] = useState<PlatformId>(plats[0] ?? 'instagram');
  const net = plats.includes(selNet) ? selNet : plats[0];
  const refB = useRef<HTMLDivElement>(null);
  const { benchDays } = state;
  const prev = prevRange(range);
  const cards = plats.map((p) => {
    const s2 = { ...sel, platforms: [p] };
    const t = buildTable(ds, s2);
    const main = computeKpi(ds, s2, principalId(p), range, prev, benchDays, false);
    return { p, t, main, followers: evalKpi('followers', t, range.start, range.end), posts: evalKpi('posts', t, range.start, range.end), eng: evalKpi('engagement', t, range.start, range.end), er: evalKpi('er', t, range.start, range.end), net: evalKpi('net', t, range.start, range.end) };
  });
  const [kpiPick, setKpiPick] = useState<KpiId | null>(null);
  const options: KpiId[] = net ? ([principalId(net), 'reach', 'views', 'impressions', 'engagement', 'er'] as KpiId[]).filter((k, i, a) => a.indexOf(k) === i && KPI_BY_ID[k].covers(net)) : [];
  const kpi = kpiPick && options.includes(kpiPick) ? kpiPick : options[0];
  const wk = useMemo(() => {
    if (!net || !kpi) return null;
    const r = { start: Math.max(0, Math.min(range.start, range.end - 83)), end: range.end };
    const bs = makeBuckets(r, 'semana');
    const t = buildTable(ds, { ...sel, platforms: [net] });
    const vals = bs.map((b) => evalKpi(kpi, t, b.start, b.end));
    const bens = bs.map((b, i) => benchmarkFor(kpi, t, { start: b.start, end: b.end }, benchDays, vals[i]));
    return { bs, vals, bens };
  }, [ds, sel, range, net, kpi, benchDays]);
  return (
    <Section title="KPI principal por rede e benchmark interno" sub="Janela móvel com mediana e quartis, excluindo o período avaliado">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
        {cards.map((c) => {
          const b = c.main.bench, def = c.main.def, info = PLATFORM_BY_ID[c.p];
          return (
            <button key={c.p} className={`plat-card${net === c.p ? ' sel' : ''}`} style={{ borderTopColor: info.color }} onClick={() => setSelNet(c.p)} aria-pressed={net === c.p}>
              <h4><PlatformBadge id={c.p} /><span className={`pill ${info.kpiValidated ? 'req' : 'validar'}`}>{info.kpiValidated ? 'Requisito' : 'A validar'}</span></h4>
              <span className="small muted">KPI principal: {KPI_BY_ID[principalId(c.p)].label}</span>
              <span className="big">{fmtKpi(c.main.value, def.fmt)}</span>
              <span className={`k-delta ${c.main.delta === null ? 'flat' : c.main.delta > 0 ? 'up' : 'down'}`}>{c.main.delta === null ? 'variação não calculável' : `${def.delta === 'pp' ? fmtDeltaPP(c.main.delta) : fmtDeltaPct(c.main.delta)} vs. anterior`}</span>
              {b && c.main.value !== null ? <><RangeBar q1={b.q1} q3={b.q3} med={b.median} value={c.main.value} /><span className="small"><span className={`pill ${b.status}`}>{b.status === 'acima' ? '▲ acima do padrão' : b.status === 'abaixo' ? '▼ abaixo do padrão' : '● dentro do padrão'}</span> <span className="muted">mediana {fmtKpi(b.median, def.fmt)}</span></span></> : <span className="small nd">Benchmark: histórico insuficiente</span>}
              <ul>
                <li><span>Seguidores</span><b>{c.followers === null ? ND : fmtCompact(c.followers)}</b></li>
                <li><span>Saldo líquido</span><b>{c.net === null ? ND : fmtCompact(c.net)}</b></li>
                <li><span>Publicações</span><b>{c.posts === null ? ND : fmtInt(c.posts)}</b></li>
                <li><span>Engajamento</span><b>{c.eng === null ? ND : fmtCompact(c.eng)}</b></li>
                <li><span>Taxa de engaj. {c.t.erBase ? `(${c.t.erBase === 'reach' ? 'alcance' : c.t.erBase === 'views' ? 'visual.' : 'impr.'})` : ''}</span><b>{c.er === null ? ND : fmtPct(c.er, 2)}</b></li>
              </ul>
              <span className="small muted">Apoio: {info.support}</span>
            </button>
          );
        })}
      </div>
      {net && wk && kpi && (
        <div style={{ marginTop: 18 }}>
          <Panel title={`Faixa de referência — ${PLATFORM_BY_ID[net].name}`} sub={`Semanas contra a mediana e a faixa Q1–Q3 das semanas equivalentes nos ${benchDays} dias anteriores a cada ponto.`}
            tools={<><Select label="Indicador" value={kpi} options={options.map((k) => ({ id: k, label: k === principalId(net) ? `${KPI_BY_ID[k].label} (KPI principal)` : KPI_BY_ID[k].label }))} onChange={setKpiPick} /><PngButton target={refB} name={`benchmark-${net}`} /></>}>
            <Well>
              <div ref={refB}>
                <LineChart aria={`Benchmark interno de ${KPI_BY_ID[kpi].label} em ${PLATFORM_BY_ID[net].name}`} labels={wk.bs.map((b) => b.label)} series={[{ id: 'v', label: KPI_BY_ID[kpi].label, color: PLATFORM_BY_ID[net].color === '#101010' ? '#134e5e' : PLATFORM_BY_ID[net].color, values: wk.vals }]}
                  band={{ q1: wk.bens.map((b) => b?.q1 ?? null), q3: wk.bens.map((b) => b?.q3 ?? null), med: wk.bens.map((b) => b?.median ?? null) }} fmt={KPI_BY_ID[kpi].fmt === 'pct' ? (v) => fmtPct(v, 2) : fmtCompact} height={260} zero={false} />
              </div>
              <div className="legend"><span className="badge"><i style={{ width: 18, borderTop: '3px solid #134e5e', display: 'inline-block' }} /> Valor da semana</span><span className="badge"><i style={{ width: 18, borderTop: '3px dashed #f5a623', display: 'inline-block' }} /> Mediana de referência</span><span className="badge"><i style={{ width: 18, height: 10, background: '#9fc3c4', display: 'inline-block', opacity: .6 }} /> Faixa Q1–Q3</span></div>
              <p className="small muted" style={{ margin: '6px 0 0' }}>{(() => { const st = wk.bens.map((b, i) => (b && wk.vals[i] !== null ? (wk.vals[i] as number) > b.q3 ? 'a' : (wk.vals[i] as number) < b.q1 ? 'b' : 'd' : null)).filter(Boolean); return `Das ${st.length} semanas com referência: ${st.filter((s) => s === 'a').length} acima do padrão, ${st.filter((s) => s === 'd').length} dentro e ${st.filter((s) => s === 'b').length} abaixo.`; })()}</p>
            </Well>
          </Panel>
        </div>
      )}
    </Section>
  );
}
