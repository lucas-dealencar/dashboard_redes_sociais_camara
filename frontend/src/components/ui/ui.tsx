import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PLATFORM_BY_ID } from '../../data/catalog';
import type { PlatformId } from '../../types';
import { downloadCsv, downloadXlsx, type Table } from '../../utils/export';
import { PLATFORM_LOGO } from '../../data/logos';
import { Info } from './Info';

export function Section({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id}>
      <div className="sec-h">
        <h2>{title}</h2>
        {sub && <Info>{sub}</Info>}
      </div>
      {children}
    </section>
  );
}

export function Panel({ title, sub, tools, children, light, id }: { title?: ReactNode; sub?: ReactNode; tools?: ReactNode; children: ReactNode; light?: boolean; id?: string }) {
  return (
    <article className={`panel${light ? ' light' : ''}`} id={id}>
      {(title || sub || tools) && (
        <div className="p-head">
          <div>
            <h3>{title}{sub && <Info>{sub}</Info>}</h3>
          </div>
          {tools && <div className="p-tools">{tools}</div>}
        </div>
      )}
      {children}
    </article>
  );
}

export const Well = ({ children }: { children: ReactNode }) => <div className="well">{children}</div>;
export const Note = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <div className={`notice${warn ? ' warn' : ''}`}>{children}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Select<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <select className="inp" aria-label={label} value={String(value)} onChange={(e) => {
      const o = options.find((x) => String(x.id) === e.target.value);
      if (o) onChange(o.id);
    }}>
      {options.map((o) => <option key={String(o.id)} value={String(o.id)}>{o.label}</option>)}
    </select>
  );
}

export function MultiSelect({ label, options, value, onChange, allLabel = 'Todos' }: { label: string; options: { id: string; label: string; group?: string }[]; value: string[]; onChange: (v: string[]) => void; allLabel?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const text = value.length === 0 ? allLabel : value.length === 1 ? options.find((o) => o.id === value[0])?.label ?? '1 selecionado' : `${value.length} selecionados`;
  let lastGroup: string | undefined;
  return (
    <div className="pop" ref={ref}>
      <button className="inp pop-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <span>{text}</span><span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="pop-panel" role="listbox" aria-label={label}>
          <label><input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} /> <b>{allLabel}</b></label>
          {options.map((o) => {
            const head = o.group && o.group !== lastGroup ? <div className="grp" key={`g-${o.group}`}>{o.group}</div> : null;
            lastGroup = o.group;
            return (
              <span key={o.id}>
                {head}
                <label><input type="checkbox" checked={value.includes(o.id)} onChange={() => onChange(value.includes(o.id) ? value.filter((v) => v !== o.id) : [...value, o.id])} /> {o.label}</label>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PlatformDot({ id }: { id: PlatformId }) {
  return <span className="dot" style={{ background: PLATFORM_BY_ID[id].color }} aria-hidden />;
}
export function PlatformLogo({ id, size = 18 }: { id: PlatformId; size?: number }) {
  return <img className="plogo" src={PLATFORM_LOGO[id]} alt="" width={size} height={size} aria-hidden draggable={false} />;
}
export const PlatformBadge = ({ id }: { id: PlatformId }) => <span className="badge"><PlatformLogo id={id} />{PLATFORM_BY_ID[id].name}</span>;

export function ExportButtons({ table }: { table: () => Table }) {
  return (
    <>
      <button className="btn sm" onClick={() => downloadCsv(table())} title="Baixar tabela em CSV">CSV</button>
      <button className="btn sm" onClick={() => downloadXlsx(table())} title="Baixar tabela em XLSX">XLSX</button>
    </>
  );
}

export interface Col<T> {
  id: string;
  label: string;
  num?: boolean;
  render: (r: T) => ReactNode;
  sort?: (r: T) => number | string | null;
  csv?: (r: T) => string | number | null;
}

export function DataTable<T>({ rows, cols, rowKey, onRowClick, pageSize, defaultSort, sortDesc = true, exportName }: { rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; pageSize?: number; defaultSort?: string; sortDesc?: boolean; exportName?: string }) {
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(defaultSort ? { id: defaultSort, desc: sortDesc } : null);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows.length]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.id === sort.id);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const r = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'pt-BR') : x - y;
      return sort.desc ? -r : r;
    });
  }, [rows, sort, cols]);
  const shown = pageSize ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;
  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  void exportName;
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.id} className={`${c.num ? 'num ' : ''}${c.sort ? 'sortable' : ''}`} aria-sort={sort?.id === c.id ? (sort.desc ? 'descending' : 'ascending') : undefined}
                  onClick={c.sort ? () => setSort((s) => (s?.id === c.id ? { id: c.id, desc: !s.desc } : { id: c.id, desc: true })) : undefined}>
                  {c.label}{sort?.id === c.id ? (sort.desc ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)} className={onRowClick ? 'click' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {cols.map((c) => <td key={c.id} className={c.num ? 'num' : ''}>{c.render(r)}</td>)}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={cols.length}><Empty>Nenhum registro para os filtros selecionados.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
      {pageSize && sorted.length > pageSize && (
        <div className="pager">
          <span>{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} de {sorted.length}</span>
          <span className="flex">
            <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Anterior</button>
            <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima →</button>
          </span>
        </div>
      )}
    </>
  );
}

export function Modal({ onClose, children, side, label }: { onClose: () => void; children: ReactNode; side?: boolean; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className={`scrim${side ? '' : ' center'}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={side ? 'drawer' : 'modal'} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}
