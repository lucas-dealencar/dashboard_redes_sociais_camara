import type {
  Dataset, DictEntry, FormatId, NetworkCoverage, NetworkKpi, PlatformId, Post, Profile, Theme,
} from '../types';
import { configurePlatforms, FORMAT_ID_BY_NAME, NO_THEME, PLATFORM_ID_BY_NAME } from './catalog';
import { configureCalendar, dayOf } from '../domain/dates';
import { parseNotes } from './notes';

/**
 * Contrato de fonte de dados. As telas só conhecem `Dataset`.
 * A fonte oficial são os JSONs que o pipeline Python publica em docs/dados/ (mesmo contrato que um app
 * mobile pode consumir no futuro): manifest → benchmark/dicionário/anotações → partições mensais.
 */
export interface DataSource {
  load(onProgress?: (done: number, total: number) => void): Promise<Dataset>;
}

/* ------------------------- contrato dos JSONs (docs/dados) ------------------------- */
interface Colunar { colunas: string[]; linhas: unknown[][] }
interface Manifest {
  versao_esquema: number;
  gerado_em: string;
  redes: string[];
  periodo: { inicio: string; fim: string };
  janela_meses_posts: number;
  totais: { linhas: number; publicacoes: number };
  arquivos: Record<string, string>;
  particoes: { mes: string; arquivo: string; n: number; bytes: number }[];
  qualitativo_disponivel: boolean;
  limitacoes: string[];
}
interface BenchmarkJson {
  janela_dias: number;
  alternativas?: Record<string, unknown>;
  kpi_por_rede: Record<string, NetworkKpi>;
  cobertura: Record<string, NetworkCoverage>;
}
interface PostRow {
  data: string; rede: string; perfil: string | null; link: string; formato: string | null; formato_nativo: string | null;
  colab: boolean | null; ao_vivo: boolean | null; tema: string | null; tema_secundario: string | null;
  tipo_classificacao: string | null; subtipo_classificacao?: string | null; projeto: string | null;
  alcance: number | null; impressoes: number | null; visualizacoes: number | null;
  curtidas: number | null; comentarios: number | null; compartilhamentos: number | null; salvos: number | null; cliques_link: number | null;
  engajamento: number | null; engajamento_completo: boolean | null; taxa_engajamento: number | null; denominador_tipo: string | null;
  descricao: string | null;
}

const ESQUEMA_SUPORTADO = 1;
/** Temas legislativos (config/taxonomia_temas.json) na ordem de exibição; outros que aparecerem vão ao fim. */
const TEMAS_BASE = [
  'Agropecuária', 'Cidades e transportes', 'Ciência, tecnologia e comunicações', 'Consumidor', 'Direitos humanos', 'Economia',
  'Educação, cultura e esportes', 'Meio ambiente e energia', 'Política e administração pública', 'Relações exteriores', 'Saúde',
  'Segurança', 'Trabalho, previdência e assistência',
];
const DENOMINADOR: Record<string, 'reach' | 'views' | 'impressions'> = { alcance: 'reach', visualizacoes: 'views', impressoes: 'impressions' };

