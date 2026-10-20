import { useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const TABLET_QUERY = '(min-width: 768px)';
const DESKTOP_QUERY = '(min-width: 1024px)';

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'mobile';
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop';
  return window.matchMedia(TABLET_QUERY).matches ? 'tablet' : 'mobile';
}

function subscribe(onChange: () => void): () => void {
  const queries = [window.matchMedia(TABLET_QUERY), window.matchMedia(DESKTOP_QUERY)];
  for (const query of queries) query.addEventListener('change', onChange);
  return () => {
    for (const query of queries) query.removeEventListener('change', onChange);
  };
}

/** 只读取媒体查询；不改变页面状态，不监听设备类型。 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getBreakpoint, () => 'mobile');
}

interface OverlayEntry {
  panel: HTMLDivElement;
  backdrop: HTMLDivElement | null;
  close: () => void;
  trigger: HTMLElement | null;
}

const overlays: OverlayEntry[] = [];
const originalInert = new Map<HTMLElement, boolean>();
let originalOverflow = '';
let originalRootOverflow = '';
let bodyObserver: MutationObserver | undefined;

function overlayLayer(panel: HTMLElement): number {
  let layer = 0;
  for (let node: HTMLElement | null = panel; node && node !== document.body; node = node.parentElement) {
    const z = Number(getComputedStyle(node).zIndex);
    if (Number.isFinite(z)) layer = Math.max(layer, z);
  }
  return layer;
}

function topOverlay(): OverlayEntry | undefined {
  let top: OverlayEntry | undefined;
  for (const entry of overlays) {
    if (!entry.panel.isConnected) continue;
    if (!top || overlayLayer(entry.panel) > overlayLayer(top.panel) ||
      (overlayLayer(entry.panel) === overlayLayer(top.panel) &&
        !!(top.panel.compareDocumentPosition(entry.panel) & Node.DOCUMENT_POSITION_FOLLOWING))) top = entry;
  }
  return top;
}

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]',
  )).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') &&
    !element.closest('[inert]') && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden');
}

function focusOverlay(entry: OverlayEntry): void {
  (focusableElements(entry.panel)[0] ?? entry.panel).focus({ preventScroll: true });
}

function syncBackground(): void {
  const top = topOverlay();
  if (!top) return;
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (!originalInert.has(child)) originalInert.set(child, child.inert);
    const active = child.contains(top.panel) || (!!top.backdrop && child.contains(top.backdrop));
    child.inert = active ? originalInert.get(child)! : true;
  }
  if (!top.panel.contains(document.activeElement)) focusOverlay(top);
}

function onOverlayKeydown(event: KeyboardEvent): void {
  const top = topOverlay();
  if (!top) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    top.close();
  } else if (event.key === 'Tab') {
    const elements = focusableElements(top.panel);
    const active = document.activeElement;
    if (!elements.length) {
      event.preventDefault();
      top.panel.focus({ preventScroll: true });
    } else if (!elements.includes(active as HTMLElement) ||
      (event.shiftKey ? active === elements[0] : active === elements[elements.length - 1])) {
      event.preventDefault();
      elements[event.shiftKey ? elements.length - 1 : 0].focus({ preventScroll: true });
    }
  }
}

function onOverlayFocusin(event: FocusEvent): void {
  const top = topOverlay();
  if (top && event.target instanceof Node && !top.panel.contains(event.target)) focusOverlay(top);
}

/** B1 专用 UI 交互：只管理最上层弹层的关闭、焦点与背景，不操作业务数据。 */
export function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const entryRef = useRef<OverlayEntry | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const entry: OverlayEntry = {
      panel, backdrop: backdropRef.current, close: () => closeRef.current(),
      trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    entryRef.current = entry;
    if (!overlays.length) {
      originalOverflow = document.body.style.overflow;
      originalRootOverflow = document.documentElement.style.overflow;
      // overflow-x: clip on html/body makes body-only locking insufficient.
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onOverlayKeydown, true);
      document.addEventListener('focusin', onOverlayFocusin, true);
      bodyObserver = new MutationObserver(syncBackground);
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
    overlays.push(entry);
    syncBackground();
    const top = topOverlay();
    if (top && !top.panel.contains(document.activeElement)) focusOverlay(top);

    return () => {
      overlays.splice(overlays.indexOf(entry), 1);
      entryRef.current = null;
      if (overlays.length) syncBackground();
      else {
        bodyObserver?.disconnect();
        bodyObserver = undefined;
        document.removeEventListener('keydown', onOverlayKeydown, true);
        document.removeEventListener('focusin', onOverlayFocusin, true);
        document.body.style.overflow = originalOverflow;
        document.documentElement.style.overflow = originalRootOverflow;
        for (const [element, inert] of originalInert) element.inert = inert;
        originalInert.clear();
      }
      const next = topOverlay();
      const trigger = entry.trigger;
      if (trigger?.isConnected && !trigger.closest('[inert]') && !trigger.matches(':disabled') &&
        (!next || next.panel.contains(trigger))) trigger.focus({ preventScroll: true });
      else if (next) focusOverlay(next);
    };
  }, [open]);

  const dismiss = () => {
    if (entryRef.current && topOverlay() === entryRef.current) closeRef.current();
  };
  return { panelRef, backdropRef, titleId, dismiss };
}
