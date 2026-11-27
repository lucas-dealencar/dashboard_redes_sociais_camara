import { useMemo, useRef, useState } from 'react';
import { groupClasses, OTHERS, squarify, subOf, typeOf, type ClassGroup, type ClassPick } from '../domain/classification';
import { fmtCompact, fmtInt, fmtShare, ND } from '../domain/format';
import type { Post } from '../types';
import type { Table } from '../utils/export';
import { PngButton, useWidth } from './charts/charts';
import { HEAT, heatColor } from './charts/scale';
import { Info } from './ui/Info';
import { Empty, ExportButtons, Panel, Section, Segmented, Well } from './ui/ui';

type Size = 'posts' | 'engagement';
type Stat = 'media' | 'mediana';
const STAT_LABEL: Record<Stat, string> = { media: 'média', mediana: 'mediana' };

const FONT = 'DM Sans, Arial, sans-serif';
const MANY = 1.2, FEW = 0.8; // retorno ÷ esforço: acima rende mais que o volume; abaixo, menos

/** Quebra o nome em até duas linhas que caibam no bloco. */
function wrap(text: string, chars: number): string[] {
  if (text.length <= chars) return [text];
  const cut = text.lastIndexOf(' ', chars);
  // palavra única que não cabe: abrevia em vez de partir no meio
  if (cut <= 2) return [`${text.slice(0, Math.max(1, chars - 1))}…`];
  const first = text.slice(0, cut);
  const rest = text.slice(first.length).trim();
  return [first, rest.length > chars ? `${rest.slice(0, Math.max(1, chars - 1))}…` : rest];
}

