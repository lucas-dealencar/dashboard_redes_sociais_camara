import { useMemo, useState } from 'react';
import { FORMATS, PLATFORMS, PLATFORM_BY_ID } from '../data/catalog';
import { ADHERENCE, DICTIONARY } from '../domain/dictionary';
import { hasContentFilter } from '../domain/aggregate';
import { LAST_DAY, dayOf, fmtDMY, isoOf } from '../domain/dates';
import { fmtDM } from '../domain/dates';
import { fmtCompact, fmtInt, ND } from '../domain/format';
import { erDenominator, postMetric } from '../domain/contentStats';
import { postEngagement } from '../domain/aggregate';
import { PRESETS, presetRange, useStore, type TabId } from '../state/store';
import { MultiSelect, Modal, Segmented, Select, Note, PlatformBadge, PlatformDot } from './ui/ui';
import { Toggle } from './ui/ui';
import { NoteEditor } from './NoteEditor';
import { FORMAT_BY_ID } from '../data/catalog';
import rodape from '../assets/rodape-camara.png';

export const TABS: { id: TabId; label: string; sub: string }[] = [
  { id: 'visao', label: 'Visão geral', sub: 'Resultados consolidados e comparação entre redes' },
  { id: 'evolucao', label: 'Evolução e redes', sub: 'Séries históricas, KPIs por rede e picos' },
  { id: 'conteudos', label: 'Conteúdos', sub: 'Por publicação, tema, formato e rede' },
  { id: 'publico', label: 'Público', sub: 'Perfil demográfico e comportamento' },
];

const fmtGerado = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export function Cover() {
  const { ds } = useStore();
  return (
    <header className="cover">
      <div className="wrap cover-in">
        <span className="selo">REDES SOCIAIS DA CÂMARA</span>
        <h1>Dashboard integrado de redes sociais</h1>
        <div className="cover-row">
          <span className="strip">Dados até {fmtDMY(LAST_DAY)} · gerados em {fmtGerado(ds.meta.generatedAt)}</span>
        </div>
      </div>
    </header>
  );
}

export function Nav() {
  const { state, setTab, setMethodOpen } = useStore();
  return (
    <nav className="nav" aria-label="Seções do dashboard">
      <div className="wrap nav-in" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="tab" aria-selected={state.tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}<small>{t.sub}</small>
          </button>
        ))}
        <button className="btn dark nav-btn" onClick={() => setMethodOpen(true)}>Metodologia</button>
      </div>
    </nav>
  );
}

