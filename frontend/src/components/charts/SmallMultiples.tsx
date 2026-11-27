import { useRef, useState } from 'react';
import { useIsMobile } from '../../utils/device';
import { useWidth, type LineMarker } from './charts';

export interface MultipleRow {
  id: string;
  label: string;
  color: string;
  dash?: string;
  values: (number | null)[];
  fmt: (v: number) => string;
  peaks?: number[];
  /** eixo parte do zero */
  zero?: boolean;
}

const FONT = 'DM Sans, Arial, sans-serif';

/**
 * Um quadro por métrica, cada um com a própria escala e o mesmo eixo de tempo.
 * Períodos sem dado (n/d) são hachurados: a linha não é ligada por cima da lacuna.
 */
export function SmallMultiples({ labels, rows, markers = [], selected, onSelect, aria }: { labels: string[]; rows: MultipleRow[]; markers?: LineMarker[]; selected?: number | null; onSelect?: (i: number) => void; aria: string }) {
  const [ref, W] = useWidth();
  const mobile = useIsMobile();
  const [hover, setHover] = useState<number | null>(null);
  const hatch = useRef(`hatch-${Math.random().toString(36).slice(2, 8)}`).current;
  const L = mobile ? 52 : 70, R = 14, PLOT = mobile ? 104 : 118, HEAD = 24, GAP = 12, AXIS = 34;
  const n = labels.length;
  const block = PLOT + HEAD + GAP;
  const H = rows.length * block + AXIS;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (n - 1));
  const slot = n <= 1 ? 40 : (W - L - R) / (n - 1);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 78))));
  const idxFromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round((((clientX - r.left) * (W / (r.width || W)) - L) / (W - L - R)) * (n - 1))));
  };
  const active = hover ?? selected ?? null;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={aria} tabIndex={onSelect ? 0 : undefined}
        onMouseMove={(e) => setHover(idxFromX(e.clientX))} onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect?.(idxFromX(e.clientX))}
        onKeyDown={(e) => {
          if (!onSelect) return;
          const cur = selected ?? hover ?? 0;
          if (e.key === 'ArrowRight') { onSelect(Math.min(n - 1, cur + 1)); e.preventDefault(); }
          if (e.key === 'ArrowLeft') { onSelect(Math.max(0, cur - 1)); e.preventDefault(); }
        }}
        style={{ display: 'block', overflow: 'visible', cursor: onSelect ? 'pointer' : 'default', fontFamily: FONT }}>
        <defs>
          <pattern id={hatch} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#eef4f5" /><line x1="0" y1="0" x2="0" y2="7" stroke="#b5c9cc" strokeWidth="2.4" />
          </pattern>
        </defs>
        {rows.map((row, ri) => {
          const top = ri * block + HEAD, bottom = top + PLOT;
          const xs = row.values.filter((v): v is number => v !== null);
          let mn = xs.length ? Math.min(...xs) : 0, mx = xs.length ? Math.max(...xs) : 1;
          if (row.zero) mn = Math.min(0, mn);
          if (mx === mn) mx = mn + 1;
          const pad = (mx - mn) * 0.08;
          const fromZero = !!row.zero && mn === 0;
          const lo = fromZero ? 0 : mn - pad, hi = mx + pad;
          const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * PLOT;
          let d = '', pen = false;
          row.values.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
          const gaps: [number, number][] = [];
          let start = -1;
          row.values.forEach((v, i) => {
            if (v === null && start < 0) start = i;
            if ((v !== null || i === row.values.length - 1) && start >= 0) { gaps.push([start, v === null ? i : i - 1]); start = -1; }
          });
          const ticks = [hi - pad, (hi + lo) / 2, lo + (fromZero ? 0 : pad)];
          return (
            <g key={row.id}>
              <rect x={L - 14} y={top - 21} width={10} height={10} rx={2} fill={row.color} />
              <text x={L} y={top - 9} fontSize={12.5} fontWeight={800} fill="#07333a">{row.label}</text>
              <rect x={L} y={top} width={W - L - R} height={PLOT} fill="#fff" stroke="#dbe7e8" />
              {gaps.map(([a, b]) => {
                const x0 = Math.max(L, x(a) - slot / 2), x1 = Math.min(W - R, x(b) + slot / 2);
                return (
                  <g key={`g-${a}`}>
                    <rect x={x0} y={top} width={x1 - x0} height={PLOT} fill={`url(#${hatch})`}><title>{`Sem dados: ${labels[a]}${b > a ? ` a ${labels[b]}` : ''}`}</title></rect>
                    {x1 - x0 > 54 && <text x={(x0 + x1) / 2} y={top + PLOT / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#5b7a80">sem dados</text>}
                  </g>
                );
              })}
              {ticks.map((t, i) => (
                <g key={i}>
                  <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#d5e3e5" strokeDasharray="3 4" />
                  {i !== 1 && <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#4f6b70">{row.fmt(t)}</text>}
                </g>
              ))}
              {markers.map((m) => <line key={`m-${m.index}-${m.label}`} x1={x(m.index)} x2={x(m.index)} y1={top} y2={bottom} stroke="#7a56d6" strokeOpacity={0.3} strokeDasharray="2 3" />)}
              {xs.length > 0 && <path d={d} fill="none" stroke={row.color} strokeWidth={2.3} strokeDasharray={row.dash} strokeLinejoin="round" strokeLinecap="round" />}
              {row.values.map((v, i) => (v !== null && (n <= 40 || ((row.values[i - 1] ?? null) === null && (row.values[i + 1] ?? null) === null))
                ? <circle key={i} cx={x(i)} cy={y(v)} r={2.8} fill={row.color} stroke="#fff" strokeWidth={1} /> : null))}
              {(row.peaks ?? []).map((i) => { const v = row.values[i]; return v === null || v === undefined ? null : <circle key={`pk-${i}`} cx={x(i)} cy={y(v)} r={6.5} fill="#f5a623" stroke="#07333a" strokeWidth={2} />; })}
              {active !== null && <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#07333a" strokeWidth={hover === null ? 1.6 : 1} />}
              {active !== null && row.values[active] != null && <circle cx={x(active)} cy={y(row.values[active] as number)} r={5.5} fill="#36c7a6" stroke="#07333a" strokeWidth={2} />}
            </g>
          );
        })}
        {labels.map((lb, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize={12} fill="#4f6b70">{lb}</text> : null))}
        {markers.map((m) => <path key={`d-${m.index}-${m.label}`} d={`M${x(m.index)},${H - AXIS + 2} l5,5 l-5,5 l-5,-5 z`} fill="#7a56d6"><title>{m.label}</title></path>)}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hover) + 12, 8), W - 210), top: 4 }}>
          <b>{labels[hover]}</b>
          {rows.map((r) => <div className="row" key={r.id}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: r.color, marginRight: 6 }} />{r.label}</span><span>{r.values[hover] == null ? 'n/d' : r.fmt(r.values[hover] as number)}</span></div>)}
          {markers.filter((m) => m.index === hover).map((m) => <div key={m.label} style={{ marginTop: 4, color: '#d8c8ff' }}>◆ {m.label}</div>)}
        </div>
      )}
    </div>
  );
}
