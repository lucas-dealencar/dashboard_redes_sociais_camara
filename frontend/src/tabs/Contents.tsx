import { useMemo, useRef, useState } from 'react';
import { FORMATS, FORMAT_BY_ID, PLATFORM_BY_ID } from '../data/catalog';
import { activePlatforms, filterPosts, postEngagement } from '../domain/aggregate';
import { aggregate, groupBy, POST_METRICS, postMetric, erDenominator, type Agg, type PostMetricId } from '../domain/contentStats';
import { fmtDMY } from '../domain/dates';
import { noteKey } from '../data/notes';
import { fmtCompact, fmtInt, fmtPct, fmtSec, ND } from '../domain/format';
import { useStore } from '../state/store';
import type { FormatId, PlatformId, Post } from '../types';
import { ClassificationExplorer } from '../components/ClassificationExplorer';
import { matchesPick, type ClassPick } from '../domain/classification';
import { Section, Panel, Well, Note, Select, Segmented, ExportButtons, DataTable, PlatformBadge, PlatformLogo, Empty, Modal, type Col } from '../components/ui/ui';
import { Columns, HBars, HeatTable, PngButton, Scatter, SwatchLegend } from '../components/charts/charts';
import type { Table } from '../utils/export';

const PCT_IDS: PostMetricId[] = ['er', 'retention', 'completion'];
export function fmtMetric(v: number | null, id: PostMetricId): string {
  if (v === null) return ND;
  if (id === 'watch') return fmtSec(v);
  return PCT_IDS.includes(id) ? fmtPct(v, id === 'er' ? 2 : 1) : fmtCompact(v);
}

