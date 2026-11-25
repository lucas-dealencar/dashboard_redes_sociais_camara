import { useRef, useState } from 'react';
import { PLATFORMS, PLATFORM_BY_ID, FORMAT_BY_ID } from '../data/catalog';
import { useStore } from '../state/store';
import { AGE_BANDS, GENDERS, type AudienceKind, type FormatId, type PlatformAudience, type PlatformId } from '../types';
import { Section, Panel, Well, Note, Select, Segmented, ExportButtons, PlatformBadge, Empty } from '../components/ui/ui';
import { ActivityHeat, Columns, HBars, PngButton, StackedBars, StackedColumns, SwatchLegend, BrazilMap } from '../components/charts/charts';
import { AGE_COLORS, GENDER_COLORS } from '../components/charts/scale';
import { fmtShare } from '../domain/format';
import { START } from '../domain/dates';
import { activePlatforms } from '../domain/aggregate';
import type { Table } from '../utils/export';

const KINDS: { id: AudienceKind; label: string; hint: string }[] = [
  { id: 'followers', label: 'Seguidores', hint: 'Quem segue o perfil' },
  { id: 'reached', label: 'Contas alcançadas', hint: 'Quem viu o conteúdo no período' },
  { id: 'engaged', label: 'Espectadores / engajados', hint: 'Quem assistiu ou interagiu' },
];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// calculado sob demanda: START só é conhecido depois que os dados carregam
const monthsLabels = () => Array.from({ length: 12 }, (_, m) => { const d = new Date(START); d.setUTCMonth(d.getUTCMonth() + m); return `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`; });
const pct = (v: number) => fmtShare(v);
const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Estado exibido enquanto não houver fonte demográfica (etapa 3 da proposta). */
export function AudienceUnavailable() {
  const { ds } = useStore();
  const lim = ds.meta.limitations.find((l) => /p[úu]blico/i.test(l));
  return (
    <div className="stack">
      <Section title="Público" sub="Perfil demográfico e comportamento da audiência">
        <Panel light title="Dados indisponíveis">
          <Empty>A base atual (planilha Consolidado, via pipeline) não traz dados demográficos: faixa etária, gênero, localização, horários de atividade e audiência nova × recorrente dependem de uma nova fonte (etapa 3 da proposta). Nada é estimado nem inferido a partir de outros dados.</Empty>
          {lim && <p className="small muted" style={{ marginTop: 10 }}>Limitação registrada pelo pipeline: {lim}</p>}
          <p className="small muted" style={{ marginTop: 6 }}>Quando a fonte existir, o pipeline publicará um arquivo de público em <code>docs/dados/</code> e esta aba passará a exibir os gráficos (já implementados).</p>
        </Panel>
      </Section>
    </div>
  );
}

