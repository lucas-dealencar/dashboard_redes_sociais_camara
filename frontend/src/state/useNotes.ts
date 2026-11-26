import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listNotes, noteKey, writeNote, type WriteRequest, type WriteResult } from '../data/notes';
import type { PostNote } from '../types';

const REFRESH_MS = 45000;

/** `reserva` = a API não respondeu: mostra a cópia publicada pelo pipeline, sem permitir edição. */
export type NotesStatus = 'carregando' | 'online' | 'reserva';

export function useNotes(backup: PostNote[]) {
  const [list, setList] = useState<PostNote[]>(backup);
  const [status, setStatus] = useState<NotesStatus>('carregando');
  // uma leitura iniciada antes de uma gravação traz dados velhos e não pode sobrescrever a tela
  const writes = useRef(0);

  const refresh = useCallback(async () => {
    const seen = writes.current;
    try {
      const fresh = await listNotes();
      if (seen === writes.current) setList(fresh);
      setStatus('online');
    } catch (e) {
      console.warn('Anotações indisponíveis:', e);
      setStatus('reserva');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(onVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const write = useCallback(async (req: WriteRequest): Promise<WriteResult> => {
    const result = await writeNote(req);
    const apply = (note: PostNote | null) => {
      writes.current += 1;
      const key = noteKey(req.link);
      setList((l) => [...l.filter((n) => n.key !== key), ...(note ? [note] : [])]);
    };
    if (result.ok) apply(result.note);
    else if ('current' in result) apply(result.current);
    return result;
  }, []);

  const notes = useMemo(() => new Map(list.map((n) => [n.key, n])), [list]);
  return { notes, notesStatus: status, writeNote: write };
}
