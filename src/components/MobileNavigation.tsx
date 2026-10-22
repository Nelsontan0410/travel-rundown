import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useCurrentTripId, useTripData, useTrips } from '../hooks/data';
import { Sheet } from './Layout';
import { Button } from './Basics';
import { Icon, type IconKey } from './Icon';
import PhaseCard from './PhaseCard';
import FlightCountdown from './FlightCountdown';
import s from './MobileNavigation.module.css';

const QUERY = '(max-width: 768px)';
function subscribe(cb: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', cb);
  return () => media.removeEventListener('change', cb);
}
export function useMobileNavigation() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}

type Group = 'import' | 'prepare' | 'itinerary' | 'overview' | 'settings';
type Panel = 'trips' | 'prepare' | 'settings';
const groups: { key: Group; label: string; icon: IconKey }[] = [
  { key: 'import', label: '导入', icon: 'FileUp' },
  { key: 'prepare', label: '筹备', icon: 'ShoppingBag' },
  { key: 'itinerary', label: '日程', icon: 'CalendarDays' },
  { key: 'overview', label: '概览', icon: 'Globe' },
  { key: 'settings', label: '设置', icon: 'Settings' },
];

function Navigation() {
  const nav = useNavigate();
  const { pathname, hash } = useLocation();
  const currentId = useCurrentTripId();
  const routeTrip = pathname.match(/^\/(?:trip|itinerary)\/([^/]+)/)?.[1];
  const tripId = routeTrip ?? currentId;
  const td = useTripData(tripId);
  const trips = useTrips();
  const [open, setOpen] = useState<Group | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const path = (tail: string) => tripId ? `/trip/${tripId}/${tail}` : '/trips';
  const active: Group = pathname.startsWith('/import') || pathname === '/trips' || pathname === '/docs' || pathname.startsWith('/join') ? 'import'
    : /\/(ledger|outfits)$/.test(pathname) ? 'prepare'
    : /\/(story|today)$/.test(pathname) || pathname === '/today' ? 'overview'
    : /\/(settings|highlights)$/.test(pathname) || pathname === '/notifications' || /\/suggest/.test(pathname) ? 'settings' : 'itinerary';
  useEffect(() => { setOpen(null); setPanel(null); }, [pathname, hash]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); trigger.current?.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const closeMenus = () => flushSync(() => { setOpen(null); setPanel(null); });
  const go = (to: string) => { closeMenus(); nav(to); };
  const showPanel = (p: Panel) => { flushSync(() => setOpen(null)); setPanel(p); };
  const entries: Record<Exclude<Group, 'itinerary'>, { label: string; icon: IconKey; run: () => void }[]> = {
    import: [
      { label: '旅程切换', icon: 'Globe', run: () => showPanel('trips') },
      { label: '资料', icon: 'FileText', run: () => go('/docs') },
    ],
    prepare: [
      { label: '预算', icon: 'Wallet', run: () => go(path('ledger')) },
      { label: '行李·准备', icon: 'ShoppingBag', run: () => showPanel('prepare') },
      { label: '美食', icon: 'Utensils', run: () => go('/food') },
    ],
    overview: [
      { label: '今日行程', icon: 'CalendarDays', run: () => go(path('today')) },
      { label: '旅游概览', icon: 'Image', run: () => go(path('story')) },
    ],
    settings: [
      { label: '设置·更多', icon: 'Settings', run: () => showPanel('settings') },
      { label: '通知', icon: 'Bell', run: () => go('/notifications') },
    ],
  };
  // 美食专区全屏显示，不要底栏
  if (pathname.startsWith('/doc/') || pathname === '/food' || pathname.startsWith('/food/')) return null;
  return <>
    {open && <div className={s.dismiss} data-mobile-nav-dismiss onClick={() => { setOpen(null); trigger.current?.focus(); }} />}
    <nav className={s.nav} aria-label="手机版主导航">
      {groups.map(group => <div className={s.group} key={group.key}>
        {open === group.key && group.key !== 'itinerary' && <div ref={menu} id={`mobile-menu-${group.key}`} className={s.flyout} role="group" aria-label={`${group.label}子功能`}>
          {entries[group.key].map(entry => <button key={entry.label} className={s.shortcut} onClick={entry.run} type="button">
            <span className={s.circle}><Icon name={entry.icon} /></span><span>{entry.label}</span>
          </button>)}
        </div>}
        <button type="button" className={`${s.parent} ${group.key === 'itinerary' ? s.central : ''} ${active === group.key ? s.active : ''}`}
          aria-current={active === group.key ? 'page' : undefined}
          aria-expanded={group.key === 'itinerary' ? undefined : open === group.key}
          aria-controls={open === group.key ? `mobile-menu-${group.key}` : undefined}
          onClick={e => {
            trigger.current = e.currentTarget;
            if (group.key === 'itinerary') go(tripId ? `/itinerary/${tripId}` : '/itinerary');
            else setOpen(open === group.key ? null : group.key);
          }}>
          <span className={s.parentIcon}><Icon name={group.icon} /></span><span>{group.label}</span>
        </button>
      </div>)}
    </nav>
    <Sheet open={panel === 'trips'} onClose={() => setPanel(null)} title="旅程切换与导入">
      <div className={s.panel}>
        {(trips ?? []).map(t => <Button key={t.id} variant="outline" block icon={t.id === tripId ? 'CheckCircle2' : 'Globe'} onClick={() => go(`/itinerary/${t.id}`)}>{t.title}</Button>)}
        <Button block icon="FileUp" onClick={() => go('/import/paste')}>导入新旅程</Button>
        <Button block variant="link" onClick={() => go('/trips')}>管理全部旅程</Button>
      </div>
    </Sheet>
    <Sheet open={panel === 'prepare'} onClose={() => setPanel(null)} title="穿搭、行李与出发准备">
      <div className={s.panel}>
        <Button block variant="outline" icon="ShoppingBag" onClick={() => go(path('outfits'))}>穿搭与行李</Button>
        <h3>出发准备</h3>
        {td && <PhaseCard td={td} now={new Date()} hideDepartureCountdown />}
        <Button block variant="link" icon="ListChecks" onClick={() => go(path('settings'))}>查看准备事项</Button>
      </div>
    </Sheet>
    <Sheet open={panel === 'settings'} onClose={() => setPanel(null)} title="设置与更多">
      <div className={s.panel}>
        <Button block variant="outline" icon="Settings" onClick={() => go(path('settings'))}>旅程设置</Button>
        <Button block variant="outline" icon="Upload" onClick={() => go(path('settings#sync'))}>分享 / 邀请同伴</Button>
        <Button block variant="outline" icon="Mountain" onClick={() => go(path('highlights'))}>旅行亮点</Button>
        <Button block variant="link" icon="ListChecks" onClick={() => showPanel('prepare')}>出发准备与旅程工具</Button>
      </div>
    </Sheet>
  </>;
}

/** No desktop mount: neither mobile listeners nor mobile data subscriptions run there. */
export default function MobileNavigation() {
  return useMobileNavigation() ? <Navigation /> : null;
}
export function MobileOverviewCountdown({ tripId }: { tripId: string }) {
  return useMobileNavigation() ? <OverviewCountdown tripId={tripId} /> : null;
}
function OverviewCountdown({ tripId }: { tripId: string }) {
  const td = useTripData(tripId);
  return td ? <section className={s.countdown} aria-label="旅程倒计时"><FlightCountdown td={td} compactMobile /></section> : null;
}