export function Audience() {
  const { ds, state } = useStore();
  const act = activePlatforms(state.sel);
  const withData = ds.audience.filter((a) => Object.keys(a.blocks).length > 0).map((a) => a.platform);
  const [netPick, setNet] = useState<PlatformId>('instagram');
  const net = act.includes(netPick) ? netPick : act.find((p) => withData.includes(p)) ?? act[0];
  const aud = ds.audience.find((a) => a.platform === net)!;
  const [kindPick, setKind] = useState<AudienceKind>('followers');
  const kind: AudienceKind = aud.blocks[kindPick] ? kindPick : (Object.keys(aud.blocks)[0] as AudienceKind | undefined) ?? 'followers';
  const block = aud.blocks[kind];
  const rAge = useRef<HTMLDivElement>(null), rGen = useRef<HTMLDivElement>(null);
  const hasAge = !!block && block.age.length > 0;

  const ageTable = (): Table => ({ name: `publico-${net}-${kind}`, headers: ['Faixa etária', '% do público'], rows: AGE_BANDS.map((b, i) => [b, block?.age[i] ?? null]) });
  const ufTable = (): Table => ({ name: `localizacao-${net}-${kind}`, headers: ['UF', '% do público'], rows: Object.entries(block?.states ?? {}).sort((a, b) => b[1] - a[1]).map(([u, v]) => [u, v]) });
  const topUF = Object.entries(block?.states ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="stack">
      <Note><b>Como ler:</b> os dados demográficos são instantâneos mensais fornecidos por cada rede; a visão por rede é a prioritária. Filtros de período, tema e formato não se aplicam aqui. Percentuais de redes diferentes não são somados nem interpretados como pessoas distintas, e a demografia de um conteúdo não é inferida a partir da do perfil.</Note>

      <Section title="Disponibilidade dos dados de público" sub="Conforme a fonte demográfica de cada rede">
        <Panel light>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Rede</th>{KINDS.map((k) => <th key={k.id}>{k.label}</th>)}<th>Idade e gênero</th><th>Localização</th><th>Horários</th><th>Nova × recorrente</th><th>Por publicação</th></tr></thead>
            <tbody>{PLATFORMS.map((p) => { const a = ds.audience.find((x) => x.platform === p.id)!; const has = (b: boolean) => <td className={b ? 'ok' : 'no'}>{b ? '✓' : '—'}</td>;
              return <tr key={p.id}><td><PlatformBadge id={p.id} /></td>{KINDS.map((k) => has(!!a.blocks[k.id]))}{has(!!a.blocks.followers?.age.length)}{has(Object.keys(a.blocks).length > 0)}{has(!!a.activity)}{has(!!a.newShareByMonth)}{has(!!a.ageByFormat)}</tr>; })}</tbody></table></div>
        </Panel>
      </Section>

      <Section title="Perfil da audiência" sub="Distribuição por faixa etária, gênero e localização">
        <div className="flex" style={{ marginBottom: 14 }}>
          <div className="f-group"><span className="f-label">Rede</span><Select label="Rede" value={net} options={act.map((p) => ({ id: p, label: `${PLATFORM_BY_ID[p].name}${withData.includes(p) ? '' : ' (sem dados demográficos)'}` }))} onChange={setNet} /></div>
          <div className="f-group"><span className="f-label">Tipo de público</span><Segmented value={kind} label="Tipo de público" options={KINDS.filter((k) => aud.blocks[k.id]).map((k) => ({ id: k.id, label: k.label }))} onChange={setKind} /></div>
        </div>
        {!block ? <Empty>{PLATFORM_BY_ID[net].name} não fornece dados demográficos de audiência pela fonte. Nada é estimado ou inferido.</Empty> : (
          <>
            <p className="small muted" style={{ marginBottom: 12 }}>{KINDS.find((k) => k.id === kind)!.hint}. Seguidores, contas alcançadas e espectadores/engajados são públicos diferentes e não devem ser tratados como equivalentes.</p>
            <div className="grid g2">
              <Panel title="Faixa etária" tools={<><ExportButtons table={ageTable} /><PngButton target={rAge} name="faixa-etaria" /></>}>
                {hasAge ? <Well><div ref={rAge}><Columns aria="Distribuição por faixa etária" rows={AGE_BANDS.map((b, i) => ({ key: b, label: b, value: block.age[i], text: pct(block.age[i]), color: AGE_COLORS[i] }))} /></div></Well> : <Empty>Faixa etária indisponível nesta rede.</Empty>}
              </Panel>
              <Panel title="Gênero" tools={<PngButton target={rGen} name="genero" />}>
                {hasAge ? <Well><div ref={rGen}><StackedBars aria="Distribuição por gênero" labelW={0} rows={[{ key: 'g', label: '', segs: GENDERS.map((g, i) => ({ label: g, value: block.gender[i], color: GENDER_COLORS[i] })) }]} /></div>
                  <SwatchLegend items={GENDERS.map((g, i) => ({ label: `${g}: ${pct(block.gender[i])}`, color: GENDER_COLORS[i] }))} /></Well> : <Empty>Gênero indisponível nesta rede.</Empty>}
                <p className="small muted" style={{ marginTop: 8 }}>“Não informado” reúne contas sem gênero declarado ou identificado pela rede.</p>
              </Panel>
            </div>
            <div className="grid g2" style={{ marginTop: 18 }}>
              <Panel title="Localização por UF" tools={<ExportButtons table={ufTable} />}><Well><BrazilMap aria="Mapa do Brasil com a participação de cada UF" data={block.states} /></Well></Panel>
              <Panel title="Dez maiores UFs"><Well><HBars aria="Dez maiores UFs por participação" labelW={60} rows={topUF.map(([u, v]) => ({ key: u, label: u, value: v, text: pct(v) }))} /></Well></Panel>
            </div>
            <div style={{ marginTop: 18 }}>
              <Panel title="Seguidores × alcançadas × engajadas" sub={`${PLATFORM_BY_ID[net].name}: faixa etária por tipo de público`}>
                <Well><StackedBars aria="Faixa etária por tipo de público" labelW={210} rows={KINDS.filter((k) => aud.blocks[k.id]?.age.length).map((k) => ({ key: k.id, label: k.label, segs: AGE_BANDS.map((b, i) => ({ label: b, value: (aud.blocks[k.id] as { age: number[] }).age[i], color: AGE_COLORS[i] })) }))} />
                  <SwatchLegend items={AGE_BANDS.map((b, i) => ({ label: b, color: AGE_COLORS[i] }))} /></Well>
              </Panel>
            </div>
          </>
        )}
      </Section>

      <Evolution aud={aud} net={net} />
      <Composition act={act} />
      <Activity aud={aud} net={net} />
      <Crossing aud={aud} net={net} />
    </div>
  );
}

