import { useEffect, useMemo, useRef, useState } from 'react';
import { filterPosts } from '../domain/aggregate';
import { dayOf, fmtDMY } from '../domain/dates';
import { bucketIndexOfDay, type Bucket, type Granularity } from '../domain/series';
import { noteKey, parsePeakKey, peakKey } from '../data/notes';
import { useStore } from '../state/store';
import type { Post } from '../types';
import { NoteEditor } from './NoteEditor';
import { PostDetail } from './Layout';
import { Empty, PlatformBadge, Segmented, Select } from './ui/ui';

const fmtPeriod = (start: number, end: number) => (start === end ? fmtDMY(start) : `${fmtDMY(start)} a ${fmtDMY(end)}`);

interface Props {
  buckets: Bucket[];
  gran: Granularity;
  selIdx: number | null;
  onSelect: (i: number | null) => void;
  /** índices de `buckets` com pico detectado nas métricas exibidas */
  peaks: Set<number>;
  /** publicação aberta dentro do painel (null = lista de anotações) */
  postId: string | null;
  onOpenPost: (id: string | null) => void;
}

/** Painel "Anotações editoriais": anotações de picos (períodos) e de publicações, em separado. */
export function EditorialNotes({ buckets, gran, selIdx, onSelect, peaks, postId, onOpenPost }: Props) {
  const { ds, state, notes, notesStatus } = useStore();
  const { sel, range } = state;
  const [kind, setKind] = useState<'picos' | 'posts'>('picos');
  const [search, setSearch] = useState('');
  const top = useRef<HTMLDivElement>(null);

  const posts = useMemo(() => filterPosts(ds, sel, range.start, range.end), [ds, sel, range]);
  const postNotes = useMemo(() => posts.filter((p) => notes.has(noteKey(p.url))).sort((a, b) => a.day - b.day), [posts, notes]);
  const peakNotes = useMemo(() => [...notes.keys()]
    .flatMap((key) => {
      const p = parsePeakKey(key);
      return p ? [{ key, start: dayOf(p.start), end: dayOf(p.end) }] : [];
    })
    .filter((n) => n.start <= range.end && n.end >= range.start)
    .sort((a, b) => a.start - b.start), [notes, range]);

  const bucket = selIdx !== null ? buckets[selIdx] ?? null : null;
  const bucketKey = bucket ? peakKey(bucket.start, gran) : null;
  const opened = postId ? ds.posts.find((p) => p.id === postId) ?? null : null;
  // quem clicou pode estar bem abaixo, na lista do período: traz o painel para a tela
  useEffect(() => { if (postId) top.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [postId]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? posts.filter((p) => p.caption.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)).slice(0, 6) : [];
  }, [posts, search]);

  const postHead = (p: Post) => (
    <>
      <span className="flex between"><PlatformBadge id={p.platform} /><span className="small muted">{fmtDMY(p.day)}</span></span>
      <span className="t">{p.title}</span>
    </>
  );

  if (opened) {
    return (
      <div ref={top} style={{ scrollMarginTop: 16 }}>
        <div className="flex between" style={{ marginBottom: 8 }}>
          <button className="btn sm" onClick={() => onOpenPost(null)} aria-label="Voltar às anotações">← Anotações</button>
          <PlatformBadge id={opened.platform} />
        </div>
        <PostDetail key={opened.id} post={opened} onChange={(p) => onOpenPost(p.id)} />
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 10 }}>
      <Segmented value={kind} label="Tipo de anotação" onChange={setKind}
        options={[{ id: 'picos', label: `Picos (${peakNotes.length})` }, { id: 'posts', label: `Publicações (${postNotes.length})` }]} />

      {kind === 'picos' ? (
        <>
          <div className="flex">
            <Select label="Período a anotar" value={selIdx ?? -1} onChange={(i) => onSelect(i < 0 ? null : i)}
              options={[{ id: -1, label: 'Escolha o período…' }, ...buckets.map((b, i) => ({ id: i, label: `${b.label}${peaks.has(i) ? ' · pico' : ''}` }))]} />
          </div>
          {bucket && bucketKey && (
            <div className="post-item">
              <span className="t">{bucket.label}</span>
              <NoteEditor key={bucketKey} link={bucketKey} />
            </div>
          )}
          <div className="grid" style={{ gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {peakNotes.filter((n) => n.key !== bucketKey).map((n) => (
              <div key={n.key} className="post-item">
                <span className="flex between"><span className="annot">Pico</span><span className="small muted">{fmtPeriod(n.start, n.end)}</span></span>
                <NoteEditor link={n.key} />
                <span className="flex"><button className="btn sm" onClick={() => onSelect(bucketIndexOfDay(buckets, Math.max(n.start, range.start)))}>Ver no gráfico</button></span>
              </div>
            ))}
          </div>
          {!peakNotes.length && !bucket && <Empty>Sem anotações de picos no período.</Empty>}
        </>
      ) : (
        <>
          <input className="inp" placeholder="Buscar publicação para anotar (texto ou link)" aria-label="Buscar publicação para anotar" value={search} onChange={(e) => setSearch(e.target.value)} />
          {matches.map((p) => (
            <button key={p.id} className="post-item" style={{ textAlign: 'left' }} onClick={() => onOpenPost(p.id)}>{postHead(p)}</button>
          ))}
          {search.trim() && !matches.length && <Empty>Nenhuma publicação encontrada no período e filtros ativos.</Empty>}
          <div className="grid" style={{ gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {postNotes.map((p) => (
              <div key={p.id} className="post-item">
                {postHead(p)}
                <NoteEditor link={p.url} />
                <span className="flex"><button className="btn sm" onClick={() => onOpenPost(p.id)}>Abrir publicação</button><button className="btn sm" onClick={() => onSelect(bucketIndexOfDay(buckets, p.day))}>Ver no gráfico</button></span>
              </div>
            ))}
          </div>
          {!postNotes.length && <Empty>Sem anotações de publicações no período.</Empty>}
        </>
      )}

      {notesStatus === 'reserva' && <p className="small muted">Serviço de anotações indisponível: exibindo a última cópia publicada.</p>}
    </div>
  );
}
