import { useState } from 'react';
import { canAnnotate, MAX_NOTE, noteKey } from '../data/notes';
import { useStore } from '../state/store';
import { Note } from './ui/ui';

const PASS_KEY = 'camara.notes.senha'; // sessionStorage: some ao fechar a aba
const readPass = () => { try { return sessionStorage.getItem(PASS_KEY) ?? ''; } catch { return ''; } };
const keepPass = (v: string) => { try { if (v) sessionStorage.setItem(PASS_KEY, v); else sessionStorage.removeItem(PASS_KEY); } catch { /* sem armazenamento: pede de novo */ } };

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

/** Anotação única de uma publicação ou de um pico (`link`). Use `key` para não levar o rascunho a outro alvo. */
export function NoteEditor({ link, title }: { link: string; title?: string }) {
  const { notes, notesStatus, writeNote } = useStore();
  const note = notes.get(noteKey(link)) ?? null;
  const version = note?.version ?? 0;
  // rascunho guarda a versão em que a edição começou: a atualização automática não pode mascarar um conflito
  const [draft, setDraft] = useState<{ text: string; base: number } | null>(null);
  const [password, setPassword] = useState(readPass);
  const [askPass, setAskPass] = useState(() => !readPass());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = notesStatus === 'online' && canAnnotate(link);
  const editing = draft !== null;
  const outdated = editing && draft.base !== version;

  // a senha pode ter sido digitada em outro editor da mesma tela: relê ao abrir
  const syncPass = () => { const saved = readPass(); if (saved) setPassword(saved); setAskPass(!saved); setError(null); };

  const send = async (action: 'salvar' | 'excluir') => {
    setBusy(true);
    setError(null);
    const r = await writeNote({ action, link, password, text: draft?.text.trim(), version: action === 'salvar' && draft ? draft.base : version });
    setBusy(false);
    if (r.ok) {
      keepPass(password);
      setAskPass(false);
      setDraft(null);
      setConfirmDelete(false);
      return;
    }
    if (r.error === 'nao_autorizado') { keepPass(''); setAskPass(true); }
    setConfirmDelete(false);
    setError(r.message);
  };

  const passField = askPass && (
    <label className="small">Senha da equipe{' '}
      <input className="inp" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
    </label>
  );

  return (
    <section aria-label="Anotação">
      {title && <h4 style={{ margin: '16px 0 6px' }}>{title}</h4>}
      {note ? (
        <>
          {editing && <p className="small muted" style={{ margin: '0 0 2px' }}>Texto salvo atualmente:</p>}
          <p style={{ whiteSpace: 'pre-line', margin: '0 0 4px' }}>{note.text}</p>
          <p className="small muted" style={{ margin: '0 0 8px' }}>Atualizada em {fmtWhen(note.updatedAt)}</p>
        </>
      ) : !editing && <p className="small muted">Sem anotação.</p>}

      {notesStatus === 'carregando' && <p className="small muted">Carregando anotações…</p>}
      {notesStatus === 'reserva' && <Note warn>Serviço de anotações indisponível: exibindo a última cópia publicada, somente leitura.</Note>}
      {!canAnnotate(link) && <p className="small muted">Esta publicação não tem um link válido na planilha e não aceita anotação.</p>}

      {editable && !editing && (
        <div className="grid" style={{ gap: 8 }}>
          {confirmDelete ? (
            <>
              {passField}
              <div className="flex">
                <button className="btn sm primary" disabled={busy || !password} onClick={() => void send('excluir')}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button>
                <button className="btn sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <div className="flex">
              <button className="btn sm" onClick={() => { syncPass(); setDraft({ text: note?.text ?? '', base: version }); }}>{note ? 'Editar' : 'Adicionar anotação'}</button>
              {note && <button className="btn sm" onClick={() => { syncPass(); setConfirmDelete(true); }}>Excluir</button>}
            </div>
          )}
        </div>
      )}

      {editing && (
        <form className="grid" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (draft.text.trim() && password && !outdated) void send('salvar'); }}>
          <textarea className="inp" rows={5} maxLength={MAX_NOTE} aria-label="Texto da anotação" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <span className="small muted">{draft.text.length}/{MAX_NOTE} · visível a qualquer visitante do dashboard; não inclua dados pessoais.</span>
          {outdated && (
            <Note warn>Outra pessoa {note ? 'alterou' : 'excluiu'} esta anotação enquanto você editava. Compare com o seu texto antes de continuar.{' '}
              <button type="button" className="btn sm" onClick={() => { setError(null); setDraft({ ...draft, base: version }); }}>Manter o meu texto</button>
            </Note>
          )}
          {passField}
          <div className="flex">
            <button className="btn sm primary" type="submit" disabled={busy || outdated || !draft.text.trim() || !password}>{busy ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn sm" type="button" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      {error && <Note warn>{error}</Note>}
    </section>
  );
}