function Evolution({ aud, net }: { aud: PlatformAudience; net: PlatformId }) {
  if (!aud.ageByMonth) return (
    <Section title="Evolução do perfil demográfico"><Empty>{PLATFORM_BY_ID[net].name} não fornece histórico demográfico.</Empty></Section>
  );
  const newShare = aud.newShareByMonth!;
  return (
    <Section title="Evolução do perfil demográfico" sub={`${PLATFORM_BY_ID[net].name} · composição percentual dos seguidores e audiência nova × recorrente`}>
      <div className="grid g2">
        <Panel title="Composição etária dos seguidores, por mês"><Well><StackedColumns aria="Composição etária mensal dos seguidores" cats={monthsLabels()} series={AGE_BANDS.map((b, i) => ({ label: b, color: AGE_COLORS[i] }))} values={aud.ageByMonth} /></Well><SwatchLegend items={AGE_BANDS.map((b, i) => ({ label: b, color: AGE_COLORS[i] }))} /></Panel>
        <Panel title="Audiência nova × recorrente"><Well><StackedColumns aria="Audiência nova e recorrente por mês" cats={monthsLabels()} series={[{ label: 'Nova', color: '#36c7a6' }, { label: 'Recorrente', color: '#134e5e' }]} values={newShare.map((v) => [v, 100 - v])} /></Well><SwatchLegend items={[{ label: 'Nova', color: '#36c7a6' }, { label: 'Recorrente', color: '#134e5e' }]} /></Panel>
      </div>
    </Section>
  );
}

function Composition({ act }: { act: PlatformId[] }) {
  const { ds } = useStore();
  const rows = ds.audience.filter((a) => act.includes(a.platform) && a.blocks.followers?.age.length);
  return (
    <Section title="Composição percentual por rede" sub="Cada barra soma 100% dentro da própria rede; não há soma entre redes">
      {rows.length === 0 ? <Empty>Nenhuma rede selecionada fornece faixa etária.</Empty> : (
        <div className="grid g2">
          <Panel title="Faixa etária dos seguidores"><Well><StackedBars aria="Faixa etária por rede" labelW={110} rows={rows.map((a) => ({ key: a.platform, label: PLATFORM_BY_ID[a.platform].name, segs: AGE_BANDS.map((b, i) => ({ label: b, value: (a.blocks.followers as { age: number[] }).age[i], color: AGE_COLORS[i] })) }))} /></Well><SwatchLegend items={AGE_BANDS.map((b, i) => ({ label: b, color: AGE_COLORS[i] }))} /></Panel>
          <Panel title="Gênero dos seguidores"><Well><StackedBars aria="Gênero por rede" labelW={110} rows={rows.map((a) => ({ key: a.platform, label: PLATFORM_BY_ID[a.platform].name, segs: GENDERS.map((g, i) => ({ label: g, value: (a.blocks.followers as { gender: number[] }).gender[i], color: GENDER_COLORS[i] })) }))} /></Well><SwatchLegend items={GENDERS.map((g, i) => ({ label: g, color: GENDER_COLORS[i] }))} /></Panel>
        </div>
      )}
    </Section>
  );
}

function Activity({ aud, net }: { aud: PlatformAudience; net: PlatformId }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!aud.activity) return <Section title="Horários de atividade"><Empty>{PLATFORM_BY_ID[net].name} não fornece horários de atividade da audiência.</Empty></Section>;
  const flat = aud.activity.flatMap((row, d) => row.map((v, h) => ({ d, h, v }))).sort((a, b) => b.v - a.v).slice(0, 3);
  return (
    <Section title="Horários de atividade" sub={`${PLATFORM_BY_ID[net].name} · índice de atividade dos seguidores por dia e hora (0–100)`}>
      <Panel title="Quando a audiência está ativa" tools={<PngButton target={ref} name="horarios" />}>
        <Well><div ref={ref}><ActivityHeat aria="Mapa de calor de atividade por dia da semana e hora" grid={aud.activity} /></div></Well>
        <p className="small" style={{ marginTop: 8 }}>Maiores janelas: {flat.map((f) => `${dias[f.d]}, ${String(f.h).padStart(2, '0')}h`).join(' · ')}. Use como hipótese para o planejamento editorial.</p>
      </Panel>
    </Section>
  );
}

function Crossing({ aud, net }: { aud: PlatformAudience; net: PlatformId }) {
  return (
    <Section title="Público × formato de conteúdo" sub="Disponível apenas onde a fonte entrega demografia no nível da publicação">
      {!aud.ageByFormat ? <Empty>{PLATFORM_BY_ID[net].name} não fornece demografia por publicação, formato ou tema. O cruzamento não é estimado a partir da demografia geral do perfil.</Empty> : (
        <Panel title={`Faixa etária do público alcançado, por formato — ${PLATFORM_BY_ID[net].name}`}>
          <Well><StackedBars aria="Faixa etária do público alcançado por formato" labelW={170} rows={Object.entries(aud.ageByFormat).map(([f, ages]) => ({ key: f, label: FORMAT_BY_ID[f as FormatId].name, segs: AGE_BANDS.map((b, i) => ({ label: b, value: (ages as number[])[i], color: AGE_COLORS[i] })) }))} /></Well>
          <SwatchLegend items={AGE_BANDS.map((b, i) => ({ label: b, color: AGE_COLORS[i] }))} />
        </Panel>
      )}
    </Section>
  );
}
