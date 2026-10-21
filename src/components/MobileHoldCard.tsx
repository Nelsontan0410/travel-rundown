import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import s from './Itinerary.module.css';

const mobileQuery = '(max-width: 768px)';
/** Presentation gesture only: persistence stays in the existing onCheck callback. */
export default function MobileHoldCard({ children, className, onOpen, checked, onCheck }: {
  children: ReactNode; className: string; onOpen: () => void;
  checked?: boolean; onCheck?: (done: boolean) => void;
}) {
  const [holding, setHolding] = useState(false);
  const active = useRef<{ x: number; y: number; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cleanup = useRef<() => void>(() => {});
  const suppressUntil = useRef(0);
  const cancelledGesture = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    active.current = null;
    setHolding(false);
    cleanup.current();
  };
  useEffect(() => () => { clearTimeout(timer.current); cleanup.current(); }, []);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia(mobileQuery).matches || !onCheck) return;
    if (!e.isPrimary || e.button !== 0) { cancel(); return; }
    if ((e.target as Element).closest('button,a,input,[data-no-hold]')) return;
    cancel();
    cancelledGesture.current = false;
    active.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setHolding(true);
    const move = (ev: globalThis.PointerEvent) => {
      const a = active.current;
      if (a && (ev.pointerId !== a.id || Math.hypot(ev.clientX - a.x, ev.clientY - a.y) > 10)) {
        cancelledGesture.current = true;
        cancel();
      }
    };
    const interrupt = () => { cancelledGesture.current = true; cancel(); };
    const end = () => cancel();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', interrupt);
    window.addEventListener('scroll', interrupt, true);
    window.addEventListener('resize', interrupt);
    window.addEventListener('blur', interrupt);
    document.addEventListener('visibilitychange', interrupt);
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', interrupt);
      window.removeEventListener('scroll', interrupt, true);
      window.removeEventListener('resize', interrupt);
      window.removeEventListener('blur', interrupt);
      document.removeEventListener('visibilitychange', interrupt);
    };
    timer.current = setTimeout(() => {
      if (!active.current || !window.matchMedia(mobileQuery).matches) return cancel();
      // The existing checklist may move/remount the row. Suppress the release click
      // at document level so it cannot open a different card under the finger.
      const swallow = (event: MouseEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
      document.addEventListener('click', swallow, true);
      const release = () => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        clearTimeout(failsafe);
        setTimeout(() => document.removeEventListener('click', swallow, true), 500);
      };
      const failsafe = setTimeout(() => {
        document.removeEventListener('click', swallow, true);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
      }, 30000);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      suppressUntil.current = Date.now() + 800;
      cancel();
      onCheck(!checked);
      try { navigator.vibrate?.(30); } catch { /* Optional device feedback. */ }
    }, 2000);
  };
  return <div className={`${className} ${holding ? s.holding : ''}`} role="button" tabIndex={0}
    data-hold-card data-completed={!!checked}
    onPointerDown={start} onTouchCancel={() => { cancelledGesture.current = true; cancel(); }}
    onContextMenu={e => { if (window.matchMedia(mobileQuery).matches) e.preventDefault(); }}
    onClick={e => { if (window.matchMedia(mobileQuery).matches && (cancelledGesture.current || Date.now() < suppressUntil.current)) { e.preventDefault(); e.stopPropagation(); } else onOpen(); }}
    onKeyDown={e => {
      if (!window.matchMedia(mobileQuery).matches) { if (e.key === 'Enter') onOpen(); return; }
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter') onOpen();
      if (e.key === ' ' && window.matchMedia(mobileQuery).matches && onCheck) { e.preventDefault(); onCheck(!checked); }
    }}>
    {children}
    <span className={s.holdProgress} aria-hidden="true" />
  </div>;
}
