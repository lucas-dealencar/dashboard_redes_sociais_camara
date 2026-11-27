import { useCallback, useEffect, useRef, useState, type ReactNode, type RefCallback, type RefObject } from 'react';
import { niceScale, heatColor, HEAT, SEQ } from './scale';
import { downloadSvgPng } from '../../utils/export';
import { PLATFORM_LOGO } from '../../data/logos';
import { BRAZIL_STATES, BRAZIL_VB_W, BRAZIL_VIEWBOX } from '../../data/brazilMap';

const F = 'DM Sans, Arial, sans-serif';
/** logotipo quando a chave do item é uma rede */
const logoOf = (key: string): string | undefined => (PLATFORM_LOGO as Record<string, string>)[key];

/**
 * Largura do contêiner do gráfico. O ref é de callback: se o elemento for trocado (ex.: o gráfico
 * some para dar lugar a uma mensagem e depois volta), a medição passa para o elemento novo.
 */
export function useWidth(): [RefCallback<HTMLDivElement> & RefObject<HTMLDivElement>, number] {
  const [w, setW] = useState(600);
  const ro = useRef<ResizeObserver | null>(null);
  const holder = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    holder.current = el;
    if (!el) return;
    const measure = () => { if (el.isConnected && el.clientWidth > 0) setW(Math.max(240, el.clientWidth)); };
    measure();
    ro.current = new ResizeObserver(measure);
    ro.current.observe(el);
  }, []) as RefCallback<HTMLDivElement> & RefObject<HTMLDivElement>;
  Object.defineProperty(ref, 'current', { get: () => holder.current, configurable: true });
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, w];
}

export function PngButton({ target, name }: { target: RefObject<HTMLElement> | (() => HTMLElement | null); name: string }) {
  return (
    <button className="btn sm" title="Baixar gráfico em PNG" onClick={() => { const el = typeof target === 'function' ? target() : target.current; const s = el?.querySelector('svg'); if (s) downloadSvgPng(s as SVGSVGElement, name); }}>PNG</button>
  );
}

const T = (p: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; weight?: number; fill?: string; italic?: boolean; rotate?: number }) => (
  <text x={p.x} y={p.y} textAnchor={p.anchor ?? 'start'} fontSize={p.size ?? 12} fontWeight={p.weight ?? 400} fill={p.fill ?? '#4f6b70'} fontFamily={F} fontStyle={p.italic ? 'italic' : 'normal'}
    transform={p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : undefined}>{p.children}</text>
);

/* ------------------------------------------------------------------ LINHA */
export interface LineSeries { id: string; label: string; color: string; dash?: string; values: (number | null)[]; width?: number; fmt?: (v: number) => string }
export interface LineMarker { index: number; label: string }
interface LineProps {
  labels: string[];
  series: LineSeries[];
  compare?: LineSeries[];
  fmt: (v: number) => string;
  height?: number;
  peaks?: number[];
  markers?: LineMarker[];
  selected?: number | null;
  onSelect?: (i: number) => void;
  area?: boolean;
  band?: { q1: (number | null)[]; q3: (number | null)[]; med: (number | null)[] };
  aria: string;
  zero?: boolean;
  /** cada série é plotada na própria escala (0–100% da sua faixa); o tooltip mostra os valores reais */
  rel?: boolean;
}

