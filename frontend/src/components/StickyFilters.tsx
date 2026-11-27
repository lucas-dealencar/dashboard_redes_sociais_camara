import { useEffect, useRef, useState } from 'react';
import { PLATFORMS } from '../data/catalog';
import { fmtDMY } from '../domain/dates';
import { PRESETS, presetRange, useStore } from '../state/store';
import { FilterBar } from './Layout';
import { PlatformLogo } from './ui/ui';

const APPEAR_AFTER = 120; // px além do bloco original até a barra aparecer
const DOWN_TO_SHRINK = 120; // px rolados para baixo que encolhem a barra aberta

/**
 * Filtros globais que acompanham a rolagem. Enquanto o bloco original está visível, nada muda;
 * depois dele, uma barra fixa sob a navegação aparece encolhida, e só abre por clique (a rolagem
 * para baixo a encolhe de novo). A barra é sobreposta: o conteúdo não "pula" quando ela muda de tamanho.
 */
export function StickyFilters() {
  const anchor = useRef<HTMLDivElement>(null);
  const float = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [compact, setCompact] = useState(true);
  const [navH, setNavH] = useState(0);

  useEffect(() => {
    let last = window.scrollY, moved = 0, top = 0;
    // top em px de tela (compara com a âncora); navH em px do layout (vai para o estilo)
    const measure = () => { const nav = document.querySelector<HTMLElement>('.nav'); top = nav?.getBoundingClientRect().height ?? 0; setNavH(nav?.offsetHeight ?? 0); };
    // com um seletor, lista ou data em uso, a rolagem não pode fechar a barra
    const busy = () => {
      const el = float.current;
      return !!el && (!!el.querySelector('[aria-haspopup][aria-expanded="true"]') || (el.contains(document.activeElement) && !!document.activeElement?.matches('input, select')));
    };
    const onScroll = () => {
      const y = window.scrollY, d = y - last;
      last = y;
      // linha de progresso da leitura na barra encolhida (direto no DOM: não re-renderiza)
      const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty('--lido', `${max > 0 ? Math.min(100, (y / max) * 100) : 0}%`);
      const past = !!anchor.current && anchor.current.getBoundingClientRect().bottom <= top - APPEAR_AFTER;
      setStuck(past);
      if (!past) { setCompact(true); moved = 0; return; }
      if (!d || busy()) return;
      if (Math.sign(d) !== Math.sign(moved)) moved = 0;
      moved += d;
      if (moved > DOWN_TO_SHRINK) setCompact(true);
    };
    const onResize = () => { measure(); onScroll(); };
    onResize();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <>
      <div ref={anchor}><FilterBar /></div>
      {stuck && (
        <div className="filters-float" ref={float} style={{ top: navH, maxHeight: `calc(100vh - ${navH}px)` }}>
          <div className="wrap">
            {compact ? <CompactBar onExpand={() => setCompact(false)} /> : (
              <div className="filters-open">
                <FilterBar />
                <button type="button" className="filters-toggle" onClick={() => setCompact(true)} aria-label="Encolher filtros" title="Encolher filtros">▴ Encolher</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Barra encolhida: resumo do recorte, troca rápida de período e botão para abrir os filtros. */
function CompactBar({ onExpand }: { onExpand: () => void }) {
  const { state, setRange } = useStore();
  const { sel, range, preset } = state;
  const shown = sel.platforms.length ? PLATFORMS.filter((p) => sel.platforms.includes(p.id)) : PLATFORMS;
  const nets = !sel.platforms.length ? `Todas as redes (${PLATFORMS.length})` : shown.length === 1 ? shown[0].name : `${shown.length} de ${PLATFORMS.length} redes`;
  const extra = sel.profileIds.length + sel.themeIds.length + sel.formats.length + (sel.paid !== 'all' ? 1 : 0);
  return (
    <div className="filters-compact" role="group" aria-label="Filtros (resumo)">
      <button type="button" className="fc-nets" onClick={onExpand} title="Abrir filtros">
        <span className="dots">{shown.slice(0, 4).map((p) => <PlatformLogo key={p.id} id={p.id} size={22} />)}</span>
        <b>{nets}</b>
      </button>
      <div className="fc-periods" role="group" aria-label="Período">
        {PRESETS.map((p) => <button type="button" key={p.id} aria-pressed={preset === p.id} onClick={() => setRange(presetRange(p.days), p.id)}>{p.label}</button>)}
      </div>
      <span className="fc-dates">{fmtDMY(range.start)} a {fmtDMY(range.end)}</span>
      <button type="button" className="fc-open" onClick={onExpand} aria-label="Expandir filtros">
        Filtros{extra > 0 && <em>{extra}</em>}<span className="fc-chev" aria-hidden>▾</span>
      </button>
    </div>
  );
}
