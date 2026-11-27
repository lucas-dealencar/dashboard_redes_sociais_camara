import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Botão "i" que mostra a explicação ao passar o mouse, focar ou tocar. */
export function Info({ children, label = 'Mais informações' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const box = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  // não deixa o balão sair da tela
  useLayoutEffect(() => {
    setShift(0);
    if (!open || !tip.current) return;
    const r = tip.current.getBoundingClientRect(), w = document.documentElement.clientWidth;
    const scale = tip.current.offsetWidth ? r.width / tip.current.offsetWidth : 1;
    setShift((r.right > w - 8 ? w - 8 - r.right : r.left < 8 ? 8 - r.left : 0) / scale);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="info" ref={box} onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}>
      <button type="button" className="info-btn" aria-label={label} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setOpen(true); }}
        onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>i</button>
      {open && <span className="info-tip" role="tooltip" ref={tip} style={{ transform: `translateX(${shift}px)` }}>{children}</span>}
    </span>
  );
}