async function getJson<T>(base: string, path: string): Promise<T> {
  const r = await fetch(`${base}/${path}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}
async function getOptional<T>(base: string, path: string, fallback: T): Promise<T> {
  try { return await getJson<T>(base, path); } catch (e) { console.warn(`Arquivo opcional indisponível (${path}):`, e); return fallback; }
}
function* rows<T>(t: Colunar): Generator<T> {
  for (const l of t.linhas) {
    const o: Record<string, unknown> = {};
    t.colunas.forEach((c, i) => (o[c] = l[i]));
    yield o as T;
  }
}

const themeId = (name: string) => `t:${name}`;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function titleOf(desc: string | null, rede: string, formato: string): string {
  const first = (desc ?? '').split(/\n+/).map((s) => s.trim()).find(Boolean);
  if (!first) return `${rede} · ${formato} (sem descrição)`;
  return first.length > 110 ? `${first.slice(0, 107).trimEnd()}…` : first;
}

export class PipelineDataSource implements DataSource {
  constructor(private readonly base = './dados') {}

  async load(onProgress?: (done: number, total: number) => void): Promise<Dataset> {
    const manifest = await getJson<Manifest>(this.base, 'manifest.json');
    if (manifest.versao_esquema !== ESQUEMA_SUPORTADO) {
      console.warn(`manifest.versao_esquema=${manifest.versao_esquema}; o front foi escrito para a versão ${ESQUEMA_SUPORTADO}.`);
    }
    const parts = [...manifest.particoes].sort((a, b) => a.mes.localeCompare(b.mes));
    if (!parts.length) throw new Error('manifest.json não lista partições de publicações.');
    const total = parts.length + 3;
    let done = 0;
    const tick = () => onProgress?.(++done, total);

    const [bench, dictRaw, annRaw, ...tables] = await Promise.all([
      getJson<BenchmarkJson>(this.base, manifest.arquivos['benchmark.json'] ?? 'benchmark.json').then((v) => (tick(), v)),
      getOptional<Record<string, Omit<DictEntry, 'key'>>>(this.base, manifest.arquivos['dicionario_metricas.json'] ?? 'dicionario_metricas.json', {}).then((v) => (tick(), v)),
      getOptional<unknown>(this.base, manifest.arquivos['anotacoes.json'] ?? 'anotacoes.json', []).then((v) => (tick(), v)),
      ...parts.map((p) => getJson<Colunar>(this.base, p.arquivo).then((v) => (tick(), v))),
    ]);

    // calendário: do 1º dia da 1ª partição até o fim do período publicado
    const startIso = `${parts[0].mes}-01`;
    configureCalendar(startIso, manifest.periodo.fim);

    const themeNames = new Set<string>();
    const profilesMap = new Map<string, Profile>();
    const formatsByPlatform: Record<string, Set<FormatId>> = {};
    const seenPlatforms = new Set<string>();
    const unknownNets = new Set<string>();
    const posts: Post[] = [];
    let paidSeen = false;

    for (const t of tables) {
      for (const r of rows<PostRow>(t)) {
        const platform = PLATFORM_ID_BY_NAME[r.rede];
        if (!platform) { unknownNets.add(r.rede); continue; }
        const day = dayOf(r.data);
        if (day < 0) continue;
        seenPlatforms.add(r.rede);
        const format = FORMAT_ID_BY_NAME[r.formato ?? 'Não informado'] ?? 'outros';
        (formatsByPlatform[r.rede] ??= new Set()).add(format);
        const tema = r.tema || NO_THEME;
        themeNames.add(tema);
        if (r.tema_secundario) themeNames.add(r.tema_secundario);
        const profKey = r.perfil ? slug(r.perfil) : 'nao_identificado';
        const profileId = `${platform}-${profKey}`;
        if (!profilesMap.has(profileId)) profilesMap.set(profileId, { id: profileId, platform, name: r.perfil ? `@${r.perfil}` : 'Perfil não identificado no link' });
        const erBase = r.taxa_engajamento !== null && r.denominador_tipo ? DENOMINADOR[r.denominador_tipo] ?? null : null;
        posts.push({
          id: r.link, platform, profileId, day, hour: null, date: r.data,
          title: titleOf(r.descricao, r.rede, r.formato ?? 'Não informado'), caption: r.descricao ?? '', url: r.link,
          format, themeId: themeId(tema), secondaryThemeIds: r.tema_secundario && r.tema_secundario !== tema ? [themeId(r.tema_secundario)] : [],
          campaign: null, paid: false, durationSec: null, editorialId: '',
          classification: r.tipo_classificacao, subclassification: r.subtipo_classificacao ?? null, project: r.projeto, live: r.ao_vivo, colab: !!r.colab, nativeFormat: r.formato_nativo,
          metrics: {
            reach: r.alcance, views: r.visualizacoes, impressions: r.impressoes,
            likes: r.curtidas, comments: r.comentarios, shares: r.compartilhamentos, saves: r.salvos, clicks: r.cliques_link,
            engagement: r.engajamento_completo === false ? null : r.engajamento,
            er: erBase ? r.taxa_engajamento : null, erBase,
            avgWatchSec: null, retention: null, completion: null,
          },
        });
      }
    }
    if (unknownNets.size) console.warn('Redes sem cadastro visual no front (ignoradas):', [...unknownNets]);

    const order = manifest.redes.filter((n) => seenPlatforms.has(n) && PLATFORM_ID_BY_NAME[n]).map((n) => PLATFORM_ID_BY_NAME[n]) as PlatformId[];
    configurePlatforms(order, bench.cobertura ?? {}, bench.kpi_por_rede ?? {}, formatsByPlatform);

    const themeList = [...TEMAS_BASE.filter((n) => themeNames.has(n)), ...[...themeNames].filter((n) => !TEMAS_BASE.includes(n) && n !== NO_THEME).sort(), ...(themeNames.has(NO_THEME) ? [NO_THEME] : [])];
    const themes: Theme[] = themeList.map((name) => ({ id: themeId(name), name }));
    const profiles = [...profilesMap.values()].sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform) || a.name.localeCompare(b.name));
    const dictionary: DictEntry[] = Object.entries(dictRaw).map(([key, v]) => ({ key, ...v }));
    const alts = Object.keys(bench.alternativas ?? {}).map(Number).filter((n) => n > 0);

    return {
      meta: {
        source: 'pipeline', generatedAt: manifest.gerado_em, periodStart: startIso, periodEnd: manifest.periodo.fim,
        totalRows: posts.length, limitations: manifest.limitacoes ?? [], dictionary,
        coverage: bench.cobertura ?? {}, networkKpi: bench.kpi_por_rede ?? {},
        benchDays: bench.janela_dias || 90, benchAlternatives: [...new Set([...alts, bench.janela_dias || 90])].sort((a, b) => a - b),
        hasPaid: paidSeen, hasAudience: false,
      },
      profiles, themes, posts, account: [], editorials: [], notes: parseNotes(annRaw), audience: [], generatedAt: manifest.gerado_em,
    };
  }
}
