import type { CountMetric, FormatId, NetworkCoverage, NetworkKpi, PlatformId } from '../types';

export type KpiKind = 'reach' | 'views' | 'impressions' | 'engagement';
export type AvailKey = CountMetric | 'engagement' | 'er';

export interface PlatformInfo {
  id: PlatformId;
  /** nome da rede como vem do pipeline (coluna `rede`) */
  name: string;
  short: string;
  color: string;
  dash?: string;
  /** KPI principal usado (benchmark.json › kpi_por_rede.kpi_usado) */
  kpi: KpiKind;
  kpiLabel: string;
  /** KPI proposto na proposta (pode diferir do usado quando a planilha não traz a coluna) */
  kpiProposed: string | null;
  /** true quando a rede usa o KPI definido (engajamento), sem substituto */
  kpiValidated: boolean;
  kpiNote: string | null;
  support: string;
  /** métrica existe na fonte para a rede (status disponível ou parcial na cobertura do pipeline) */
  available: Record<AvailKey, boolean>;
  hasFollowers: boolean;
  hasNewFollowers: boolean;
  hasLost: boolean;
  hasWatch: boolean;
  formats: FormatId[];
}

/** Aparência fixa por rede; o resto vem dos dados. */
const STYLE: Record<PlatformId, { name: string; short: string; color: string; dash?: string; support: string }> = {
  instagram: { name: 'Instagram', short: 'IG', color: '#C13584', support: 'Alcance, curtidas, comentários, compartilhamentos, salvamentos' },
  facebook: { name: 'Facebook', short: 'FB', color: '#1877F2', dash: '6 3', support: 'Alcance, reações, comentários, compartilhamentos' },
  tiktok: { name: 'TikTok', short: 'TT', color: '#8A4FFF', support: 'Alcance, curtidas, comentários, compartilhamentos' },
  x: { name: 'X', short: 'X', color: '#101010', dash: '2 3', support: 'Alcance, curtidas, respostas, republicações, cliques no link' },
  threads: { name: 'Threads', short: 'TH', color: '#6B7280', dash: '8 3 2 3', support: 'Alcance, curtidas, respostas, republicações, cliques' },
  bluesky: { name: 'Bluesky', short: 'BS', color: '#1185FE', dash: '1 3', support: 'Curtidas, respostas, republicações' },
  linkedin: { name: 'LinkedIn', short: 'LI', color: '#0B3C8C', dash: '10 3', support: 'Alcance e interações (cobertura parcial)' },
  youtube: { name: 'YouTube', short: 'YT', color: '#FF0000', dash: '12 3 2 3', support: 'Alcance, impressões (parcial), gostei, comentários' },
  youtube_shorts: { name: 'YouTube Shorts', short: 'YS', color: '#B3001B', dash: '4 2', support: 'Alcance, impressões (parcial), gostei, comentários' },
  kwai: { name: 'Kwai', short: 'KW', color: '#FF7A00', dash: '3 3', support: 'Alcance e interações' },
  pinterest: { name: 'Pinterest', short: 'PI', color: '#9B1C31', dash: '9 2', support: 'Alcance, salvamentos e cliques' },
};

/** Nome da rede no pipeline → id interno. */
export const PLATFORM_ID_BY_NAME: Record<string, PlatformId> = Object.fromEntries(
  (Object.keys(STYLE) as PlatformId[]).map((id) => [STYLE[id].name, id]),
);

const KPI_FROM_PIPELINE: Record<string, KpiKind> = { alcance: 'reach', visualizacoes: 'views', impressoes: 'impressions', engajamento: 'engagement' };
const KPI_LABEL: Record<KpiKind, string> = { reach: 'Alcance', views: 'Visualizações', impressions: 'Impressões', engagement: 'Engajamento' };
const AVAIL_FROM_PIPELINE: Record<AvailKey, string> = {
  reach: 'alcance', views: 'visualizacoes', impressions: 'impressoes', likes: 'curtidas', comments: 'comentarios', shares: 'compartilhamentos',
  saves: 'salvos', clicks: 'cliques_link', engagement: 'engajamento', er: 'taxa_engajamento',
};

