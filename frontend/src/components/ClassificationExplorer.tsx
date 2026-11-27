import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMAT_BY_ID, PLATFORM_BY_ID } from '../data/catalog';
import { postEngagement } from '../domain/aggregate';
import { fmtDMY } from '../domain/dates';
import { groupClasses, matchesPick, OTHERS, squarify, subOf, typeOf, type ClassGroup, type ClassPick } from '../domain/classification';
import { fmtCompact, fmtInt, fmtPct, fmtShare, ND } from '../domain/format';
import { postMetric } from '../domain/contentStats';
import { networkTrends, scatterPoints, type ScatterPoint, type Trend } from '../domain/outliers';
import { useStore } from '../state/store';
import type { PlatformId, Post } from '../types';
import type { Table } from '../utils/export';
import { HBars, PngButton, useWidth } from './charts/charts';
import { HEAT, heatColor } from './charts/scale';
import { Info } from './ui/Info';
import { DataTable, Empty, ExportButtons, Panel, PlatformBadge, Section, Segmented, Select, Well, type Col } from './ui/ui';

type Size = 'posts' | 'engagement';

const FONT = 'DM Sans, Arial, sans-serif';
const MANY = 1.2, FEW = 0.8; // retorno ÷ esforço: acima rende mais que o volume; abaixo, menos

/** Quebra o nome em até duas linhas que caibam no bloco. */
function wrap(text: string, chars: number): string[] {
  if (text.length <= chars) return [text];
  const cut = text.lastIndexOf(' ', chars);
  // palavra única que não cabe: abrevia em vez de partir no meio
  if (cut <= 2) return [`${text.slice(0, Math.max(1, chars - 1))}…`];
  const first = text.slice(0, cut);
  const rest = text.slice(first.length).trim();
  return [first, rest.length > chars ? `${rest.slice(0, Math.max(1, chars - 1))}…` : rest];
}