export function FilterBar() {
  const { ds, state, setSel, setRange, setBench, resetFilters } = useStore();
  const { sel, range, preset, benchDays } = state;
  const profOpts = useMemo(() => ds.profiles.filter((p) => !sel.platforms.length || sel.platforms.includes(p.platform)).map((p) => ({ id: p.id, label: p.name, group: PLATFORM_BY_ID[p.platform].name })), [ds.profiles, sel.platforms]);
  const allSel = sel.platforms.length === 0;
  const togglePlat = (id: (typeof PLATFORMS)[number]['id']) => {
    if (allSel) return setSel({ platforms: [id] });
    const next = sel.platforms.includes(id) ? sel.platforms.filter((p) => p !== id) : [...sel.platforms, id];
    setSel({ platforms: next.length === PLATFORMS.length ? [] : next });
  };
  const content = hasContentFilter(sel);
  const formatOpts = FORMATS.filter((f) => PLATFORMS.some((p) => p.formats.includes(f.id)));
  const benchOpts = ds.meta.benchAlternatives.length ? ds.meta.benchAlternatives : [30, 60, 90, 180];
  const setDate = (which: 'start' | 'end', iso: string) => {
    if (!iso) return;
    let d = Math.min(LAST_DAY, Math.max(0, dayOf(iso)));
    const r = { ...range, [which]: d };
    if (r.start > r.end) { if (which === 'start') r.end = r.start; else r.start = r.end; }
    d = 0;
    setRange(r, 'custom');
  };
  return (
    <section className="filters" aria-label="Filtros globais">
      <div className="f-row">
        <div className="f-group">
          <span className="f-label">Período</span>
          <div className="flex">
            <Segmented value={preset} label="Período predefinido" options={[...PRESETS.map((p) => ({ id: p.id, label: p.label })), ...(preset === 'custom' ? [{ id: 'custom', label: 'Personalizado' }] : [])]}
              onChange={(v) => { const p = PRESETS.find((x) => x.id === v); if (p) setRange(presetRange(p.days), p.id); }} />
            <label className="flex small">de <input className="inp" type="date" value={isoOf(range.start)} min={isoOf(0)} max={isoOf(LAST_DAY)} onChange={(e) => setDate('start', e.target.value)} /></label>
            <label className="flex small">até <input className="inp" type="date" value={isoOf(range.end)} min={isoOf(0)} max={isoOf(LAST_DAY)} onChange={(e) => setDate('end', e.target.value)} /></label>
          </div>
        </div>
        <div className="f-group">
          <span className="f-label">Perfil</span>
          <MultiSelect label="Perfil" options={profOpts} value={sel.profileIds} onChange={(v) => setSel({ profileIds: v })} allLabel="Todos os perfis" />
        </div>
        <div className="f-group">
          <span className="f-label">Tema</span>
          <MultiSelect label="Tema" options={ds.themes.map((t) => ({ id: t.id, label: t.name }))} value={sel.themeIds} onChange={(v) => setSel({ themeIds: v })} allLabel="Todos os temas" />
        </div>
        <div className="f-group">
          <span className="f-label">Formato</span>
          <MultiSelect label="Formato" options={formatOpts.map((f) => ({ id: f.id, label: f.name }))} value={sel.formats} onChange={(v) => setSel({ formats: v as never })} allLabel="Todos os formatos" />
        </div>
        {ds.meta.hasPaid && (
          <div className="f-group">
            <span className="f-label">Orgânico / pago</span>
            <Segmented value={sel.paid} label="Orgânico ou pago" options={[{ id: 'all', label: 'Todos' }, { id: 'organico', label: 'Orgânico' }, { id: 'pago', label: 'Pago' }]} onChange={(v) => setSel({ paid: v })} />
          </div>
        )}
        <div className="f-group">
          <span className="f-label">Janela do benchmark</span>
          <Select label="Janela do benchmark" value={benchDays} options={benchOpts.map((d) => ({ id: d, label: `${d} dias${d === ds.meta.benchDays ? ' (padrão)' : ''}` }))} onChange={setBench} />
        </div>
      </div>
      <div className="f-row" style={{ alignItems: 'center' }}>
        <div className="f-group" style={{ flex: 1 }}>
          <span className="f-label">Plataforma — todas, uma rede ou uma seleção</span>
          <div className="chips">
            <button className="chip" aria-pressed={allSel} onClick={() => setSel({ platforms: [] })}><i />Todas as redes</button>
            {PLATFORMS.map((p) => (
              <button key={p.id} className="chip" aria-pressed={allSel || sel.platforms.includes(p.id)} onClick={() => togglePlat(p.id)}>
                <PlatformDot id={p.id} />{p.name}
              </button>
            ))}
          </div>
        </div>
        <button className="btn sm" onClick={resetFilters}>Limpar filtros</button>
      </div>
      {content && <Note>Tema e formato filtram <b>métricas de publicação</b>. Seguidores, novos seguidores e perdas são dados da conta e respondem apenas a plataforma e perfil.</Note>}
    </section>
  );
}

