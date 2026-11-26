import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsMobile } from '../../utils/device';

/** Botão que abre um painel de opções (suspenso no computador, folha inferior no celular). */
export function Popover({ trigger, ariaLabel, title, hint, className, children }: { trigger: ReactNode; ariaLabel: string; title: string; hint?: string; className?: string; children: (close: () => void) => ReactNode }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!mobile && ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, [open, mobile]);
  const close = () => setOpen(false);
  const panel = (
    <div className={`plat-panel${mobile ? ' sheet' : ''}`} role="dialog" aria-label={title}>
      <div className="plat-head"><b>{title}</b><button type="button" className="x" aria-label="Fechar" onClick={close}>×</button></div>
      {hint && <p className="small muted" style={{ margin: '0 0 8px' }}>{hint}</p>}
      {children(close)}
    </div>
  );
  return (
    <div className={`pop plat-pick ${className ?? ''}`} ref={ref}>
      <button type="button" className="inp pop-btn plat-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(!open)}>
        {trigger}<span aria-hidden>▾</span>
      </button>
      {open && (mobile ? <div className="scrim sheet-scrim" onClick={close}><div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>{panel}</div></div> : panel)}
    </div>
  );
}

/** Escolha única ou múltipla (com máximo) em um Popover. */
export function Picker<T extends string>({ ariaLabel, title, hint, options, value, onChange, multi, max, summary }: { ariaLabel: string; title: string; hint?: string; options: { id: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; multi?: boolean; max?: number; summary: string }) {
  return (
    <Popover ariaLabel={ariaLabel} title={title} hint={hint} trigger={<span className="lbl">{summary}</span>}>
      {(close) => (
        <>
          <div className={`plat-grid${multi ? '' : ' one'}`}>
            {options.map((o) => {
              const on = value.includes(o.id);
              const full = !!multi && !on && max !== undefined && value.length >= max;
              return (
                <button type="button" key={o.id} className="plat-opt" aria-pressed={on} disabled={full} title={full ? `Máximo de ${max} seleções` : undefined}
                  onClick={() => {
                    if (!multi) { onChange([o.id]); close(); return; }
                    if (on && value.length === 1) return; // ao menos uma opção
                    onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id]);
                  }}>
                  <span className={multi ? 'chk' : 'rad'} /><span className="opt-lbl">{o.label}</span>
                </button>
              );
            })}
          </div>
          {multi && <button type="button" className="btn primary plat-done" onClick={close}>Concluir</button>}
        </>
      )}
    </Popover>
  );
}