function Treemap({ groups, size, minN, picked, onPick, aria }: { groups: ClassGroup[]; size: Size; minN: number; picked: string | null; onPick: (g: ClassGroup) => void; aria: string }) {
  const [ref, W] = useWidth();
  const H = 320;
  const value = (g: ClassGroup) => g.perPost;
  const sorted = [...groups].filter((g) => g[size] > 0).sort((a, b) => b[size] - a[size]);
  const rects = squarify(sorted.map((g) => g[size]), { x: 0, y: 0, w: W, h: H });
  // "Outros" não define a escala de cor: é uma mistura
  const max = Math.max(1e-9, ...sorted.filter((g) => g.key !== OTHERS && g.withEngagement >= minN).map((g) => value(g) ?? 0));
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="group" aria-label={aria} style={{ display: 'block', fontFamily: FONT }}>
        {sorted.map((g, i) => {
          const r = rects[i];
          const v = value(g);
          const color = v === null ? { bg: '#e8eeef', fg: '#48696f' } : heatColor(Math.sqrt(Math.min(1, v / max)));
          const chars = Math.floor((r.w - 16) / 7.2);
          const name = r.w > 54 && r.h > 30 ? wrap(g.label, chars) : [];
          const showName = name.slice(0, r.h > 46 ? 2 : 1);
          const valueY = r.y + 20 + showName.length * 15 + 8;
          const tip = `${g.label}: ${fmtInt(g.posts)} publicações · engajamento ${fmtInt(g.engagement)} · média por publicação ${v === null ? ND : fmtCompact(v)}`;
          return (
            <g key={g.key} className="tile" role="button" tabIndex={0} aria-label={tip} aria-pressed={picked === g.key} opacity={g.posts < minN ? 0.55 : 1}
              onClick={() => onPick(g)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(g); } }}>
              <title>{tip}</title>
              <rect x={r.x + 1.5} y={r.y + 1.5} width={Math.max(0, r.w - 3)} height={Math.max(0, r.h - 3)} rx={8} fill={color.bg} stroke={picked === g.key ? '#7a56d6' : 'transparent'} strokeWidth={4} />
              {showName.map((line, k) => <text key={k} x={r.x + 10} y={r.y + 20 + k * 15} fontSize={13} fontWeight={800} fill={color.fg}>{line}</text>)}
              {showName.length > 0 && valueY < r.y + r.h - 6 && (
                <text x={r.x + 10} y={valueY} fontSize={r.w > 150 && r.h > 100 ? 24 : 14} fontWeight={800} fill={color.fg}>
                  {size === 'posts' ? fmtCompact(g.posts) : fmtCompact(g.engagement)}
                </text>
              )}
              {showName.length > 0 && r.w > 120 && valueY + 18 < r.y + r.h - 4 && (
                <text x={r.x + 10} y={valueY + 18} fontSize={11.5} fill={color.fg}>{v === null ? 'engajamento n/d' : `média: ${fmtCompact(v)}`}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend-scale">Cor = engajamento médio por publicação: menor <span style={{ display: 'inline-flex', gap: 2 }}>{HEAT.map((h) => <i key={h} style={{ background: h }} />)}</span> maior · área = {size === 'posts' ? 'publicações' : 'engajamento total'} · blocos esmaecidos = amostra pequena</div>
    </div>
  );
}

/** Esforço (% das publicações) frente a retorno (% do engajamento), em barras espelhadas. */
function EffortReturn({ groups, minN, picked, onPick }: { groups: ClassGroup[]; minN: number; picked: string | null; onPick: (g: ClassGroup) => void }) {
  const rows = groups.filter((g) => g.withEngagement > 0);
  const max = Math.max(1e-9, ...rows.flatMap((g) => [g.sharePosts, g.shareEngagement]));
  if (!rows.length) return <Empty>Sem engajamento disponível para comparar neste recorte.</Empty>;
  return (
    <div className="effort">
      <div className="effort-row effort-head"><span>% das publicações</span><span /><span>% do engajamento</span><span /></div>
      {rows.map((g) => {
        const back = g.shareEngagement;
        const ratio = g.sharePosts ? back / g.sharePosts : null;
        const small = g.withEngagement < minN;
        const cls = small || ratio === null ? 'flat' : ratio >= MANY ? 'up' : ratio <= FEW ? 'down' : 'flat';
        return (
          <button type="button" key={g.key} className={`effort-row${small ? ' small-n' : ''}`} aria-pressed={picked === g.key} onClick={() => onPick(g)}
            title={`${g.label}: ${fmtInt(g.withEngagement)} publicações com engajamento${small ? ' · amostra pequena' : ''}`}>
            <span className="effort-side left"><b>{fmtShare(g.sharePosts * 100)}</b><i style={{ width: `${(g.sharePosts / max) * 100}%` }} /></span>
            <span className="effort-name">{g.label}</span>
            <span className="effort-side right"><i style={{ width: `${(back / max) * 100}%` }} /><b>{fmtShare(back * 100)}</b></span>
            <span className={`effort-ratio ${cls}`}>{ratio === null ? ND : `${ratio.toFixed(1).replace('.', ',')}×`}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Dispersão base × engajamento (log nos dois eixos); clicar numa bolinha abre a publicação. */
function OutlierScatter({ points, trends, focus, onOpen }: { points: ScatterPoint[]; trends: Trend[]; focus: ((p: Post) => boolean) | null; onOpen: (p: Post) => void }) {
  const [ref, W] = useWidth();
  const [hov, setHov] = useState<ScatterPoint | null>(null);
  const H = 360, L = 58, R = 14, TOP = 12, B = 42;
  const pts = points.filter((q) => q.base !== null);
  const lg = (v: number) => Math.log10(1 + v);
  const xMax = Math.max(1, Math.ceil(Math.max(0, ...pts.map((q) => lg(q.base as number))))), yMax = Math.max(1, Math.ceil(Math.max(0, ...pts.map((q) => lg(q.engagement)))));
  const px = (v: number) => L + (lg(v) / xMax) * (W - L - R);
  const py = (v: number) => TOP + (H - TOP - B) * (1 - lg(v) / yMax);
  const ticks = (n: number) => Array.from({ length: n + 1 }, (_, i) => (i === 0 ? 0 : 10 ** i));
  const nets = [...new Set(pts.map((q) => q.post.platform))] as PlatformId[];
  // outliers por último, para ficarem por cima
  const ordered = [...pts].sort((a, b) => Number(a.outlier) - Number(b.outlier));
  const tip = (q: ScatterPoint) => `${q.post.title} — ${PLATFORM_BY_ID[q.post.platform].name}: engajamento ${fmtInt(q.engagement)} · base ${fmtCompact(q.base as number)}${q.outlier ? ' · fora do agrupamento' : ''}`;
  return (
    <div className="chart" ref={ref}>
      {!pts.length ? <Empty>Nenhuma publicação desta rede tem alcance, visualizações ou impressões; sem base, não há dispersão para desenhar (os outliers dela são avaliados só pelo engajamento).</Empty> : <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="group" aria-label="Dispersão das publicações: base da taxa por engajamento" style={{ display: 'block', fontFamily: FONT }} onMouseLeave={() => setHov(null)}>
        {ticks(yMax).map((t) => <g key={`y${t}`}><line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke="#b5c9cc" strokeDasharray="3 4" /><text x={L - 8} y={py(t) + 4} textAnchor="end" fontSize={11} fill="#4f6b70">{fmtCompact(t)}</text></g>)}
        {ticks(xMax).map((t) => <g key={`x${t}`}><line x1={px(t)} x2={px(t)} y1={TOP} y2={H - B} stroke="#b5c9cc" strokeDasharray="3 4" /><text x={px(t)} y={H - B + 16} textAnchor="middle" fontSize={11} fill="#4f6b70">{fmtCompact(t)}</text></g>)}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="#4f6b70">Base da taxa (alcance, visualizações ou impressões) · escala log</text>
        <text x={12} y={TOP + (H - TOP - B) / 2} textAnchor="middle" fontSize={12} fontWeight={700} fill="#4f6b70" transform={`rotate(-90 12 ${TOP + (H - TOP - B) / 2})`}>Engajamento · escala log</text>
        {/* tendência de cada rede, no trecho de base que a rede cobre */}
        {trends.filter((t) => nets.includes(t.platform)).map((t) => {
          const at = (lx: number) => [L + (lx / xMax) * (W - L - R), TOP + (H - TOP - B) * (1 - Math.max(0, Math.min(yMax, t.a + t.b * lx)) / yMax)];
          const [ax, ay] = at(t.x0), [bx, by] = at(t.x1);
          return <line key={`t-${t.platform}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="#07333a" strokeWidth={5} strokeOpacity={0.35} strokeLinecap="round" />;
        })}
        {ordered.map((q) => {
          const c = PLATFORM_BY_ID[q.post.platform].color;
          const dim = focus && !focus(q.post);
          return (
            <circle key={q.post.id} className="dot" cx={px(q.base as number)} cy={py(q.engagement)} r={q.outlier ? 5.5 : 4}
              fill={q.outlier ? '#fff' : c} fillOpacity={q.outlier ? 1 : 0.55} stroke={q.outlier ? '#c3423b' : c} strokeWidth={q.outlier ? 2.2 : 1}
              opacity={dim ? 0.15 : 1} onMouseEnter={() => setHov(q)} onClick={() => onOpen(q.post)}>
              <title>{tip(q)}</title>
            </circle>
          );
        })}
        {trends.filter((t) => nets.includes(t.platform)).map((t) => {
          const at = (lx: number) => [L + (lx / xMax) * (W - L - R), TOP + (H - TOP - B) * (1 - Math.max(0, Math.min(yMax, t.a + t.b * lx)) / yMax)];
          const [ax, ay] = at(t.x0), [bx, by] = at(t.x1);
          return <line key={`tt-${t.platform}`} x1={ax} y1={ay} x2={bx} y2={by} stroke={PLATFORM_BY_ID[t.platform].color} strokeWidth={2.2} strokeDasharray="7 4" strokeLinecap="round"><title>{`Tendência de ${PLATFORM_BY_ID[t.platform].name}`}</title></line>;
        })}
      </svg>
      {hov && <div className="tip" style={{ left: Math.min(px(hov.base as number) + 10, W - 290), top: Math.max(0, py(hov.engagement) - 60) }}>{tip(hov)}<br /><small>Clique para abrir a publicação</small></div>}
      <div className="legend-scale" style={{ flexWrap: 'wrap' }}>
        {nets.map((n) => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ background: PLATFORM_BY_ID[n].color, borderRadius: '50%' }} />{PLATFORM_BY_ID[n].name}</span>)}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ background: '#fff', border: '2px solid #c3423b', borderRadius: '50%' }} />fora do agrupamento (outlier)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 18, height: 0, borderTop: '2px dashed #48696f', borderRadius: 0 }} />tendência da rede</span>
      </div>
      </>}
    </div>
  );
}

/** Dispersão com filtro por rede e o subdetalhamento dos outliers de alto engajamento. */
function OutlierDetail({ points, trends, focus, title }: { points: ScatterPoint[]; trends: Trend[]; focus: ((p: Post) => boolean) | null; title: string }) {
  const { setOpenPost } = useStore();
  const [net, setNet] = useState<'all' | PlatformId>('all');
  const nets = useMemo(() => [...new Set(points.map((q) => q.post.platform))] as PlatformId[], [points]);
  const shown = net !== 'all' && nets.includes(net) ? points.filter((q) => q.post.platform === net) : points;
  const sel = net !== 'all' && nets.includes(net) ? net : 'all';
  const byNet = nets.map((n) => {
    const all = points.filter((q) => q.post.platform === n);
    const h = all.filter((q) => q.high).length;
    return { n, h, total: all.length };
  }).filter((r) => r.h > 0).sort((a, b) => b.h - a.h || b.h / b.total - a.h / a.total);
  return (
    <>
      <div className="well class-effort">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Agrupamento das publicações · {title}<Info>Cada bolinha é uma publicação: base da taxa no eixo horizontal e engajamento no vertical, em escala logarítmica. Cada rede forma o seu agrupamento; é outlier a publicação muito distante do centro do agrupamento da sua rede (distância de Mahalanobis robusta, limite de 99,9%), considerando a relação entre base e engajamento. A linha tracejada é a tendência de cada rede (mínimos quadrados em escala log, sem os outliers). Publicações sem base são avaliadas só pelo engajamento e não aparecem no gráfico. Clique numa bolinha para abrir a publicação.</Info></h3>
          <Select label="Rede do agrupamento" value={sel} options={[{ id: 'all', label: 'Todas as redes' }, ...nets.map((n) => ({ id: n as string, label: PLATFORM_BY_ID[n].name }))]} onChange={(v) => setNet(v as never)} />
        </div>
        <OutlierScatter points={shown} trends={trends} focus={focus} onOpen={setOpenPost} />
      </div>
        <div className="well class-effort">
          <h3>Redes que mais produzem outliers<Info>Outliers de alto engajamento por rede, no nível aberto do mapa. Ao passar o mouse, a fatia das publicações da rede que são outliers. Não segue o filtro de rede do gráfico.</Info></h3>
          {byNet.length ? <HBars aria="Outliers de alto engajamento por rede" labelW={130} rows={byNet.map((r) => ({
            key: r.n, label: PLATFORM_BY_ID[r.n].name, value: r.h, color: PLATFORM_BY_ID[r.n].color, text: fmtInt(r.h),
            sub: `${fmtShare((r.h / r.total) * 100)} das publicações`, tip: `${PLATFORM_BY_ID[r.n].name}: ${fmtInt(r.h)} de ${fmtInt(r.total)} publicações com engajamento`,
            active: sel === r.n, onClick: () => setNet(sel === r.n ? 'all' : r.n),
          }))} /> : <Empty>Nenhuma rede com outliers de alto engajamento.</Empty>}
        </div>
    </>
  );
}

/** Publicações da classificação escolhida, da de maior para a de menor engajamento. */
function TopPosts({ posts, title, showSub }: { posts: Post[]; title: string; showSub: boolean }) {
  const { setOpenPost } = useStore();
  const rows = useMemo(() => posts.filter((p) => postEngagement(p) !== null).sort((a, b) => (postEngagement(b) as number) - (postEngagement(a) as number)), [posts]);
  const cols: Col<Post>[] = [
    { id: 't', label: 'Publicação', render: (p) => <b>{p.title}</b> },
    ...(showSub ? [{ id: 's', label: 'Subtipo', render: (p: Post) => subOf(p) }] : []),
    { id: 'r', label: 'Rede', render: (p) => <PlatformBadge id={p.platform} /> },
    { id: 'f', label: 'Formato', render: (p) => FORMAT_BY_ID[p.format].name },
    { id: 'd', label: 'Data', render: (p) => fmtDMY(p.day), sort: (p) => p.day },
    { id: 'e', label: 'Engajamento', num: true, render: (p) => fmtInt(postEngagement(p) as number), sort: (p) => postEngagement(p) },
    { id: 'tx', label: 'Taxa', num: true, render: (p) => { const v = postMetric(p, 'er'); return v === null ? <span className="nd">{ND}</span> : <span title={`Base: ${p.metrics.erBase === 'reach' ? 'alcance' : p.metrics.erBase === 'impressions' ? 'impressões' : 'visualizações'}`}>{fmtPct(v, 2)}</span>; }, sort: (p) => postMetric(p, 'er') },
    { id: 'l', label: 'Link', render: (p) => <a className="link" href={p.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>abrir</a> },
  ];
  return (
    <div className="well class-effort">
      <h3>Publicações com mais engajamento · {title}</h3>
      {rows.length ? <DataTable key={title} rows={rows} cols={cols} rowKey={(p) => p.id} onRowClick={setOpenPost} pageSize={5} defaultSort="e" />
        : <Empty>Nenhuma publicação com engajamento disponível nesta classificação.</Empty>}
    </div>
  );
}

interface Props {
  posts: Post[];
  minN: number;
  pick: ClassPick;
  /** `others` = subtipos reunidos em "Outros", para o filtro do ranking */
  onPick: (pick: ClassPick, others: string[]) => void;
}

export function ClassificationExplorer({ posts: all, minN, pick, onPick }: Props) {
  const [size, setSize] = useState<Size>('posts');
  const [hideOutliers, setHideOutliers] = useState(false);
  const [showScatter, setShowScatter] = useState(false);
  const { setOpenPost } = useStore();
  // outliers avaliados no recorte inteiro, cada publicação contra o agrupamento da sua rede
  const points = useMemo(() => scatterPoints(all), [all]);
  const outlierIds = useMemo(() => new Set(points.filter((q) => q.outlier).map((q) => q.post.id)), [points]);
  const posts = useMemo(() => (hideOutliers ? all.filter((p) => !outlierIds.has(p.id)) : all), [all, hideOutliers, outlierIds]);
  const ref = useRef<HTMLDivElement>(null);
  const types = useMemo(() => groupClasses(posts, typeOf), [posts]);
  const type = pick.type && types.some((t) => t.key === pick.type) ? pick.type : null;
  const subs = useMemo(() => (type ? groupClasses(posts.filter((p) => typeOf(p) === type), subOf, true) : []), [posts, type]);
  const groups = type ? subs : types;
  const picked = type ? pick.sub : null;

  const choose = (g: ClassGroup) => {
    if (!type) return onPick({ type: g.key, sub: null }, []);
    onPick({ type, sub: pick.sub === g.key ? null : g.key }, g.members);
  };

  // detalhamento: o subtipo escolhido ou, sem ele, o tipo aberto
  const sub = picked ? subs.find((g) => g.key === picked) ?? null : null;
  const detail = useMemo(() => (type ? posts.filter((p) => matchesPick(p, { type, sub: sub?.key ?? null }, sub?.members ?? [])) : []), [posts, type, sub]);

  // clique nas barras: leva a tela até o detalhamento, que fica abaixo delas
  const detailRef = useRef<HTMLDivElement>(null);
  const reveal = useRef(false);
  useEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pick.type, pick.sub]);

  // a dispersão mostra o nível aberto; o subtipo escolhido fica em destaque
  const levelPoints = useMemo(() => (type ? points.filter((q) => typeOf(q.post) === type) : points), [points, type]);
  const focus = sub ? (p: Post) => matchesPick(p, { type, sub: sub.key }, sub.members) : null;
  const levelOutliers = levelPoints.filter((q) => q.outlier).length;
  const trends = useMemo(() => networkTrends(points), [points]);

  const table = (): Table => ({
    name: 'classificacao',
    headers: ['Tipo de classificação', 'Subtipo de classificação', 'Publicações', 'Publicações com engajamento', 'Engajamento', 'Engajamento médio por publicação'],
    rows: types.flatMap((t) => groupClasses(posts.filter((p) => typeOf(p) === t.key), subOf).map((s) => [t.key, s.key, s.posts, s.withEngagement, s.engagement, s.perPost === null ? null : Math.round(s.perPost * 10) / 10])),
  });

  const where = type ?? 'Todos os tipos';
  return (
    <Section title="Mapa da classificação" sub="Clique em um tipo para abrir os subtipos e ver as publicações com mais engajamento; clique em um subtipo para detalhar só ele (o ranking de publicações acompanha)">
      <Panel title={type ? <><button type="button" className="crumb" onClick={() => onPick({ type: null, sub: null }, [])}>← Todos os tipos</button> {type}</> : 'Tipos de classificação'}
          tools={<><Segmented value={size} label="Tamanho dos blocos" options={[{ id: 'posts', label: 'Publicações' }, { id: 'engagement', label: 'Engajamento' }]} onChange={setSize} /><button type="button" role="switch" aria-checked={hideOutliers} className="switch" onClick={() => setHideOutliers((v) => !v)}><span className="switch-track" aria-hidden />Retirar outliers ({fmtInt(outlierIds.size)})</button><ExportButtons table={table} /><PngButton target={ref} name="mapa-classificacao" /></>}>
        {groups.length ? (
          <div className="class-stack">
            <Well><div ref={ref}><Treemap aria={`Mapa de classificação: ${where}`} groups={groups} size={size} minN={minN} picked={picked} onPick={choose} /></div></Well>
            <div className="well class-effort">
              <h3>Esforço × retorno<Info>Compara a fatia das publicações com a fatia do engajamento somado. 2,0× = rende o dobro do volume que ocupa. Considera só publicações com engajamento disponível. Ligue “Retirar outliers” para tirar as publicações fora do agrupamento da sua rede (veja a dispersão abaixo).</Info></h3>
              <EffortReturn groups={groups} minN={minN} picked={picked} onPick={(g) => { reveal.current = true; choose(g); }} />
              {hideOutliers && outlierIds.size > 0 && <p className="small muted" style={{ marginTop: 8 }}>{fmtInt(outlierIds.size)} publicações fora do agrupamento da sua rede foram retiradas do mapa, do esforço × retorno e do detalhamento.</p>}
              <button type="button" className="scatter-toggle" aria-expanded={showScatter} onClick={() => setShowScatter((v) => !v)}>
                <span className="fc-chev" aria-hidden>{showScatter ? '▴' : '▾'}</span> {showScatter ? 'Ocultar' : 'Ver'} a dispersão das publicações{levelOutliers > 0 ? ` · ${fmtInt(levelOutliers)} outliers` : ''}
              </button>
            </div>
            {showScatter && <OutlierDetail points={levelPoints} trends={trends} focus={focus} title={sub ? `${type} › ${sub.label}` : where} />}
            {type && <div ref={detailRef}><TopPosts posts={detail} title={sub ? `${type} › ${sub.label}` : type} showSub={!sub || sub.key === OTHERS} /></div>}
          </div>
        ) : <Empty>Sem publicações para os filtros atuais.</Empty>}
      </Panel>
    </Section>
  );
}