export function Contents() {
  const { ds, state, notes, setOpenPost } = useStore();
  const noteOf = (p: Post) => notes.get(noteKey(p.url));
  const { sel, range } = state;
  const active = activePlatforms(sel).filter((p) => !sel.profileIds.length || sel.profileIds.some((id) => id.startsWith(p + '-')));
  const [netPick, setNetPick] = useState<'all' | PlatformId>('all');
  const net = netPick !== 'all' && active.includes(netPick) ? netPick : 'all';
  const [metric0, setMetric] = useState<PostMetricId>('engagement');
  const metric: PostMetricId = net === 'all' && metric0 === 'kpi' ? 'engagement' : metric0;
  const [agg0, setAgg] = useState<Agg>('media');
  const mdef = POST_METRICS.find((m) => m.id === metric)!;
  const agg: Agg = mdef.fmt !== 'compact' && metric !== 'er' && agg0 === 'total' ? 'media' : agg0;
  const [minN, setMinN] = useState(3);
  const [cell, setCell] = useState<{ r: string; c: string } | null>(null);
  const [barStat, setBarStat] = useState<'volume' | 'total' | 'media' | 'mediana' | 'taxa'>('media');
  const [search, setSearch] = useState('');
  const [classPick, setClassPick] = useState<ClassPick & { others: string[] }>({ type: null, sub: null, others: [] });
  const [themeSel, setThemeSel] = useState('');

  const all = useMemo(() => filterPosts(ds, sel, range.start, range.end).filter((p) => active.includes(p.platform)), [ds, sel, range, active.join()]);
  const posts = useMemo(() => (net === 'all' ? all : all.filter((p) => p.platform === net)), [all, net]);
  const themes = ds.themes.filter((t) => posts.some((p) => p.themeId === t.id));
  const formats = FORMATS.filter((f) => posts.some((p) => p.format === f.id));
  const themeName = (id: string) => ds.themes.find((t) => t.id === id)?.name ?? id;
  const totalAgg = aggregate(posts, metric, agg);
  const coverage = totalAgg.nValid;

  const cellPosts = (r: string, c: string) => posts.filter((p) => p.themeId === r && p.format === c);
  const filtered = useMemo(() => {
    let ps = posts;
    if (cell) ps = ps.filter((p) => p.themeId === cell.r && p.format === cell.c);
    if (classPick.type) ps = ps.filter((p) => matchesPick(p, classPick, classPick.others));
    if (search.trim()) { const q = search.toLowerCase(); ps = ps.filter((p) => p.caption.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q) || (p.classification ?? '').toLowerCase().includes(q) || (p.subclassification ?? '').toLowerCase().includes(q)); }
    return ps;
  }, [posts, cell, search, classPick]);
  const rankMetric: PostMetricId = net === 'all' ? (metric === 'kpi' ? 'engagement' : metric) : 'kpi';
  const ranked = useMemo(() => [...filtered].sort((a, b) => (postMetric(b, rankMetric) ?? -1) - (postMetric(a, rankMetric) ?? -1)), [filtered, rankMetric]);

  const barRows = (keyOf: (p: Post) => string, label: (k: string) => string) => {
    const stat = barStat === 'taxa' ? { m: 'er' as PostMetricId, a: 'total' as Agg } : { m: metric, a: barStat === 'volume' ? 'total' as Agg : (barStat as Agg) };
    const rows = groupBy(posts, keyOf, stat.m, stat.a).map((g) => ({ ...g, v: barStat === 'volume' ? g.n : g.value }));
    return rows.sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).map((g) => ({
      key: g.key, label: label(g.key), value: g.v, faded: g.n < minN, tip: `${label(g.key)}: ${g.n} publicação(ões)${g.n < minN ? ' · amostra pequena' : ''}`,
      text: g.v === null ? ND : barStat === 'volume' ? fmtInt(g.v) : fmtMetric(g.v, stat.m),
    }));
  };
  const fmtRows = useMemo(() => barRows((p) => p.format, (k) => FORMAT_BY_ID[k as FormatId].name), [posts, barStat, metric, minN]);
  const themeRows = useMemo(() => barRows((p) => p.themeId, themeName), [posts, barStat, metric, minN, ds.themes]);
  const refM = useRef<HTMLDivElement>(null), refF = useRef<HTMLDivElement>(null), refT = useRef<HTMLDivElement>(null);
  const statLabel = barStat === 'volume' ? 'Volume de publicações' : barStat === 'taxa' ? 'Taxa de engajamento (agregada)' : `${mdef.label} — ${barStat === 'total' ? 'total' : barStat === 'media' ? 'média por publicação' : 'mediana por publicação'}`;

  const cols: Col<Post>[] = [
    { id: 't', label: 'Publicação', render: (p) => <span><b>{p.title}</b>{noteOf(p) && <> <span className="annot" title={noteOf(p)!.text}>Anotação</span></>}<br /><small className="muted">{ds.profiles.find((x) => x.id === p.profileId)?.name}{p.live ? ' · ao vivo' : ''}</small></span>, sort: (p) => p.title },
    { id: 'ct', label: 'Tipo', render: (p) => p.classification ?? <span className="nd">{ND}</span>, sort: (p) => p.classification },
    { id: 'cs', label: 'Subtipo', render: (p) => p.subclassification ?? <span className="nd">{ND}</span>, sort: (p) => p.subclassification },
    { id: 'r', label: 'Rede', render: (p) => <PlatformBadge id={p.platform} />, sort: (p) => p.platform },
    { id: 'f', label: 'Formato', render: (p) => FORMAT_BY_ID[p.format].name, sort: (p) => p.format },
    { id: 'th', label: 'Tema', render: (p) => themeName(p.themeId), sort: (p) => themeName(p.themeId) },
    { id: 'd', label: 'Data', render: (p) => fmtDMY(p.day), sort: (p) => p.day },
    ds.meta.hasPaid
      ? { id: 'n', label: 'Natureza', render: (p) => <span className={`pill ${p.paid ? 'validar' : 'dentro'}`}>{p.paid ? 'Paga' : 'Orgânica'}</span>, sort: (p) => (p.paid ? 1 : 0) }
      : { id: 'n', label: 'Projeto?', render: (p) => p.project ?? <span className="nd">{ND}</span>, sort: (p) => p.project },
    { id: 'k', label: net === 'all' ? 'Métrica de ordenação' : `KPI: ${PLATFORM_BY_ID[net].kpiLabel}`, num: true, render: (p) => { const v = postMetric(p, rankMetric); return v === null ? <span className="nd">{ND}</span> : fmtMetric(v, rankMetric); }, sort: (p) => postMetric(p, rankMetric) },
    { id: 'e', label: 'Engajamento', num: true, render: (p) => { const e = postEngagement(p); return e === null ? <span className="nd" title="Engajamento incompleto (ex.: Stories sem curtidas)">{ND}</span> : fmtInt(e); }, sort: (p) => postEngagement(p) },
    { id: 'tx', label: 'Taxa', num: true, render: (p) => { const v = postMetric(p, 'er'); const d = erDenominator(p); return v === null ? <span className="nd">{ND}</span> : <span title={`Base: ${d?.base}`}>{fmtPct(v, 2)}</span>; }, sort: (p) => postMetric(p, 'er') },
    { id: 'l', label: 'Link', render: (p) => <a className="link" href={p.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>abrir</a> },
  ];
  const exportRank = (): Table => ({ name: 'ranking-publicacoes', headers: ['Data', 'Rede', 'Perfil', 'Descrição', 'Formato', 'Formato na planilha', 'Tema', 'Tipo de classificação', 'Subtipo de classificação', 'Projeto?', 'Ao vivo?', 'Alcance', 'Visualizações', 'Impressões', 'Curtidas', 'Comentários', 'Compartilhamentos', 'Salvamentos', 'Cliques no link', 'Engajamento', 'Taxa de engajamento (%)', 'Base da taxa', 'Link', 'Anotação'],
    rows: ranked.map((p) => [p.date, PLATFORM_BY_ID[p.platform].name, ds.profiles.find((x) => x.id === p.profileId)?.name, p.caption, FORMAT_BY_ID[p.format].name, p.nativeFormat, themeName(p.themeId), p.classification, p.subclassification, p.project, p.live === null ? null : p.live ? 'Sim' : 'Não', p.metrics.reach, p.metrics.views, p.metrics.impressions, p.metrics.likes, p.metrics.comments, p.metrics.shares, p.metrics.saves, p.metrics.clicks, p.metrics.engagement, p.metrics.er, p.metrics.erBase === 'reach' ? 'alcance' : p.metrics.erBase === 'impressions' ? 'impressões' : p.metrics.erBase === 'views' ? 'visualizações' : null, p.url, noteOf(p)?.text ?? null]) });
  const exportMatrix = (): Table => ({ name: 'matriz-tema-formato', headers: ['Tema', ...formats.flatMap((f) => [`${f.name} — ${mdef.label}`, `${f.name} — n`])],
    rows: themes.map((t) => [t.name, ...formats.flatMap((f) => { const a = aggregate(cellPosts(t.id, f.id), metric, agg); return [a.value, a.n]; })]) });

  return (
    <div className="stack">
      <Panel light title="Recorte da análise" sub="Os filtros globais continuam valendo; aqui você escolhe a rede, a métrica e como agregar.">
        <div className="f-row">
          <div className="f-group"><span className="f-label">Rede</span><Select label="Rede da análise" value={net} options={[{ id: 'all', label: 'Todas as redes selecionadas' }, ...active.map((p) => ({ id: p as string, label: PLATFORM_BY_ID[p].name }))]} onChange={(v) => { setNetPick(v as never); setCell(null); }} /></div>
          <div className="f-group"><span className="f-label">Métrica</span><Select label="Métrica" value={metric} options={POST_METRICS.filter((m) => net !== 'all' || m.id !== 'kpi').map((m) => ({ id: m.id, label: m.label }))} onChange={setMetric} /></div>
          <div className="f-group"><span className="f-label">Agregação</span><Segmented value={agg} label="Agregação" options={[{ id: 'media', label: 'Média' }, { id: 'mediana', label: 'Mediana' }, { id: 'total', label: metric === 'er' ? 'Taxa agregada' : 'Total' }]} onChange={setAgg} /></div>
          <div className="f-group"><span className="f-label">Amostra mínima (n)</span><Select label="Amostra mínima" value={minN} options={[1, 3, 5, 10].map((n) => ({ id: n, label: `n ≥ ${n}` }))} onChange={setMinN} /></div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>{fmtInt(posts.length)} publicações no recorte · {fmtInt(coverage)} com a métrica “{mdef.label}” disponível{coverage < posts.length ? ` (${fmtInt(posts.length - coverage)} em redes que não a fornecem, fora da conta)` : ''} · {mdef.label} {agg === 'media' ? 'médio' : agg === 'mediana' ? 'mediano' : 'total'}: <b>{fmtMetric(totalAgg.value, metric)}</b></p>
      </Panel>

      <ClassificationExplorer posts={posts} minN={minN} pick={classPick} onPick={(pick, others) => setClassPick({ ...pick, others })} />

      <Section title="Matriz de desempenho por tema e formato" sub="Clique em uma célula para ver os conteúdos que compõem o resultado">
        <Panel title={`${net === 'all' ? 'Redes selecionadas' : PLATFORM_BY_ID[net].name} · ${mdef.label}${agg === 'media' ? ' médio' : agg === 'mediana' ? ' mediano' : ''} por publicação`} tools={<ExportButtons table={exportMatrix} />}>
          {themes.length && formats.length ? (
            <>
              <HeatTable rows={themes.map((t) => ({ key: t.id, label: t.name }))} cols={formats.map((f) => ({ key: f.id, label: f.name }))} minN={minN} selected={cell}
                cell={(r, c) => { const a = aggregate(cellPosts(r, c), metric, agg); return { value: a.nValid ? a.value : null, text: fmtMetric(a.value, metric), n: a.n }; }}
                onCell={(r, c) => { setCell((cur) => (cur && cur.r === r && cur.c === c ? null : { r, c })); document.getElementById('ranking')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
              <p className="small" style={{ marginTop: 8 }}>Exemplo de leitura: veja, em cada linha, qual formato entrega o maior {mdef.label.toLowerCase()} para o tema. Passe o mouse sobre a célula para ver quantas publicações há em cada combinação.</p>
            </>
          ) : <Empty>Sem publicações para os filtros atuais.</Empty>}
        </Panel>
      </Section>

      <Section title="Formatos e temas" sub="Volume, total, média/mediana por publicação e taxa, com o tamanho da amostra em cada grupo">
        <div className="f-row" style={{ marginBottom: 12 }}>
          <div className="f-group"><span className="f-label">Medida das barras</span><Segmented value={barStat} label="Medida das barras" options={[{ id: 'volume', label: 'Volume' }, { id: 'total', label: 'Total' }, { id: 'media', label: 'Média' }, { id: 'mediana', label: 'Mediana' }, { id: 'taxa', label: 'Taxa' }]} onChange={setBarStat} /></div>
          <span className="small muted">{statLabel}. Barras esmaecidas = amostra pequena (n &lt; {minN}).</span>
        </div>
        <div className="grid g2">
          <Panel title="Por formato" tools={<PngButton target={refF} name="por-formato" />}><Well><div ref={refF}><HBars aria="Desempenho por formato" labelW={150} rows={fmtRows} /></div></Well></Panel>
          <Panel title="Por tema" tools={<PngButton target={refT} name="por-tema" />}><Well><div ref={refT}><HBars aria="Desempenho por tema" labelW={230} rows={themeRows} /></div></Well></Panel>
        </div>
      </Section>

      <Section title="Ranking de publicações" id="ranking" sub={net === 'all' ? 'Em todas as redes, o ranking usa a métrica escolhida; para o KPI principal, selecione uma rede' : `Ordenado pelo KPI principal de ${PLATFORM_BY_ID[net].name}: ${PLATFORM_BY_ID[net].kpiLabel}`}>
        <Panel light title="Publicações" tools={<><input className="inp" placeholder="Buscar texto, link, tipo ou subtipo" aria-label="Buscar publicações" value={search} onChange={(e) => setSearch(e.target.value)} /><ExportButtons table={exportRank} /></>}>
          {classPick.type && <div className="flex" style={{ marginBottom: 10 }}><span className="pill req">Classificação: {classPick.type}{classPick.sub ? ` › ${classPick.sub === '__outros__' ? 'Outros subtipos' : classPick.sub}` : ''}</span><button className="btn sm" onClick={() => setClassPick({ type: null, sub: null, others: [] })}>Limpar</button></div>}
          {cell && <div className="flex" style={{ marginBottom: 10 }}><span className="pill req">Filtro da matriz: {themeName(cell.r)} × {FORMAT_BY_ID[cell.c as FormatId].name}</span><button className="btn sm" onClick={() => setCell(null)}>Limpar</button></div>}
          <DataTable rows={ranked} cols={cols} rowKey={(p) => p.id} onRowClick={setOpenPost} pageSize={10} />
          <p className="small muted" style={{ marginTop: 8 }}>Clique em uma linha para ver o detalhe, o link e reclassificar o tema (ajuste local; a fonte oficial do tema é a planilha). “Sem tema” = publicação sem proposição vinculada.</p>
        </Panel>
      </Section>

      <ThemeAcrossNetworks all={all} active={active} minN={minN} themeSel={themeSel} setThemeSel={setThemeSel} />
      <Pautas posts={all} />
      <VideoSection posts={all} />
    </div>
  );
}

/* ---------- mesmo tema entre redes e formatos ---------- */
function ThemeAcrossNetworks({ all, active, minN, themeSel, setThemeSel }: { all: Post[]; active: PlatformId[]; minN: number; themeSel: string; setThemeSel: (s: string) => void }) {
  const { ds } = useStore();
  const [m, setM] = useState<PostMetricId>('er');
  const theme = themeSel || ds.themes[0].id;
  const ps = all.filter((p) => p.themeId === theme);
  const rows = active.filter((p) => ps.some((x) => x.platform === p)).map((p) => ({ key: p as string, label: PLATFORM_BY_ID[p].name }));
  const cols = FORMATS.filter((f) => ps.some((p) => p.format === f.id)).map((f) => ({ key: f.id as string, label: f.name }));
  const mm = POST_METRICS.find((x) => x.id === m)!;
  return (
    <Section title="Mesmo tema entre redes e formatos" sub="Compare como um tema performa em cada rede; as cores comparam formatos dentro de cada rede">
      <Panel title="Rede × formato para um tema" tools={<><Select label="Tema" value={theme} options={ds.themes.map((t) => ({ id: t.id, label: t.name }))} onChange={setThemeSel} /><Select label="Métrica" value={m} options={[{ id: 'er', label: 'Taxa de engajamento (média)' }, { id: 'kpi', label: 'KPI principal da rede (mediana)' }, { id: 'engagement', label: 'Engajamento (média)' }].map((o) => ({ id: o.id as PostMetricId, label: o.label }))} onChange={setM} /></>}>
        {rows.length ? <HeatTable byRow rowHead="Rede" rows={rows} cols={cols} minN={minN}
          cell={(r, c) => { const a = aggregate(ps.filter((p) => p.platform === r && p.format === c), m, m === 'kpi' ? 'mediana' : 'media'); return { value: a.nValid ? a.value : null, text: fmtMetric(a.value, m), n: a.n }; }} /> : <Empty>Sem publicações deste tema no recorte.</Empty>}
        <p className="small muted" style={{ marginTop: 8 }}>{mm.label}: valores de redes diferentes têm bases diferentes (alcance, visualizações ou impressões) e não devem ser comparados em valor absoluto.</p>
      </Panel>
    </Section>
  );
}

/* ---------- pautas (vínculo de versões) — Etapa 3 ---------- */
function Pautas({ posts }: { posts: Post[] }) {
  const { ds } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, Post[]>();
    posts.filter((p) => p.editorialId).forEach((p) => (g.get(p.editorialId) ?? g.set(p.editorialId, []).get(p.editorialId)!).push(p));
    return [...g.entries()].filter(([, v]) => new Set(v.map((p) => p.platform)).size >= 2).map(([id, ps]) => {
      const ed = ds.editorials.find((e) => e.id === id);
      const best = [...ps].sort((a, b) => (postMetric(b, 'er') ?? 0) - (postMetric(a, 'er') ?? 0))[0];
      return { id, ps, title: ed?.title ?? id, theme: ds.themes.find((t) => t.id === ed?.themeId)?.name ?? '', day: ed?.day ?? ps[0].day, eng: ps.reduce((s, p) => s + (postEngagement(p) ?? 0), 0), best };
    });
  }, [posts, ds]);
  const cols: Col<(typeof groups)[number]>[] = [
    { id: 't', label: 'Pauta', render: (g) => <span><b>{g.title}</b><br /><small className="muted">{g.id} · {g.theme}</small></span>, sort: (g) => g.title },
    { id: 'd', label: 'Data', render: (g) => fmtDMY(g.day), sort: (g) => g.day },
    { id: 'r', label: 'Versões por rede', render: (g) => <span className="flex" style={{ gap: 4 }}>{g.ps.map((p) => <PlatformLogo key={p.id} id={p.platform} />)}<small className="muted">{g.ps.length}</small></span>, sort: (g) => g.ps.length },
    { id: 'e', label: 'Engajamento somado', num: true, render: (g) => fmtCompact(g.eng), sort: (g) => g.eng },
    { id: 'b', label: 'Maior taxa', render: (g) => <span><PlatformBadge id={g.best.platform} /> {postMetric(g.best, 'er') === null ? ND : fmtPct(postMetric(g.best, 'er') as number, 2)}</span> },
  ];
  const sel = groups.find((g) => g.id === open);
  return (
    <Section title="Versões da mesma pauta entre redes" sub="Vínculo por identificador editorial · Etapa 3 da proposta">
      <Panel light title="Pautas publicadas em duas ou mais redes">
        {groups.length === 0 ? <Empty>A planilha ainda não traz um identificador editorial que ligue as versões da mesma pauta entre redes (etapa 3 da proposta). Quando o pipeline publicar esse campo, as pautas aparecem aqui.</Empty> : (
        <DataTable rows={groups} cols={cols} rowKey={(g) => g.id} pageSize={6} defaultSort="e" onRowClick={(g) => setOpen(g.id === open ? null : g.id)} />)}
        {sel && (
          <div style={{ marginTop: 14 }}>
            <Well><h4 style={{ marginBottom: 6 }}>{sel.title}: taxa de engajamento por versão</h4>
              <HBars aria={`Taxa de engajamento por rede na pauta ${sel.title}`} labelW={150} rows={sel.ps.map((p) => ({ key: p.id, label: `${PLATFORM_BY_ID[p.platform].name} · ${FORMAT_BY_ID[p.format].name}`, value: postMetric(p, 'er'), color: PLATFORM_BY_ID[p.platform].color, text: postMetric(p, 'er') === null ? ND : fmtPct(postMetric(p, 'er') as number, 2), sub: `${PLATFORM_BY_ID[p.platform].kpiLabel}: ${fmtCompact(postMetric(p, 'kpi') ?? 0)}` }))} />
            </Well>
          </div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>Clique em uma pauta para comparar as versões. As taxas usam a base de cada rede (alcance, visualizações ou impressões).</p>
      </Panel>
    </Section>
  );
}

/* ---------- vídeo — Etapa 3 ---------- */
function VideoSection({ posts }: { posts: Post[] }) {
  const vids = posts.filter((p) => p.durationSec && p.metrics.retention !== null);
  const bands: { id: string; label: string; test: (s: number) => boolean }[] = [
    { id: 'a', label: '≤ 15 s', test: (s) => s <= 15 }, { id: 'b', label: '16–30 s', test: (s) => s > 15 && s <= 30 }, { id: 'c', label: '31–60 s', test: (s) => s > 30 && s <= 60 },
    { id: 'd', label: '1–5 min', test: (s) => s > 60 && s <= 300 }, { id: 'e', label: '> 5 min', test: (s) => s > 300 },
  ];
  const rows = bands.map((b) => { const ps = vids.filter((p) => b.test(p.durationSec as number)); return { b, n: ps.length, ret: aggregate(ps, 'retention', 'media').value, comp: aggregate(ps, 'completion', 'media').value, watch: aggregate(ps, 'watch', 'media').value }; }).filter((r) => r.n > 0);
  const dots = vids.slice(0, 900).map((p) => ({ x: p.durationSec as number, y: (p.metrics.retention as number) * 100, color: PLATFORM_BY_ID[p.platform].color, tip: `${p.title} — ${PLATFORM_BY_ID[p.platform].name}: ${p.durationSec}s, retenção ${((p.metrics.retention as number) * 100).toFixed(1).replace('.', ',')}%` }));
  const used = [...new Set(vids.map((p) => p.platform))];
  return (
    <Section title="Desempenho de vídeo" sub="Duração, tempo médio assistido, retenção e conclusão, conforme a fonte · Etapa 3 da proposta">
      {vids.length === 0 ? <Empty>A planilha não traz duração, tempo assistido, retenção nem conclusão de vídeo (etapa 3 da proposta). Nada é estimado.</Empty> : (
        <div className="grid g2">
          <Panel title="Retenção por duração do vídeo" sub={`${fmtInt(vids.length)} vídeos com dado de retenção`}>
            <Well><Columns aria="Retenção média por faixa de duração" rows={rows.map((r) => ({ key: r.b.id, label: r.b.label, value: r.ret ?? 0, text: fmtPct(r.ret ?? 0, 1) }))} /></Well>
            <div className="tbl-wrap" style={{ marginTop: 10 }}><table className="tbl"><thead><tr><th>Duração</th><th className="num">Vídeos</th><th className="num">Tempo médio assistido</th><th className="num">Retenção</th><th className="num">Conclusão</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.b.id}><td>{r.b.label}</td><td className="num">{r.n}</td><td className="num">{fmtMetric(r.watch, 'watch')}</td><td className="num">{fmtMetric(r.ret, 'retention')}</td><td className="num">{fmtMetric(r.comp, 'completion')}</td></tr>)}</tbody></table></div>
          </Panel>
          <Panel title="Duração × retenção" sub="Cada ponto é um vídeo (escala logarítmica na duração)">
            <Well><Scatter dots={dots} aria="Dispersão de duração e retenção dos vídeos" xLabel="Duração do vídeo" yLabel="Retenção média" fmtX={fmtSec} fmtY={(v) => `${Math.round(v)}%`} /></Well>
            <SwatchLegend items={used.map((p) => ({ label: PLATFORM_BY_ID[p].name, color: PLATFORM_BY_ID[p].color }))} />
          </Panel>
        </div>
      )}
    </Section>
  );
}