/** Preenchidos por `configurePlatforms` (mutados no lugar para manter as referências importadas). */
export const PLATFORMS: PlatformInfo[] = [];
export const PLATFORM_BY_ID = {} as Record<PlatformId, PlatformInfo>;
export const PLATFORM_IDS: PlatformId[] = [];

export function configurePlatforms(
  order: PlatformId[],
  coverage: Record<string, NetworkCoverage>,
  kpis: Record<string, NetworkKpi>,
  formatsByPlatform: Record<string, Set<FormatId>>,
) {
  PLATFORMS.length = 0;
  PLATFORM_IDS.length = 0;
  for (const k of Object.keys(PLATFORM_BY_ID)) delete (PLATFORM_BY_ID as Record<string, unknown>)[k];
  for (const id of order) {
    const st = STYLE[id];
    const cov = coverage[st.name]?.metricas ?? {};
    const has = (m: string) => !!cov[m] && cov[m].status !== 'indisponível';
    const full = (m: string) => cov[m]?.status === 'disponível';
    const available = Object.fromEntries((Object.keys(AVAIL_FROM_PIPELINE) as AvailKey[]).map((k) => [k, has(AVAIL_FROM_PIPELINE[k])])) as Record<AvailKey, boolean>;
    const k = kpis[st.name];
    const kpi: KpiKind = (k?.kpi_usado && KPI_FROM_PIPELINE[k.kpi_usado]) || (available.reach ? 'reach' : 'engagement');
    const info: PlatformInfo = {
      id, name: st.name, short: st.short, color: st.color, dash: st.dash, support: st.support,
      kpi, kpiLabel: KPI_LABEL[kpi], kpiProposed: k?.kpi_proposto ?? null,
      kpiValidated: !k?.substituto,
      kpiNote: k?.motivo ?? null,
      available,
      // seguidores só contam como disponíveis com cobertura plena (hoje a planilha traz a coluna quase vazia)
      hasFollowers: full('seguidores'), hasNewFollowers: full('seguidores_novos'), hasLost: false, hasWatch: false,
      formats: FORMATS.map((f) => f.id).filter((f) => formatsByPlatform[st.name]?.has(f)),
    };
    PLATFORMS.push(info);
    PLATFORM_IDS.push(id);
    PLATFORM_BY_ID[id] = info;
  }
}

export const FORMATS: { id: FormatId; name: string; video: boolean }[] = [
  { id: 'video_curto', name: 'Vídeo curto / Reels', video: true },
  { id: 'video_longo', name: 'Vídeo longo', video: true },
  { id: 'video', name: 'Vídeo (duração n/d)', video: true },
  { id: 'carrossel', name: 'Carrossel', video: false },
  { id: 'imagem', name: 'Imagem', video: false },
  { id: 'texto', name: 'Texto', video: false },
  { id: 'link', name: 'Link', video: false },
  { id: 'stories', name: 'Stories', video: false },
  { id: 'live', name: 'Live', video: true },
  { id: 'outros', name: 'Outros', video: false },
  { id: 'nao_informado', name: 'Não informado', video: false },
];
export const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f])) as Record<FormatId, (typeof FORMATS)[number]>;

/** Formato padronizado do pipeline → id interno. */
export const FORMAT_ID_BY_NAME: Record<string, FormatId> = {
  'Vídeo curto/Reels': 'video_curto', 'Vídeo longo': 'video_longo', 'Vídeo': 'video', 'Carrossel': 'carrossel', 'Imagem': 'imagem',
  'Texto': 'texto', 'Link': 'link', 'Stories': 'stories', 'Live': 'live', 'Outros': 'outros', 'Não informado': 'nao_informado',
};

export const NO_THEME = 'Sem tema';
