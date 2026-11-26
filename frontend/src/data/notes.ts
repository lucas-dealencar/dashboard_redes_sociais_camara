import type { PostNote } from '../types';

/**
 * Anotações por publicação (uma por post), gravadas numa planilha pela API do Apps Script
 * (apps_script/anotacoes.gs). A URL é pública; gravar exige a senha da equipe, conferida no script.
 */
const API = 'https://script.google.com/macros/s/AKfycbzFKF8sgg2cnd-Jo7lau71N11dBbpWS0FDer-jrbTBV-fmOOO5ibQAxMK64gui1UEeG/exec';
const TIMEOUT_MS = 30000;
export const MAX_NOTE = 2000;

/** Mesmas regras de `_chave_link` (pipeline) e `normalizarLink` (Apps Script): mantenha as três iguais. */
export function noteKey(link: string): string {
  let s = link.trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.)?/, '');
  s = s.replace(/^(twitter\.com|mobile\.twitter\.com)\//, 'x.com/');
  s = s.replace(/^threads\.net\//, 'threads.com/');
  s = s.includes('watch?v=') ? s.replace(/&.*$/, '') : s.replace(/[?#].*$/, '');
  return s.replace(/\/+$/, '');
}

/** O script só aceita URL de post ou o código numérico de Stories. */
export const canAnnotate = (link: string) => link.length <= 500 && /^(https?:\/\/\S+|\d{15,20})$/i.test(link.trim());

interface RawNote { post_link: string; anotacao: string; versao: number; atualizado_em: string }

export function parseNotes(raw: unknown): PostNote[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<RawNote>[])
    .filter((r) => r && typeof r.post_link === 'string' && typeof r.anotacao === 'string' && r.post_link && r.anotacao)
    .map((r) => ({ key: noteKey(r.post_link!), text: r.anotacao!, version: Number(r.versao) || 0, updatedAt: String(r.atualizado_em ?? '') }));
}

interface Reply { ok: boolean; erro?: string; mensagem?: string; anotacoes?: unknown; anotacao?: unknown; atual?: unknown }

async function call(url: string, init?: RequestInit): Promise<Reply> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Reply;
  } finally {
    clearTimeout(timer);
  }
}

export async function listNotes(): Promise<PostNote[]> {
  const r = await call(`${API}?acao=listar&t=${Date.now()}`);
  if (!r.ok) throw new Error(r.mensagem ?? 'Falha ao ler as anotações.');
  return parseNotes(r.anotacoes);
}

export type WriteResult =
  | { ok: true; note: PostNote | null }
  | { ok: false; error: 'conflito'; message: string; current: PostNote | null }
  | { ok: false; error: string; message: string };

export interface WriteRequest {
  action: 'salvar' | 'excluir';
  link: string;
  version: number; // versão que o usuário viu (0 = sem anotação)
  text?: string;
  password: string;
}

export async function writeNote(req: WriteRequest): Promise<WriteResult> {
  let r: Reply;
  try {
    // text/plain evita o preflight de CORS, que o Apps Script não responde
    r = await call(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ acao: req.action, senha: req.password, post_link: req.link, anotacao: req.text, versao: req.version }),
    });
  } catch {
    return { ok: false, error: 'rede', message: 'Sem resposta do serviço de anotações. Seu texto continua aqui; tente de novo.' };
  }
  if (r.ok) return { ok: true, note: parseNotes(r.anotacao ? [r.anotacao] : [])[0] ?? null };
  const message = r.mensagem ?? 'Não foi possível gravar.';
  if (r.erro === 'conflito') return { ok: false, error: 'conflito', message, current: parseNotes(r.atual ? [r.atual] : [])[0] ?? null };
  return { ok: false, error: r.erro ?? 'interno', message };
}
