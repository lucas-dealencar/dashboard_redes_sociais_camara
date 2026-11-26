import type { KpiResult } from '../domain/kpis';
import { fmtCompact, fmtDeltaPP, fmtDeltaPct, fmtInt, fmtPct, ND } from '../domain/format';
import { PLATFORM_BY_ID } from '../data/catalog';

export function fmtKpi(v: number | null, fmt: 'int' | 'pct' | 'compact'): string {
  if (v === null) return ND;
  return fmt === 'pct' ? fmtPct(v, 2) : fmt === 'int' ? fmtInt(v) : fmtCompact(v);
}

export function KpiCard({ r, hero, big, refDays }: { r: KpiResult; hero?: boolean; big?: boolean; refDays: number }) {
  const { def, value, delta, bench, have, miss } = r;
  const good = def.id === 'lost' ? (delta ?? 0) < 0 : (delta ?? 0) > 0;
  const flat = delta !== null && Math.abs(delta) < 0.05;
  const cls = delta === null || flat ? 'flat' : good ? 'up' : 'down';
  const arrow = delta === null || flat ? '●' : (delta as number) > 0 ? '▲' : '▼';
  const partial = value !== null && miss.length > 0;
  return (
    <div className={`kpi${hero ? ' hero' : ''}${big ? ' big' : ''}${value === null ? ' bad-cov' : ''}`}>
      <div className="k-label">
        <span title={def.hint}>{def.label}</span>
        {partial && <span className="cov" title={`Disponível em: ${have.map((p) => PLATFORM_BY_ID[p].name).join(', ')}. Indisponível em: ${miss.map((p) => PLATFORM_BY_ID[p].name).join(', ')}.`}>{have.length} de {have.length + miss.length} redes</span>}
      </div>
      {value === null ? <div className="k-value k-na">{ND}</div> : <div className="k-value">{fmtKpi(value, def.fmt)}</div>}
      {value === null ? (
        <div className="k-extra">{have.length === 0 ? 'Indisponível para as redes selecionadas.' : 'Sem dados calculáveis no período.'}</div>
      ) : (
        <>
          <div className={`k-delta ${cls}`}>{arrow} {delta === null ? 'variação não calculável' : def.delta === 'pp' ? `${fmtDeltaPP(delta)} vs. período anterior` : `${fmtDeltaPct(delta)} vs. período anterior`}</div>
          {bench ? (
            <div className="k-bench">
              <span>Benchmark ({refDays} d): <b>{fmtKpi(bench.median, def.fmt)}</b></span>
              <span className={`pill ${bench.status}`} title={`Faixa de referência (Q1–Q3): ${fmtKpi(bench.q1, def.fmt)} a ${fmtKpi(bench.q3, def.fmt)} · ${bench.windows} janelas`}>{bench.status === 'acima' ? '▲ acima do padrão' : bench.status === 'abaixo' ? '▼ abaixo do padrão' : '● dentro do padrão'}</span>
            </div>
          ) : def.stock ? <div className="k-bench">Indicador de estoque: veja o crescimento.</div> : <div className="k-bench">Benchmark: histórico insuficiente</div>}
          {r.medianPerPost !== null && <div className="k-extra">Mediana por publicação: <b>{fmtCompact(r.medianPerPost)}</b></div>}
        </>
      )}
    </div>
  );
}

/** Cartão enxuto: apenas o big number e o sinal de variação frente ao período anterior. */
export function KpiLite({ r }: { r: KpiResult }) {
  const { def, value, delta } = r;
  const good = def.id === 'lost' ? (delta ?? 0) < 0 : (delta ?? 0) > 0;
  const flat = delta === null || Math.abs(delta) < 0.05;
  return (
    <div className="kpi lite hero big">
      <div className="k-label"><span>{def.label}</span></div>
      {value === null ? <div className="k-value k-na">{ND}</div> : <div className="k-value">{fmtKpi(value, def.fmt)}</div>}
      {value !== null && <div className={`k-delta ${flat ? 'flat' : good ? 'up' : 'down'}`}>{flat ? '●' : (delta as number) > 0 ? '▲' : '▼'} {delta === null ? 'variação não calculável' : def.delta === 'pp' ? `${fmtDeltaPP(delta)} vs. período anterior` : `${fmtDeltaPct(delta)} vs. período anterior`}</div>}
    </div>
  );
}

const deltaTxt = (r: KpiResult) => (r.delta === null ? 'variação não calculável' : r.def.delta === 'pp' ? `${fmtDeltaPP(r.delta)} vs. anterior` : `${fmtDeltaPct(r.delta)} vs. anterior`);
const deltaCls = (r: KpiResult) => (r.delta === null || Math.abs(r.delta) < 0.05 ? 'flat' : (r.def.id === 'lost' ? r.delta < 0 : r.delta > 0) ? 'up' : 'down');

/** Cartão de seção: KPI principal, variação e indicadores de apoio (o benchmark fica por rede). */
export function SectionCard({ main, others, title, support, principal }: { main: KpiResult; others: KpiResult[]; title: string; support: string; principal?: boolean }) {
  return (
    <div className="plat-card" style={{ borderTopColor: 'var(--mint)' }}>
      <h4><span className="badge" style={{ fontSize: 15 }}><i className="dot" style={{ background: 'var(--mint)' }} />{title}</span>{principal && <span className="pill req">KPI principal</span>}</h4>
      <span className="small muted">{principal ? 'KPI principal: ' : ''}{main.def.label}</span>
      <span className="big">{fmtKpi(main.value, main.def.fmt)}</span>
      {main.value !== null && <span className={`k-delta ${deltaCls(main)}`}>{deltaTxt(main)}</span>}
      <ul>
        {others.map((r) => <li key={r.def.id} title={r.def.hint}><span>{r.def.label}</span><b>{fmtKpi(r.value, r.def.fmt)}</b></li>)}
      </ul>
      <span className="small muted">Apoio: {support}</span>
    </div>
  );
}