export function Footer() {
  const { ds } = useStore();
  return (
    <footer>
      <div className="foot"><div className="wrap"><img src={rodape} alt="Coordenação de Relacionamento, Inteligência e Participação · Diretoria Executiva de Comunicação e Mídias Digitais · 200 anos da Câmara dos Deputados" /></div></div>
      <div className="foot-note"><div className="wrap">Fonte: planilha “Consolidado Redes Sociais - Simplificado”, processada pelo pipeline e publicada em docs/dados/ · {fmtInt(ds.meta.totalRows)} publicações de {fmtDMY(0)} a {fmtDMY(LAST_DAY)} · gerado em {fmtGerado(ds.meta.generatedAt)}.</div></div>
    </footer>
  );
}

/* ---------------------- detalhe da publicação ---------------------- */
export function PostDrawer() {
  const { openPost: p, setOpenPost, ds, setPostTheme } = useStore();
  if (!p) return null;
  const m = p.metrics;
  const prof = ds.profiles.find((x) => x.id === p.profileId);
  const theme = ds.themes.find((t) => t.id === p.themeId);
  const versions = p.editorialId ? ds.posts.filter((x) => x.editorialId === p.editorialId && x.id !== p.id) : [];
  const eng = postEngagement(p);
  const yn = (v: boolean | null) => (v === null ? null : v ? 'Sim' : 'Não');
  const er = postMetric(p, 'er');
  const den = erDenominator(p);
  const row = (k: string, v: number | null | string) => <><dt>{k}</dt><dd>{v === null ? <span className="nd">{ND}</span> : typeof v === 'number' ? fmtInt(v) : v}</dd></>;
  return (
    <Modal side onClose={() => setOpenPost(null)} label="Detalhe da publicação">
      <div className="flex between"><PlatformBadge id={p.platform} /><button className="x" onClick={() => setOpenPost(null)} aria-label="Fechar">×</button></div>
      <h3 style={{ fontFamily: 'var(--font-title)', fontSize: 22, margin: '8px 0 2px', letterSpacing: '-.02em' }}>{p.title}</h3>
      <p className="muted small">{prof?.name} · {fmtDMY(p.day)}{p.hour !== null ? ` às ${String(p.hour).padStart(2, '0')}h` : ''}</p>
      {p.caption && p.caption !== p.title && <p style={{ margin: '10px 0', whiteSpace: 'pre-line' }}>{p.caption}</p>}
      <a className="link" href={p.url} target="_blank" rel="noopener noreferrer">Abrir publicação</a>
      <dl className="kv">
        {row('Formato', FORMAT_BY_ID[p.format].name)}
        <dt>Tema principal</dt>
        <dd><Select label="Tema principal" value={p.themeId} options={ds.themes.map((t) => ({ id: t.id, label: t.name }))} onChange={(v) => { setPostTheme(p.id, v); setOpenPost({ ...p, themeId: v }); }} /> <span className="small muted">editável pela equipe</span></dd>
        {row('Temas secundários', p.secondaryThemeIds.length ? p.secondaryThemeIds.map((id) => ds.themes.find((t) => t.id === id)?.name).join(', ') : '—')}
        {row('Formato na planilha', p.nativeFormat ? `${p.nativeFormat}${p.colab ? ' (colab)' : ''}` : null)}
        {row('Classificação', p.classification)}
        {row('Projeto?', p.project)}
        {row('Ao vivo?', yn(p.live))}
      </dl>
      <NoteEditor key={p.id} link={p.url} title="Anotação" />
      <h4 style={{ margin: '16px 0 4px' }}>Desempenho</h4>
      <dl className="kv">
        {row('Alcance', m.reach)}{row('Visualizações', m.views)}{row('Impressões', m.impressions)}
        {row('Curtidas / reações', m.likes)}{row('Comentários / respostas', m.comments)}{row('Compartilhamentos', m.shares)}
        {row('Salvamentos', m.saves)}{row('Cliques', m.clicks)}
        {row('Engajamento total', eng)}
        {row('Taxa de engajamento', er === null || !den ? null : `${er.toFixed(2).replace('.', ',')}% (base: ${den.base === 'reach' ? 'alcance' : den.base === 'views' ? 'visualizações' : 'impressões'})`)}
        {p.durationSec && <>{row('Tempo médio assistido', m.avgWatchSec === null ? null : `${m.avgWatchSec.toFixed(0)} s`)}{row('Retenção', m.retention === null ? null : `${(m.retention * 100).toFixed(1).replace('.', ',')}%`)}{row('Conclusão', m.completion === null ? null : `${(m.completion * 100).toFixed(1).replace('.', ',')}%`)}</>}
      </dl>
      {versions.length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 6px' }}>Outras versões da mesma pauta</h4>
          <div className="grid" style={{ gap: 8 }}>
            {versions.map((v) => (
              <button key={v.id} className="post-item" style={{ textAlign: 'left' }} onClick={() => setOpenPost(v)}>
                <span className="flex between"><PlatformBadge id={v.platform} /><span className="small muted">{FORMAT_BY_ID[v.format].name}</span></span>
                <span className="small">{PLATFORM_BY_ID[v.platform].kpiLabel}: <b>{postMetric(v, 'kpi') === null ? ND : fmtCompact(postMetric(v, 'kpi') as number)}</b> · taxa: <b>{postMetric(v, 'er') === null ? ND : `${(postMetric(v, 'er') as number).toFixed(2).replace('.', ',')}%`}</b></span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="small muted" style={{ marginTop: 14 }}>Tema atual: {theme?.name}. Reclassificações ficam salvas só neste navegador (a fonte oficial do tema é a planilha). Valores “n/d” = métrica não fornecida para a publicação (diferente de zero); engajamento “n/d” = incompleto (ex.: Stories sem curtidas).</p>
    </Modal>
  );
}

/* ---------------------- metodologia ---------------------- */
const COV_COLS: { k: string; l: string }[] = [
  { k: 'alcance', l: 'Alcance' }, { k: 'impressoes', l: 'Impressões' }, { k: 'visualizacoes', l: 'Visualizações' },
  { k: 'curtidas', l: 'Curtidas' }, { k: 'comentarios', l: 'Coment.' }, { k: 'compartilhamentos', l: 'Compart.' },
  { k: 'salvos', l: 'Salvos' }, { k: 'cliques_link', l: 'Cliques' }, { k: 'engajamento', l: 'Engajamento' },
  { k: 'taxa_engajamento', l: 'Taxa' }, { k: 'seguidores', l: 'Seguidores' },
];
const KPI_NOME: Record<string, string> = { alcance: 'Alcance', visualizacoes: 'Visualizações', impressoes: 'Impressões', engajamento: 'Engajamento' };

export function MethodModal() {
  const { ds, methodOpen, setMethodOpen } = useStore();
  const [tab, setTab] = useState<'adh' | 'dic' | 'disp' | 'lim'>('adh');
  if (!methodOpen) return null;
  const { meta } = ds;
  return (
    <Modal onClose={() => setMethodOpen(false)} label="Metodologia">
      <div className="flex between" style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontSize: 26, letterSpacing: '-.03em' }}>Metodologia e aderência à proposta</h2>
        <button className="x" onClick={() => setMethodOpen(false)} aria-label="Fechar">×</button>
      </div>
      <Segmented value={tab} label="Seção" options={[{ id: 'adh', label: 'Aderência à proposta' }, { id: 'dic', label: 'Dicionário de métricas' }, { id: 'disp', label: 'Cobertura por rede' }, { id: 'lim', label: 'Limitações da base' }]} onChange={setTab} />
      <div style={{ marginTop: 16 }}>
        {tab === 'adh' && (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Seção</th><th>Requisito</th><th>Onde está</th><th>Entrega</th></tr></thead>
            <tbody>{ADHERENCE.map((a, i) => <tr key={i}><td>{a.ref}</td><td>{a.req}</td><td>{a.where}</td><td><span className={`pill ${a.stage === 'MVP' ? 'req' : 'etapa'}`}>{a.stage}</span></td></tr>)}</tbody></table></div>
        )}
        {tab === 'dic' && (
          <>
            <Note><b>Três estados de dado:</b> <b>zero</b> (a rede informou 0), <b>indisponível</b> (a fonte não traz; exibido como “n/d”) e <b>incompleto</b> (parte das redes ou parcelas não vem; o cartão mostra a cobertura, ex.: “4 de 7 redes”). Nunca somamos “n/d” como zero.</Note>
            <h4 style={{ margin: '14px 0 6px' }}>Métricas da base (definidas pelo pipeline · config/dicionario_metricas.json)</h4>
            <div className="tbl-wrap"><table className="tbl dict"><thead><tr><th>Métrica</th><th>Definição</th><th>Unidade</th><th>Fonte (coluna da planilha)</th><th>Denominador</th><th>Regra de agregação</th></tr></thead>
              <tbody>{meta.dictionary.map((d) => <tr key={d.key}><td><code>{d.key}</code></td><td>{d.definicao}</td><td>{d.unidade}</td><td>{d.fonte}</td><td>{d.denominador ?? '—'}</td><td>{d.agregacao}</td></tr>)}</tbody></table></div>
            <h4 style={{ margin: '14px 0 6px' }}>Indicadores calculados no painel</h4>
            <div className="tbl-wrap"><table className="tbl dict"><thead><tr><th>Indicador</th><th>Definição</th><th>Unidade</th><th>Fonte</th><th>Denominador</th><th>Regra de agregação</th></tr></thead>
              <tbody>{DICTIONARY.map((d) => <tr key={d.metric}><td>{d.metric}</td><td>{d.definition}</td><td>{d.unit}</td><td>{d.source}</td><td>{d.denominator}</td><td>{d.aggregation}</td></tr>)}</tbody></table></div>
          </>
        )}
        {tab === 'disp' && (
          <>
            <Note warn>Percentual de linhas da planilha com a métrica preenchida (benchmark.json › cobertura), em todo o histórico. ✓ = disponível, “parcial” = preenchida em parte das linhas, — = indisponível. KPI “substituto” = a coluna proposta não existe na planilha e o pipeline usou a mais próxima (validar com a equipe).</Note>
            <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>Rede</th><th>KPI principal</th><th>Situação</th>{COV_COLS.map((c) => <th key={c.k}>{c.l}</th>)}</tr></thead>
              <tbody>{PLATFORMS.map((p) => {
                const cov = meta.coverage[p.name]?.metricas ?? {};
                const k = meta.networkKpi[p.name];
                return (
                  <tr key={p.id}>
                    <td><PlatformBadge id={p.id} /></td>
                    <td title={p.kpiNote ?? undefined}>{p.kpiLabel}{k?.substituto && k.kpi_proposto ? <><br /><small className="muted">proposto: {KPI_NOME[k.kpi_proposto] ?? k.kpi_proposto}</small></> : null}</td>
                    <td><span className={`pill ${p.kpiValidated ? 'req' : 'validar'}`} title={p.kpiNote ?? undefined}>{p.kpiValidated ? 'Requisito' : k?.substituto ? 'Substituto' : 'A validar'}</span></td>
                    {COV_COLS.map((c) => { const m = cov[c.k]; const st = m?.status ?? 'indisponível'; return <td key={c.k} className={st === 'indisponível' ? 'no' : 'ok'} title={m ? `${m.pct.toLocaleString('pt-BR')}% (${m.n.toLocaleString('pt-BR')} linhas)` : undefined}>{st === 'disponível' ? '✓' : st === 'parcial' ? <small>parcial</small> : '—'}</td>; })}
                  </tr>
                );
              })}</tbody></table></div>
          </>
        )}
        {tab === 'lim' && (
          <>
            <Note>Limitações registradas pelo pipeline em <code>manifest.json</code> na última atualização ({fmtGerado(meta.generatedAt)}).</Note>
            <ul style={{ marginTop: 12, paddingLeft: 20, display: 'grid', gap: 6 }}>{meta.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </>
        )}
      </div>
    </Modal>
  );
}
export { Toggle };