export function LineChart({ labels, series, compare, fmt, height = 250, peaks = [], markers = [], selected, onSelect, area, band, aria, zero = true, rel }: LineProps) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const L = 58, R = 16, TOP = 14, B = 30;
  const n = labels.length;
  const ps: LineSeries[] = rel ? series.map((s) => { const vs = s.values.filter((v): v is number => v !== null); const mn = vs.length ? Math.min(...vs) : 0, mx = vs.length ? Math.max(...vs) : 1; return { ...s, values: s.values.map((v) => (v === null ? null : mx === mn ? 50 : ((v - mn) / (mx - mn)) * 100)) }; }) : series;
  const axFmt = rel ? (v: number) => (v === 0 ? 'mín.' : v === 100 ? 'máx.' : `${v}%`) : fmt;
  const all = [...ps, ...(compare ?? [])].flatMap((s) => s.values).concat(band ? [...band.q1, ...band.q3] : []).filter((v): v is number => v !== null);
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  const sc = rel ? { min: -4, max: 104, ticks: [0, 25, 50, 75, 100] } : niceScale(zero && lo > 0 ? 0 : lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.04 || 1, 5);
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (n - 1));
  const y = (v: number) => TOP + (height - TOP - B) * (1 - (v - sc.min) / (sc.max - sc.min || 1));
  const path = (vals: (number | null)[]) => {
    let d = '', pen = false;
    vals.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 78))));
  const idxFromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = (clientX - r.left) * (W / (r.width || W));
    return Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
  };
  const hi2 = hover ?? selected ?? null;
  const tipLeft = hi2 !== null ? x(hi2) : 0;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={aria}
        tabIndex={onSelect ? 0 : undefined}
        onMouseMove={(e) => setHover(idxFromX(e.clientX))} onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect?.(idxFromX(e.clientX))}
        onKeyDown={(e) => {
          if (!onSelect) return;
          const cur = selected ?? hover ?? 0;
          if (e.key === 'ArrowRight') { onSelect(Math.min(n - 1, cur + 1)); e.preventDefault(); }
          if (e.key === 'ArrowLeft') { onSelect(Math.max(0, cur - 1)); e.preventDefault(); }
        }}
        style={{ display: 'block', overflow: 'visible', cursor: onSelect ? 'pointer' : 'default' }}>
        {sc.ticks.map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#b5c9cc" strokeDasharray="3 4" /><T x={L - 8} y={y(t) + 4} anchor="end">{axFmt(t)}</T></g>
        ))}
        {labels.map((lb, i) => (i % tickEvery === 0 ? <T key={i} x={x(i)} y={height - 9} anchor="middle">{lb}</T> : null))}
        {band && (() => {
          const up: string[] = [], dn: string[] = [];
          band.q3.forEach((v, i) => { if (v !== null && band.q1[i] !== null) { up.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); dn.unshift(`${x(i).toFixed(1)},${y(band.q1[i] as number).toFixed(1)}`); } });
          return up.length ? <polygon points={[...up, ...dn].join(' ')} fill="#9fc3c4" fillOpacity={0.35} /> : null;
        })()}
        {band && <path d={path(band.med)} fill="none" stroke="#f5a623" strokeWidth={2} strokeDasharray="6 4" />}
        {markers.map((m) => (
          <g key={`${m.index}-${m.label}`}><line x1={x(m.index)} x2={x(m.index)} y1={TOP} y2={height - B} stroke="#7a56d6" strokeOpacity={0.35} strokeDasharray="2 3" />
            <path d={`M${x(m.index)},${height - B - 7} l5,5 l-5,5 l-5,-5 z`} fill="#7a56d6"><title>{m.label}</title></path></g>
        ))}
        {(compare ?? []).map((s) => <path key={`c-${s.id}`} d={path(s.values)} fill="none" stroke="#8fa6aa" strokeWidth={1.8} strokeDasharray="5 4" />)}
        {area && ps[0] && (() => {
          const pts = ps[0].values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p !== null);
          return pts.length ? <path d={`M${pts[0][0]},${y(Math.max(sc.min, 0))} ${pts.map((p) => `L${p[0]},${p[1]}`).join(' ')} L${pts[pts.length - 1][0]},${y(Math.max(sc.min, 0))} Z`} fill={ps[0].color} fillOpacity={0.1} /> : null;
        })()}
        {ps.map((s) => <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />)}
        {n <= 40 && ps.map((s) => s.values.map((v, i) => (v === null ? null : <circle key={`${s.id}-${i}`} cx={x(i)} cy={y(v)} r={3} fill={s.color} stroke="#fff" strokeWidth={1.2} />)))}
        {peaks.map((i) => {
          const v = ps[0]?.values[i];
          return v === null || v === undefined ? null : <g key={`pk-${i}`}><circle cx={x(i)} cy={y(v)} r={7} fill="#f5a623" stroke="#07333a" strokeWidth={2} /><T x={x(i)} y={y(v) - 12} anchor="middle" size={11} weight={800} fill="#000">{labels[i]}</T></g>;
        })}
        {hi2 !== null && <line x1={x(hi2)} x2={x(hi2)} y1={TOP} y2={height - B} stroke="#07333a" strokeWidth={1.2} />}
        {selected !== null && selected !== undefined && ps.map((s) => (s.values[selected] == null ? null : <circle key={`sel-${s.id}`} cx={x(selected)} cy={y(s.values[selected] as number)} r={6} fill="#36c7a6" stroke="#07333a" strokeWidth={2.5} />))}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: Math.min(Math.max(tipLeft + 12, 8), W - 200), top: 6 }}>
          <b>{labels[hover]}</b>
          {series.map((s) => <div className="row" key={s.id}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color === '#101010' ? '#fff' : s.color, marginRight: 6 }} />{s.label}</span><span>{s.values[hover] == null ? 'n/d' : (s.fmt ?? fmt)(s.values[hover] as number)}</span></div>)}
          {(compare ?? []).map((s) => <div className="row" key={`c-${s.id}`} style={{ color: '#b9d4d6' }}><span>{s.label}</span><span>{s.values[hover] == null ? 'n/d' : fmt(s.values[hover] as number)}</span></div>)}
          {band && band.med[hover] != null && <div className="row" style={{ color: '#ffd58a' }}><span>Mediana de ref.</span><span>{fmt(band.med[hover] as number)}</span></div>}
          {markers.filter((m) => m.index === hover).map((m) => <div key={m.label} style={{ marginTop: 4, color: '#d8c8ff' }}>◆ {m.label}</div>)}
        </div>
      )}
    </div>
  );
}

