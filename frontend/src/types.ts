export type PlatformId =
  | 'instagram' | 'facebook' | 'tiktok' | 'x' | 'threads' | 'bluesky' | 'linkedin'
  | 'youtube' | 'youtube_shorts' | 'kwai' | 'pinterest';

export type FormatId =
  | 'video_curto'
  | 'video_longo'
  | 'carrossel'
  | 'imagem'
  | 'texto'
  | 'link'
  | 'stories'
  | 'video' // vídeo sem duração na fonte (não dá para separar curto de longo)
  | 'outros'
  | 'nao_informado'
  | 'live';

/** Métricas por publicação / por dia que podem existir (ou não) conforme a rede. */
export type CountMetric =
  | 'reach'
  | 'views'
  | 'impressions'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'clicks';

export interface Profile {
  id: string;
  platform: PlatformId;
  name: string;
}

export interface PostMetrics {
  reach: number | null;
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** engajamento básico calculado pelo pipeline; null = incompleto (ex.: Stories sem curtidas) */
  engagement: number | null;
  /** taxa de engajamento (%) calculada pelo pipeline e o denominador usado */
  er: number | null;
  erBase: 'reach' | 'views' | 'impressions' | null;
  saves: number | null;
  clicks: number | null;
  avgWatchSec: number | null;
  retention: number | null; // 0..1
  completion: number | null; // 0..1
}

export interface Post {
  id: string;
  platform: PlatformId;
  profileId: string;
  day: number; // índice do dia (0 = primeiro dia da base)
  hour: number | null; // a planilha não traz a hora
  date: string; // AAAA-MM-DD
  title: string;
  caption: string;
  url: string;
  format: FormatId;
  themeId: string;
  secondaryThemeIds: string[];
  campaign: string | null;
  paid: boolean;
  durationSec: number | null;
  editorialId: string;
  /** campos de classificação da planilha (null = não informado) */
  classification: string | null;
  project: string | null;
  live: boolean | null;
  colab: boolean;
  nativeFormat: string | null;
  metrics: PostMetrics;
}

export interface AccountDay {
  day: number;
  profileId: string;
  followers: number;
  newFollowers: number | null;
  lost: number | null;
  net: number;
}

export interface Theme {
  id: string;
  name: string;
}

export interface Editorial {
  id: string;
  title: string;
  themeId: string;
  day: number;
}

/** Anotação editorial de uma publicação (`key` = link normalizado). */
export interface PostNote {
  key: string;
  text: string;
  version: number;
  updatedAt: string; // ISO
}

export type AudienceKind = 'followers' | 'reached' | 'engaged';
export const AGE_BANDS = ['13–17', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'] as const;
export const GENDERS = ['Feminino', 'Masculino', 'Não informado'] as const;
export const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

export interface AudienceBlock {
  age: number[]; // % por faixa (soma 100)
  gender: number[]; // % (soma 100)
  states: Record<string, number>; // % por UF (soma 100)
}

export interface PlatformAudience {
  platform: PlatformId;
  /** quais cortes a fonte entrega, por tipo de público */
  blocks: Partial<Record<AudienceKind, AudienceBlock>>;
  /** evolução mensal da composição etária de seguidores (12 meses) */
  ageByMonth: number[][] | null;
  /** atividade média dos seguidores: [dia da semana 0..6][hora 0..23] índice 0..100 */
  activity: number[][] | null;
  /** % de audiência nova por mês (restante = recorrente) */
  newShareByMonth: number[] | null;
  /** faixa etária do público alcançado por formato (nível da publicação) */
  ageByFormat: Partial<Record<FormatId, number[]>> | null;
}

export interface DictEntry {
  key: string;
  definicao: string;
  fonte: string;
  unidade: string;
  denominador: string | null;
  agregacao: string;
}

export type CoverageStatus = 'disponível' | 'parcial' | 'indisponível';
export interface NetworkCoverage {
  linhas: number;
  metricas: Record<string, { n: number; pct: number; status: CoverageStatus }>;
}
export interface NetworkKpi {
  kpi_proposto: string | null;
  kpi_usado: string | null;
  substituto: boolean;
  situacao: string;
  motivo: string | null;
}

/** Metadados vindos do pipeline (manifest + benchmark + dicionário). */
export interface DatasetMeta {
  source: 'pipeline';
  generatedAt: string; // ISO
  periodStart: string; // primeira data das partições carregadas
  periodEnd: string; // última data (manifest.periodo.fim)
  totalRows: number;
  limitations: string[];
  dictionary: DictEntry[];
  coverage: Record<string, NetworkCoverage>;
  networkKpi: Record<string, NetworkKpi>;
  benchDays: number;
  benchAlternatives: number[];
  hasPaid: boolean;
  hasAudience: boolean;
}

export interface Dataset {
  meta: DatasetMeta;
  profiles: Profile[];
  themes: Theme[];
  posts: Post[];
  account: AccountDay[];
  editorials: Editorial[];
  /** cópia publicada pelo pipeline, usada se a API de anotações não responder */
  notes: PostNote[];
  audience: PlatformAudience[];
  generatedAt: string;
}
