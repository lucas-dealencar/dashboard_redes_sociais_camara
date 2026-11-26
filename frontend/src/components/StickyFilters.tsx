import { useEffect, useRef, useState } from 'react';
import { PLATFORMS } from '../data/catalog';
import { fmtDMY } from '../domain/dates';
import { PRESETS, useStore } from '../state/store';
import { FilterBar } from './Layout';
import { PlatformLogo } from './ui/ui';

const DOWN_TO_SHRINK = 12; // px rolados para baixo que encolhem a barra
const UP_TO_EXPAND = 30; // px rolados para cima que a reabrem

/**
 * Filtros globais que acompanham a rolagem. Enquanto o bloco original está visível, nada muda;
 * depois dele, uma barra fixa sob a navegação aparece encolhida, e abre ao rolar um pouco para
 * cima ou pela seta. A barra é sobreposta: o conteúdo não "pula" quando ela muda de tamanho.
 */
export function StickyFilters() {
  const anchor = useRef<HTMLDivElement>(null);
  const float = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [compact, setCompact] = useState(true);
  const [navH, setNavH] = useState(0);

  useEffect(() => {
    let last = window.scrollY, moved = 0, top = 0;
    const measure = () => { top = document.querySelector('.nav')?.getBoundingClientRect().height ?? 0; setNavH(top); };
    // com um seletor, lista ou data em uso, a rolagem não pode fechar a barra
    const busy = () => {
      const el = float.current;
      return !!el && (!!el.querySelector('[aria-haspopup][aria-expanded="true"]') || (el.contains(document.activeElement) && !!document.activeElement?.matches('input, select')));
    };
    const onScroll = () => {
      const y = window.scrollY, d = y - last;
      last = y;
      const past = !!anchor.current && anchor.current.getBoundingClientRect().bottom <= top;
      setStuck(past);
      if (!past) { setCompact(true); moved = 0; return; }
      if (!d || busy()) return;
      if (Math.sign(d) !== Math.sign(moved)) moved = 0;
      moved += d;
      if (moved > DOWN_TO_SHRINK) setCompact(true);
      else if (moved < -UP_TO_EXPAND) setCompact(false);
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
                <button type="button" className="filters-toggle" onClick={() => setCompact(true)} aria-label="Encolher filtros" title="Encolher filtros">▴</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CompactBar({ onExpand }: { onExpand: () => void }) {
  const { state } = useStore();
  const { sel, range, preset } = state;
  const shown = sel.platforms.length ? PLATFORMS.filter((p) => sel.platforms.includes(p.id)) : PLATFORMS;
  const nets = !sel.platforms.length ? `Todas as redes (${PLATFORMS.length})` : shown.length === 1 ? shown[0].name : `${shown.length} de ${PLATFORMS.length} redes`;
  const extra = sel.profileIds.length + sel.themeIds.length + sel.formats.length + (sel.paid !== 'all' ? 1 : 0);
  return (
    <button type="button" className="filters-compact" onClick={onExpand} aria-label="Expandir filtros" title="Expandir filtros">
      <span className="dots">{shown.slice(0, 4).map((p) => <PlatformLogo key={p.id} id={p.id} />)}</span>
      <b>{nets}</b>
      <span>{PRESETS.find((p) => p.id === preset)?.label ?? 'Personalizado'}</span>
      <span className="muted">{fmtDMY(range.start)} a {fmtDMY(range.end)}</span>
      {extra > 0 && <span className="pill req">{extra} filtro{extra > 1 ? 's' : ''}</span>}
      <span className="chev" aria-hidden>▾</span>
    </button>
  );
}