function Treemap({ groups, size, stat, minN, picked, onPick, aria }: { groups: ClassGroup[]; size: Size; stat: Stat; minN: number; picked: string | null; onPick: (g: ClassGroup) => void; aria: string }) {
  const [ref, W] = useWidth();
  const H = 360;
  const value = (g: ClassGroup) => (stat === 'media' ? g.perPost : g.medianPerPost);
  const sorted = [...groups].filter((g) => g[size] > 0).sort((a, b) => b[size] - a[size]);
  const rects = squarify(sorted.map((g) => g[size]), { x: 0, y: 0, w: W, h: H });
  // "Outros" não define a escala de cor: é uma mistura
  const max = Math.max(1e-9, ...sorted.filter((g) => g.key !== OTHERS && g.withEngagement >= minN).map((g) => value(g) ?? 0));
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="group" aria-label={aria} style={{ display: 'block', fontFamily: FONT }}>
        {sorted.map((g, i) => {
          const r = rects[i];
          const v = value(g);
          const color = v === null ? { bg: '#e8eeef', fg: '#48696f' } : heatColor(Math.sqrt(Math.min(1, v / max)));
          const chars = Math.floor((r.w - 16) / 7.2);
          const name = r.w > 54 && r.h > 30 ? wrap(g.label, chars) : [];
          const showName = name.slice(0, r.h > 46 ? 2 : 1);
          const valueY = r.y + 20 + showName.length * 15 + 8;
          const tip = `${g.label}: ${fmtInt(g.posts)} publicações · engajamento ${fmtInt(g.engagement)} · ${STAT_LABEL[stat]} por publicação ${v === null ? ND : fmtCompact(v)}`;
          return (
            <g key={g.key} className="tile" role="button" tabIndex={0} aria-label={tip} aria-pressed={picked === g.key} opacity={g.posts < minN ? 0.55 : 1}
              onClick={() => onPick(g)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(g); } }}>
              <title>{tip}</title>
              <rect x={r.x + 1.5} y={r.y + 1.5} width={Math.max(0, r.w - 3)} height={Math.max(0, r.h - 3)} rx={8} fill={color.bg} stroke={picked === g.key ? '#7a56d6' : 'transparent'} strokeWidth={4} />
              {showName.map((line, k) => <text key={k} x={r.x + 10} y={r.y + 20 + k * 15} fontSize={13} fontWeight={800} fill={color.fg}>{line}</text>)}
              {showName.length > 0 && valueY < r.y + r.h - 6 && (
                <text x={r.x + 10} y={valueY} fontSize={r.w > 150 && r.h > 100 ? 24 : 14} fontWeight={800} fill={color.fg}>
                  {size === 'posts' ? fmtCompact(g.posts) : fmtCompact(g.engagement)}
                </text>
              )}
              {showName.length > 0 && r.w > 120 && valueY + 18 < r.y + r.h - 4 && (
                <text x={r.x + 10} y={valueY + 18} fontSize={11.5} fill={color.fg}>{v === null ? 'engajamento n/d' : `${STAT_LABEL[stat]}: ${fmtCompact(v)}`}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend-scale">{`Cor = ${STAT_LABEL[stat]} de engajamento por publicação:`} menor <span style={{ display: 'inline-flex', gap: 2 }}>{HEAT.map((h) => <i key={h} style={{ background: h }} />)}</span> maior · área = {size === 'posts' ? 'publicações' : 'engajamento total'} · blocos esmaecidos = amostra pequena</div>
    </div>
  );
}

/** Esforço (% das publicações) frente a retorno (% do engajamento), em barras espelhadas. */
function EffortReturn({ groups, minN, picked, onPick }: { groups: ClassGroup[]; minN: number; picked: string | null; onPick: (g: ClassGroup) => void }) {
  const rows = groups.filter((g) => g.withEngagement > 0);
  const max = Math.max(1e-9, ...rows.flatMap((g) => [g.sharePosts, g.shareEngagement]));
  if (!rows.length) return <Empty>Sem engajamento disponível para comparar neste recorte.</Empty>;
  return (
    <div className="effort">
      <div className="effort-row effort-head"><span>% das publicações</span><span /><span>% do engajamento</span><span /></div>
      {rows.map((g) => {
        const ratio = g.sharePosts ? g.shareEngagement / g.sharePosts : null;
        const small = g.withEngagement < minN;
        const cls = small || ratio === null ? 'flat' : ratio >= MANY ? 'up' : ratio <= FEW ? 'down' : 'flat';
        return (
          <button type="button" key={g.key} className={`effort-row${small ? ' small-n' : ''}`} aria-pressed={picked === g.key} onClick={() => onPick(g)}
            title={`${g.label}: ${fmtInt(g.withEngagement)} publicações com engajamento${small ? ' · amostra pequena' : ''}`}>
            <span className="effort-side left"><b>{fmtShare(g.sharePosts * 100)}</b><i style={{ width: `${(g.sharePosts / max) * 100}%` }} /></span>
            <span className="effort-name">{g.label}</span>
            <span className="effort-side right"><i style={{ width: `${(g.shareEngagement / max) * 100}%` }} /><b>{fmtShare(g.shareEngagement * 100)}</b></span>
            <span className={`effort-ratio ${cls}`}>{ratio === null ? ND : `${ratio.toFixed(1).replace('.', ',')}×`}</span>
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  posts: Post[];
  minN: number;
  pick: ClassPick;
  /** `others` = subtipos reunidos em "Outros", para o filtro do ranking */
  onPick: (pick: ClassPick, others: string[]) => void;
}

export function ClassificationExplorer({ posts, minN, pick, onPick }: Props) {
  const [size, setSize] = useState<Size>('posts');
  const [stat, setStat] = useState<Stat>('media');
  const ref = useRef<HTMLDivElement>(null);
  const types = useMemo(() => groupClasses(posts, typeOf), [posts]);
  const type = pick.type && types.some((t) => t.key === pick.type) ? pick.type : null;
  const subs = useMemo(() => (type ? groupClasses(posts.filter((p) => typeOf(p) === type), subOf, true) : []), [posts, type]);
  const groups = type ? subs : types;
  const picked = type ? pick.sub : null;

  const choose = (g: ClassGroup) => {
    if (!type) return onPick({ type: g.key, sub: null }, []);
    onPick({ type, sub: pick.sub === g.key ? null : g.key }, g.members);
  };

  const table = (): Table => ({
    name: 'classificacao',
    headers: ['Tipo de classificação', 'Subtipo de classificação', 'Publicações', 'Publicações com engajamento', 'Engajamento', 'Engajamento médio por publicação', 'Engajamento mediano por publicação'],
    rows: types.flatMap((t) => groupClasses(posts.filter((p) => typeOf(p) === t.key), subOf).map((s) => [t.key, s.key, s.posts, s.withEngagement, s.engagement, s.perPost === null ? null : Math.round(s.perPost * 10) / 10, s.medianPerPost])),
  });

  const where = type ?? 'Todos os tipos';
  return (
    <Section title="Mapa da classificação" sub="Clique em um tipo para abrir os subtipos; clique em um subtipo para filtrar o ranking de publicações">
      <Panel title={type ? <><button type="button" className="crumb" onClick={() => onPick({ type: null, sub: null }, [])}>← Todos os tipos</button> {type}</> : 'Tipos de classificação'}
          tools={<><Segmented value={size} label="Tamanho dos blocos" options={[{ id: 'posts', label: 'Publicações' }, { id: 'engagement', label: 'Engajamento' }]} onChange={setSize} /><Segmented value={stat} label="Engajamento por publicação" options={[{ id: 'media', label: 'Média' }, { id: 'mediana', label: 'Mediana' }]} onChange={setStat} /><ExportButtons table={table} /><PngButton target={ref} name="mapa-classificacao" /></>}>
        {groups.length ? (
          <div className="class-split">
            <Well><div ref={ref}><Treemap aria={`Mapa de classificação: ${where}`} groups={groups} size={size} stat={stat} minN={minN} picked={picked} onPick={choose} /></div></Well>
            <div className="class-effort">
              <h3>Esforço × retorno<Info>Compara a fatia das publicações com a fatia do engajamento. 2,0× = rende o dobro do volume que ocupa. Considera só publicações com engajamento disponível.</Info></h3>
              <EffortReturn groups={groups} minN={minN} picked={picked} onPick={choose} />
            </div>
          </div>
        ) : <Empty>Sem publicações para os filtros atuais.</Empty>}
      </Panel>
    </Section>
  );
}
