import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Annotation, AnnotationCategory, Dataset, Post, Theme } from '../types';
import { EMPTY_SELECTION, type Selection } from '../domain/aggregate';
import { LAST_DAY, dayOf, isoOf, type Range } from '../domain/dates';
import { load, save } from '../utils/storage';

export type TabId = 'visao' | 'evolucao' | 'conteudos' | 'publico';

export interface AppState {
  sel: Selection;
  range: Range;
  preset: string;
  benchDays: number;
  tab: TabId;
}

interface TaxonomyState {
  renames: Record<string, string>;
  extra: Theme[];
  postTheme: Record<string, string>;
}

interface Ctx {
  ds: Dataset;
  state: AppState;
  setSel: (p: Partial<Selection>) => void;
  setRange: (r: Range, preset: string) => void;
  setBench: (d: number) => void;
  setTab: (t: TabId) => void;
  resetFilters: () => void;
  annotations: Annotation[];
  addAnnotation: (a: { day: number; label: string; category: AnnotationCategory; note?: string }) => void;
  removeAnnotation: (id: string) => void;
  taxonomy: TaxonomyState;
  renameTheme: (id: string, name: string) => void;
  addTheme: (name: string) => void;
  setPostTheme: (postId: string, themeId: string) => void;
  openPost: Post | null;
  setOpenPost: (p: Post | null) => void;
  methodOpen: boolean;
  setMethodOpen: (b: boolean) => void;
}

const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore fora do provider');
  return c;
};

export const PRESETS = [
  { id: '7', label: '7 dias', days: 7 },
  { id: '30', label: '30 dias', days: 30 },
  { id: '90', label: '90 dias', days: 90 },
  { id: '180', label: '180 dias', days: 180 },
  { id: '365', label: '12 meses', days: 365 },
];
const ANN_KEY = 'camara.annotations.v2';
const TAX_KEY = 'camara.taxonomy.v3';

export const presetRange = (days: number): Range => ({ start: Math.max(0, LAST_DAY - days + 1), end: LAST_DAY });

export function StoreProvider({ base, children }: { base: Dataset; children: ReactNode }) {
  const [state, setState] = useState<AppState>({ sel: EMPTY_SELECTION, range: presetRange(90), preset: '90', benchDays: base.meta.benchDays, tab: 'visao' });
  // anotações locais guardam a data ISO: o índice do dia muda quando a janela de 12 meses avança
  const [custom, setCustom] = useState<Annotation[]>(() => load<(Annotation & { iso?: string })[]>(ANN_KEY, []).filter((a) => a.iso).map((a) => ({ ...a, day: dayOf(a.iso as string) })));
  // reclassificações locais de tema, por link da publicação
  const [taxonomy, setTaxonomy] = useState<TaxonomyState>(() => load<TaxonomyState>(TAX_KEY, { renames: {}, extra: [], postTheme: {} }));
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => save(ANN_KEY, custom.map((a) => ({ ...a, iso: isoOf(a.day) }))), [custom]);
  useEffect(() => save(TAX_KEY, taxonomy), [taxonomy]);

  // dataset derivado: aplica renomeações, novos temas e reclassificações da equipe
  const ds = useMemo<Dataset>(() => {
    const themes = [...base.themes.map((t) => ({ ...t, name: taxonomy.renames[t.id] ?? t.name })), ...taxonomy.extra.map((t) => ({ ...t, name: taxonomy.renames[t.id] ?? t.name }))];
    const ids = new Set(themes.map((t) => t.id));
    const posts = Object.keys(taxonomy.postTheme).length
      ? base.posts.map((p) => { const o = taxonomy.postTheme[p.id]; return o && ids.has(o) ? { ...p, themeId: o } : p; })
      : base.posts;
    return { ...base, themes, posts };
  }, [base, taxonomy]);

  const annotations = useMemo<Annotation[]>(() => [...base.annotations, ...custom].sort((a, b) => a.day - b.day), [base, custom]);

  const setSel = useCallback((p: Partial<Selection>) => setState((s) => {
    const sel = { ...s.sel, ...p };
    if (p.platforms) sel.profileIds = sel.profileIds.filter((id) => !sel.platforms.length || sel.platforms.includes(id.split('-')[0] as never));
    return { ...s, sel };
  }), []);
  const ctx: Ctx = {
    ds, state, setSel,
    setRange: (range, preset) => setState((s) => ({ ...s, range, preset })),
    setBench: (benchDays) => setState((s) => ({ ...s, benchDays })),
    setTab: (tab) => { setState((s) => ({ ...s, tab })); window.scrollTo({ top: 0 }); },
    resetFilters: () => setState((s) => ({ ...s, sel: EMPTY_SELECTION })),
    annotations,
    addAnnotation: (a) => setCustom((c) => [...c, { id: `c${Date.now()}`, custom: true, ...a }]),
    removeAnnotation: (id) => setCustom((c) => c.filter((x) => x.id !== id)),
    taxonomy,
    renameTheme: (id, name) => setTaxonomy((t) => ({ ...t, renames: { ...t.renames, [id]: name } })),
    addTheme: (name) => setTaxonomy((t) => ({ ...t, extra: [...t.extra, { id: `tx${t.extra.length + 1}-${Date.now() % 100000}`, name }] })),
    setPostTheme: (postId, themeId) => setTaxonomy((t) => ({ ...t, postTheme: { ...t.postTheme, [postId]: themeId } })),
    openPost, setOpenPost, methodOpen, setMethodOpen,
  };
  return <StoreCtx.Provider value={ctx}>{children}</StoreCtx.Provider>;
}