export function Legend({ items, off, toggle }: { items: { id: string; label: string; color: string; dash?: string }[]; off?: string[]; toggle?: (id: string) => void }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <button key={it.id} aria-pressed={!off?.includes(it.id)} onClick={() => toggle?.(it.id)} disabled={!toggle}>
          <i style={{ borderTopColor: it.color, borderTopStyle: it.dash ? 'dashed' : 'solid' }} />{logoOf(it.id) && <img className="plogo" src={logoOf(it.id)} alt="" style={{ width: 16, height: 16, marginRight: 4 }} />}{it.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ BARRAS HORIZONTAIS */
export interface HBarRow { key: string; label: string; value: number | null; text: string; color?: string; sub?: string; tip?: string; faded?: boolean; onClick?: () => void; active?: boolean }
export function HBars({ rows, max, aria, labelW = 190, rowH = 34, color = '#134e5e' }: { rows: HBarRow[]; max?: number; aria: string; labelW?: number; rowH?: number; color?: string }) {
  const [ref, W] = useWidth();
  const lw = Math.min(labelW, W * 0.4);
  const right = 96;
  const m = max ?? Math.max(1e-9, ...rows.map((r) => r.value ?? 0));
  const H = rows.length * rowH + 4;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={aria} style={{ display: 'block' }}>
        {rows.map((r, i) => {
          const y0 = i * rowH + 3, bw = Math.max(r.value ? 2 : 0, ((W - lw - right) * (r.value ?? 0)) / m);
          return (
            <g key={r.key} onClick={r.onClick} style={{ cursor: r.onClick ? 'pointer' : 'default' }} opacity={r.faded ? 0.55 : 1}>
              {r.tip && <title>{r.tip}</title>}
              <rect x={0} y={y0 - 2} width={W} height={rowH - 2} fill={r.active ? '#e3efee' : 'transparent'} rx={4} />
              {logoOf(r.key)
                ? <><image href={logoOf(r.key)} x={4} y={y0 + rowH / 2 - 14} width={18} height={18} /><T x={28} y={y0 + rowH / 2 - 1} fill="#2f5258" size={12.5}>{r.label}</T></>
                : <T x={lw - 8} y={y0 + rowH / 2 - 1} anchor="end" fill="#2f5258" size={12.5}>{r.label.length > 40 ? r.label.slice(0, 39) + '…' : r.label}</T>}
              {r.value === null ? <T x={lw} y={y0 + rowH / 2 - 1} italic fill="#8aa1a5" size={12}>indisponível</T> : <rect x={lw} y={y0 + 4} width={bw} height={rowH - 12} rx={3} fill={r.color ?? color} />}
              {r.value !== null && <T x={lw + bw + 6} y={y0 + rowH / 2 - 1} weight={800} fill="#07333a" size={12.5}>{r.text}</T>}
              {r.sub && <T x={W} y={y0 + rowH / 2 - 1} anchor="end" size={11} fill="#6e898e">{r.sub}</T>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ COLUNAS */
export interface ColRow { key: string; label: string; value: number; text: string; color?: string }
export function Columns({ rows, aria, height = 220, color = '#134e5e', maxW = 70 }: { rows: ColRow[]; aria: string; height?: number; color?: string; maxW?: number }) {
  const [ref, W] = useWidth();
  const L = 8, B = 28, TOP = 24;
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  const slot = (W - L * 2) / Math.max(1, rows.length), bw = Math.min(maxW, slot * 0.62);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={aria} style={{ display: 'block' }}>
        <line x1={L} x2={W - L} y1={height - B} y2={height - B} stroke="#48696f" strokeWidth={1.5} />
        {rows.map((r, i) => {
          const h = Math.max(2, ((height - B - TOP) * r.value) / max), cx = L + slot * i + slot / 2;
          return (
            <g key={r.key}>
              <rect x={cx - bw / 2} y={height - B - h} width={bw} height={h} rx={3} fill={r.color ?? color} />
              <T x={cx} y={height - B - h - 6} anchor="middle" weight={800} fill="#07333a" size={12.5}>{r.text}</T>
              <T x={cx} y={height - 9} anchor="middle" size={12}>{r.label}</T>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ EMPILHADOS 100% */
export interface StackSeg { label: string; value: number; color: string }
export function StackedBars({ rows, aria, labelW = 120, rowH = 34 }: { rows: { key: string; label: string; segs: StackSeg[] }[]; aria: string; labelW?: number; rowH?: number }) {
  const [ref, W] = useWidth();
  const lw = Math.min(labelW, W * 0.3), H = rows.length * rowH + 2;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={aria} style={{ display: 'block' }}>
        {rows.map((r, i) => {
          const tot = r.segs.reduce((s, g) => s + g.value, 0) || 1;
          let x = lw;
          return (
            <g key={r.key}>
              <T x={lw - 8} y={i * rowH + rowH / 2 + 3} anchor="end" fill="#2f5258" size={12.5}>{r.label}</T>
              {r.segs.map((g) => {
                const w = ((W - lw - 4) * g.value) / tot; const x0 = x; x += w;
                return (
                  <g key={g.label}><rect x={x0} y={i * rowH + 5} width={Math.max(0, w - 1)} height={rowH - 12} fill={g.color}><title>{`${r.label} · ${g.label}: ${g.value.toFixed(1).replace('.', ',')}%`}</title></rect>
                    {w > 34 && <T x={x0 + w / 2} y={i * rowH + rowH / 2 + 3} anchor="middle" size={11} weight={700} fill={isDark(g.color) ? '#fff' : '#07333a'}>{Math.round(g.value)}%</T>}</g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
const isDark = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 140; };

export function StackedColumns({ cats, series, values, aria, height = 240 }: { cats: string[]; series: { label: string; color: string }[]; values: number[][]; aria: string; height?: number }) {
  const [ref, W] = useWidth();
  const [hov, setHov] = useState<number | null>(null);
  const L = 36, B = 28, TOP = 8;
  const slot = (W - L - 6) / cats.length, bw = Math.min(46, slot * 0.7);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={aria} style={{ display: 'block' }} onMouseLeave={() => setHov(null)}>
        {[0, 25, 50, 75, 100].map((t) => { const yy = TOP + (height - B - TOP) * (1 - t / 100); return <g key={t}><line x1={L} x2={W - 6} y1={yy} y2={yy} stroke="#b5c9cc" strokeDasharray="3 4" /><T x={L - 6} y={yy + 4} anchor="end">{t}%</T></g>; })}
        {cats.map((c, ci) => {
          const tot = values[ci].reduce((s, v) => s + v, 0) || 1; let acc = 0; const cx = L + slot * ci + slot / 2;
          return (
            <g key={c} onMouseEnter={() => setHov(ci)}>
              {values[ci].map((v, si) => { const h = ((height - B - TOP) * v) / tot; const yy = height - B - acc - h; acc += h; return <rect key={si} x={cx - bw / 2} y={yy} width={bw} height={Math.max(0, h - 0.6)} fill={series[si].color} />; })}
              <T x={cx} y={height - 9} anchor="middle">{c}</T>
            </g>
          );
        })}
      </svg>
      {hov !== null && (
        <div className="tip" style={{ left: Math.min(L + slot * hov + slot, W - 190), top: 4 }}>
          <b>{cats[hov]}</b>
          {series.map((s, si) => <div className="row" key={s.label}><span><i style={{ display: 'inline-block', width: 8, height: 8, background: s.color, marginRight: 6 }} />{s.label}</span><span>{(values[hov][si] / (values[hov].reduce((a, b) => a + b, 0) || 1) * 100).toFixed(1).replace('.', ',')}%</span></div>)}
        </div>
      )}
    </div>
  );
}

export function SwatchLegend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.label} className="badge" style={{ fontWeight: 600 }}><i style={{ width: 12, height: 12, background: i.color, display: 'inline-block', borderRadius: 2 }} />{i.label}</span>)}</div>;
}

/* ------------------------------------------------------------------ SPARKLINE */
export function Sparkline({ values, color = '#134e5e', w = 120, h = 28 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), sp = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - lo) / sp) * (h - 6)).toFixed(1)}`);
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="spark"><polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

/* ------------------------------------------------------------------ DISPERSÃO */
export interface Dot { x: number; y: number; color: string; tip: string }
export function Scatter({ dots, aria, xLabel, yLabel, height = 300, fmtY, fmtX }: { dots: Dot[]; aria: string; xLabel: string; yLabel: string; height?: number; fmtY: (v: number) => string; fmtX: (v: number) => string }) {
  const [ref, W] = useWidth();
  const [hov, setHov] = useState<Dot | null>(null);
  const L = 54, R = 14, TOP = 10, B = 40;
  const xs = dots.map((d) => Math.log10(d.x));
  const x0 = xs.length ? Math.floor(Math.min(...xs) * 4) / 4 : 0, x1 = xs.length ? Math.ceil(Math.max(...xs) * 4) / 4 : 1;
  const ys = niceScale(0, Math.max(1, ...dots.map((d) => d.y)) * 1.05, 5);
  const px = (v: number) => L + ((Math.log10(v) - x0) / (x1 - x0 || 1)) * (W - L - R);
  const py = (v: number) => TOP + (height - TOP - B) * (1 - (v - ys.min) / (ys.max - ys.min || 1));
  const xt = [10, 30, 60, 180, 600, 1800].filter((t) => Math.log10(t) >= x0 && Math.log10(t) <= x1);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={aria} style={{ display: 'block' }} onMouseLeave={() => setHov(null)}>
        {ys.ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke="#b5c9cc" strokeDasharray="3 4" /><T x={L - 8} y={py(t) + 4} anchor="end">{fmtY(t)}</T></g>)}
        {xt.map((t) => <g key={t}><line x1={px(t)} x2={px(t)} y1={TOP} y2={height - B} stroke="#b5c9cc" strokeDasharray="3 4" /><T x={px(t)} y={height - B + 16} anchor="middle">{fmtX(t)}</T></g>)}
        <T x={(L + W - R) / 2} y={height - 6} anchor="middle" weight={700} size={12}>{xLabel}</T>
        <T x={12} y={TOP + (height - TOP - B) / 2} anchor="middle" weight={700} size={12} rotate={-90}>{yLabel}</T>
        {dots.map((d, i) => <circle key={i} cx={px(d.x)} cy={py(d.y)} r={4} fill={d.color} fillOpacity={0.6} stroke={d.color} onMouseEnter={() => setHov(d)} />)}
      </svg>
      {hov && <div className="tip" style={{ left: Math.min(px(hov.x) + 10, W - 230), top: Math.max(0, py(hov.y) - 50) }}>{hov.tip}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ MAPA DO BRASIL (UFs) */
// estados pequenos: rótulo deslocado com linha-guia [dx, dy, âncora]
const OUT_LABELS: Record<string, [number, number, 'start' | 'end']> = {
  RN: [15000, -6500, 'start'], PB: [16000, 0, 'start'], PE: [15000, 7000, 'start'], AL: [13000, 13500, 'start'], SE: [10000, 19000, 'start'],
  ES: [11000, 3000, 'start'], RJ: [10000, 9000, 'start'], DF: [-15000, -9000, 'end'],
};
export function BrazilMap({ data, aria }: { data: Record<string, number>; aria: string }) {
  const [ref] = useWidth();
  const [hov, setHov] = useState<string | null>(null);
  const max = Math.max(...Object.values(data), 1e-9);
  const K = BRAZIL_VB_W / 613;
  const fmt = (v: number) => v.toFixed(1).replace('.', ',') + '%';
  const hs = hov ? BRAZIL_STATES.find((s) => s.id === hov) : null;
  return (
    <div className="chart" ref={ref} style={{ maxWidth: 560, margin: '0 auto' }}>
      <svg viewBox={BRAZIL_VIEWBOX} width="100%" role="img" aria-label={aria} style={{ display: 'block' }} onMouseLeave={() => setHov(null)}>
        {BRAZIL_STATES.map((s) => {
          const v = data[s.id] ?? 0; const col = heatColor(Math.sqrt(v / max));
          return <path key={s.id} d={s.d} fill={col.bg} stroke={hov === s.id ? '#07333a' : '#ffffff'} strokeWidth={(hov === s.id ? 2.2 : 1.1) * K} strokeLinejoin="round" onMouseEnter={() => setHov(s.id)}><title>{`${s.name} (${s.id}): ${fmt(v)}`}</title></path>;
        })}
        {BRAZIL_STATES.map((s) => {
          const v = data[s.id] ?? 0; const col = heatColor(Math.sqrt(v / max));
          const off = OUT_LABELS[s.id];
          const tiny = s.w < 14 * K || s.h < 14 * K;
          if (off) {
            const x2 = s.cx + off[0], y2 = s.cy + off[1];
            return (
              <g key={`l-${s.id}`} pointerEvents="none">
                <line x1={s.cx} y1={s.cy} x2={x2 - (off[2] === 'start' ? 600 : -600)} y2={y2 - 1200} stroke="#07333a" strokeWidth={0.9 * K} />
                <circle cx={s.cx} cy={s.cy} r={1.5 * K} fill="#07333a" />
                <T x={x2} y={y2} anchor={off[2]} weight={800} size={10.5 * K} fill="#07333a">{`${s.id} ${v >= 10 ? Math.round(v) + '%' : fmt(v)}`}</T>
              </g>
            );
          }
          return (
            <g key={`l-${s.id}`} pointerEvents="none">
              <T x={s.cx} y={s.cy + (tiny ? 3 * K : 0)} anchor="middle" weight={800} size={(tiny ? 9 : 12) * K} fill={col.fg}>{s.id}</T>
              {!tiny && <T x={s.cx} y={s.cy + 12 * K} anchor="middle" size={9.5 * K} fill={col.fg}>{v >= 10 ? Math.round(v) + '%' : fmt(v)}</T>}
            </g>
          );
        })}
      </svg>
      {hs && <div className="tip" style={{ left: 8, top: 4, minWidth: 0 }}><b>{hs.name}</b>{fmt(data[hs.id] ?? 0)} do público</div>}
      <div className="map-scale">Menor <span style={{ display: 'inline-flex', gap: 2 }}>{HEAT.map((h) => <i key={h} style={{ background: h, width: 22, height: 10, display: 'inline-block' }} />)}</span> Maior participação</div>
    </div>
  );
}

/* ------------------------------------------------------------------ ATIVIDADE (dia × hora) */
export function ActivityHeat({ grid, aria }: { grid: number[][]; aria: string }) {
  const [ref, W] = useWidth();
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const L = 40, cw = (W - L - 4) / 24, ch = 24, H = ch * 7 + 24;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={aria} style={{ display: 'block' }}>
        {grid.map((row, d) => (
          <g key={d}>
            <T x={L - 6} y={d * ch + ch / 2 + 4} anchor="end">{dias[d]}</T>
            {row.map((v, h) => <rect key={h} x={L + h * cw} y={d * ch} width={cw - 1.5} height={ch - 1.5} rx={2} fill={heatColor(v / 100).bg}><title>{`${dias[d]} ${String(h).padStart(2, '0')}h — índice ${v}`}</title></rect>)}
          </g>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <T key={h} x={L + h * cw + cw / 2} y={H - 6} anchor="middle" size={11}>{String(h).padStart(2, '0')}h</T>)}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ HEAT TABLE (matriz tema × formato) */
export interface HeatCell { value: number | null; text: string; n: number }
export function HeatTable({ rows, cols, cell, onCell, selected, minN = 1, rowHead = 'Tema', byRow = false }: { rows: { key: string; label: string }[]; cols: { key: string; label: string }[]; cell: (r: string, c: string) => HeatCell; onCell?: (r: string, c: string) => void; selected?: { r: string; c: string } | null; minN?: number; rowHead?: string; byRow?: boolean }) {
  const grid = rows.map((r) => cols.map((c) => cell(r.key, c.key)));
  const vals = grid.flat().filter((c) => c.value !== null && c.n >= minN).map((c) => c.value as number);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (
    <div className="tbl-wrap" style={{ background: 'transparent' }}>
      <table className="heat">
        <thead><tr><th>{rowHead}</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.key}>
              <td className="rowh">{r.label}</td>
              {cols.map((c, ci) => {
                const ce = grid[ri][ci];
                if (ce.value === null || ce.n < minN) return <td key={c.key} className="cell empty" title={ce.n ? `Amostra pequena: ${ce.n} publicação(ões)` : 'Sem publicações'}>—</td>;
                const rv = grid[ri].filter((x) => x.value !== null && x.n >= minN).map((x) => x.value as number);
                const a0 = byRow ? Math.min(...rv) : lo, b0 = byRow ? Math.max(...rv) : hi;
                const col = heatColor(b0 === a0 ? 0.6 : (ce.value - a0) / (b0 - a0));
                const sel = selected?.r === r.key && selected?.c === c.key;
                return <td key={c.key} className={`cell${sel ? ' sel' : ''}`} style={{ background: col.bg, color: col.fg }} onClick={() => onCell?.(r.key, c.key)} title={`${ce.n} publicações — clique para ver o conteúdo`}>{ce.text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legend-scale">{byRow ? 'Cores comparam os formatos dentro de cada rede. ' : ''}Menor <span style={{ display: 'inline-flex', gap: 2 }}>{HEAT.map((h) => <i key={h} style={{ background: h }} />)}</span> Maior · “—” = sem dados ou amostra pequena (n &lt; {minN})</div>
    </div>
  );
}

/* ------------------------------------------------------------------ BENCHMARK (faixa Q1–Q3) */
export function RangeBar({ q1, q3, med, value }: { q1: number; q3: number; med: number; value: number }) {
  const lo = Math.min(q1, value) , hi = Math.max(q3, value);
  const pad = (hi - lo) * 0.15 || 1; const a = lo - pad, b = hi + pad;
  const pos = (v: number) => `${(((v - a) / (b - a)) * 100).toFixed(1)}%`;
  return (
    <div className="range-bar" aria-hidden>
      <div className="band" style={{ left: pos(q1), width: `${(((q3 - q1) / (b - a)) * 100).toFixed(1)}%` }} />
      <div className="med" style={{ left: pos(med) }} />
      <div className="val" style={{ left: pos(value) }} />
    </div>
  );
}
export { SEQ };
