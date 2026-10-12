import { useSyncExternalStore } from 'react';

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
