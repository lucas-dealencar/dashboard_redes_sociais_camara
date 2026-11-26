import { useSyncExternalStore } from 'react';

/** Celular = tela estreita, ou aparelho móvel até a largura de um tablet em paisagem. */
const NARROW = 820, MOBILE_MAX = 1100;

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const mobileUa = nav.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(nav.userAgent || '');
  const w = window.innerWidth;
  return w <= NARROW || (mobileUa && w <= MOBILE_MAX);
}

let mobile = detect();
const listeners = new Set<() => void>();
// o CSS usa [data-device=mobile]
const mark = () => { if (typeof document !== 'undefined') document.documentElement.dataset.device = mobile ? 'mobile' : 'desktop'; };
mark();
if (typeof window !== 'undefined') {
  const update = () => { const next = detect(); if (next !== mobile) { mobile = next; mark(); listeners.forEach((f) => f()); } };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export const useIsMobile = () => useSyncExternalStore(subscribe, () => mobile, () => false);
