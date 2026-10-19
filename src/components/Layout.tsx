import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import s from './Layout.module.css';
import { Icon, Logo, TabIconFilled, type IconKey } from './Icon';
import { useUI } from '../store/ui';
import { useOverlay } from '../hooks/layout';
import { unreadOf, useCloud } from '../store/cloud';

export type TabKey = 'trips' | 'itinerary' | 'docs' | 'notify';

interface ScreenProps {
  header?: ReactNode;
  sidebarHeader?: ReactNode;
  tab?: TabKey;
  bottom?: ReactNode; // ActionBar 或底部按钮区
  bottomStyle?: 'action' | 'plain';
  full?: boolean;
  children: ReactNode;
}

/** 页面骨架：页头 + 内容 + 可选的底部操作栏 + 同一套响应式导航 */
export function Screen({ header, sidebarHeader, tab, bottom, bottomStyle = 'action', full, children }: ScreenProps) {
  const pad = tab ? (bottom ? s.withTabBottom : s.withTab) : bottom ? s.withBottom : '';
  return (
    <div className={`${s.screen} ${tab ? s.withSidebar : ''}`}>
      <div className={s.contentColumn}>
      {header}
      {sidebarHeader && <div className={s.mobileSidebarHeader}>{sidebarHeader}</div>}
      <main className={`${s.main} ${sidebarHeader ? s.mainWithSidebarHeader : ''} ${full ? s.full : ''} ${pad}`}>{children}</main>
      {bottom && (
        <div
          className={`${s.fixedCol} ${s.shellBottom} ${tab ? s.bottomWithTab : ''} ${bottomStyle === 'action' ? s.actionBar : s.plainBottom}`}
        >
          {bottom}
        </div>
      )}
      </div>
      {tab && <TabBar active={tab} header={sidebarHeader} />}
    </div>
  );
}

/** AppHeader · 根页面型（01、04） */
export function RootHeader({ title, icon, iconLabel, onIcon }: { title: string; icon: IconKey; iconLabel: string; onIcon: () => void }) {
  return (
    <header className={s.header}>
      <div className={s.headerRow}>
        <Logo />
        <h1 className={s.headerTitle}>{title}</h1>
        <button type="button" className={s.hit} aria-label={iconLabel} onClick={onIcon}>
          <Icon name={icon} />
        </button>
      </div>
    </header>
  );
}

/** AppHeader · 返回型（02、05、06） */
export function BackHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: { icon: IconKey; label: string; onClick: () => void; primary?: boolean };
  onBack?: () => void;
}) {
  const nav = useNavigate();
  const back = () => {
    if (onBack) return onBack();
    if (window.history.state && window.history.state.idx > 0) nav(-1);
    else nav('/');
  };
  return (
    <header className={s.header} style={{ paddingLeft: 'var(--space-2)' }}>
      <div className={s.backRow}>
        <button type="button" className={s.hit} aria-label="返回" onClick={back}>
          <Icon name="ChevronLeft" />
        </button>
        <h1 className={s.navTitle}>{title}</h1>
        {right ? (
          <button type="button" className={`${s.hit} ${right.primary ? s.hitPrimary : ''}`} aria-label={right.label} onClick={right.onClick}>
            <Icon name={right.icon} />
          </button>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}

/** AppHeader · 大标题型（03） */
export function BigHeader({ title, sub, action }: { title: string; sub?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <header className={s.header}>
      <div className={s.bigRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className={s.bigTitle}>{title}</h1>
          {sub && <p className={s.bigSub}>{sub}</p>}
        </div>
        {action && (
          <button type="button" className={s.textBtn} onClick={action.onClick}>
            <Icon name="Plus" size="sm" />
            {action.label}
          </button>
        )}
      </div>
    </header>
  );
}

const TABS: { key: TabKey; label: string; to: string; icon: 'Home' | 'CalendarDays' | 'FileText' | 'Bell' }[] = [
  { key: 'trips', label: '旅程', to: '/trips', icon: 'Home' },
  { key: 'itinerary', label: '行程', to: '/itinerary', icon: 'CalendarDays' },
  { key: 'docs', label: '资料', to: '/docs', icon: 'FileText' },
  { key: 'notify', label: '通知', to: '/notifications', icon: 'Bell' },
];

export function TabBar({ active, header }: { active: TabKey; header?: ReactNode }) {
  // 2026-10-19：这台手机用过同步才显示「通知」，红点 = 别人做的、还没看过的
  const synced = useCloud((st) => !!st.session);
  const unread = useCloud((st) => unreadOf(st).length);
  const tabs = TABS.filter((t) => t.key !== 'notify' || synced || active === 'notify');
  return (
    <nav className={`${s.fixedCol} ${s.tabbar}`} aria-label="主导航" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      <span className={s.navLogo} aria-hidden="true"><Logo /></span>
      {header && <div className={s.sidebarHeader}>{header}</div>}
      {tabs.map((t) => {
        const on = t.key === active;
        const badge = t.key === 'notify' && unread > 0 ? unread : 0;
        return (
          <Link
            key={t.key}
            to={t.to}
            replace
            className={`${s.tab} ${on ? s.tabOn : ''}`}
            aria-current={on ? 'page' : undefined}
            aria-label={badge ? `${t.label}（${badge} 条未读）` : undefined}
          >
            <span className={s.tabIcon}>
              {on ? <TabIconFilled name={t.icon} /> : <Icon name={t.icon} />}
              {badge > 0 && <span className={s.badge}>{badge > 99 ? '99+' : badge}</span>}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Toast() {
  const t = useUI((st) => st.toast);
  if (!t) return null;
  return (
    <div key={t.id} className={s.toast} role="status">
      {t.text}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { panelRef, backdropRef, titleId, dismiss } = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div ref={backdropRef} className={s.scrim} onClick={dismiss} />
      <div ref={panelRef} className={`${s.fixedCol} ${s.sheet}`} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1}>
        <div className={s.handle} />
        {title && <h2 id={titleId} className={s.sheetTitle}>{title}</h2>}
        {children}
      </div>
    </>,
    document.body,
  );
}

export function Dialog({
  open,
  onClose,
  title,
  text,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text?: string;
  actions: ReactNode;
}) {
  const { panelRef, backdropRef, titleId, dismiss } = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div ref={backdropRef} className={s.dialogWrap} onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <div ref={panelRef} className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={s.handle} />
        <h2 id={titleId} className={s.dialogTitle}>{title}</h2>
        {text && <p className={s.dialogText}>{text}</p>}
        <div className={s.dialogBtns}>{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Menu({ open, onClose, items }: { open: boolean; onClose: () => void; items: { label: string; onClick: () => void }[] }) {
  const { panelRef, backdropRef, dismiss } = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div ref={backdropRef} className={s.menuScrim} onClick={dismiss} />
      <div className={`${s.fixedCol} ${s.menuPosition}`}>
      <div ref={panelRef} className={s.menu} role="menu" tabIndex={-1}>
        <div className={s.handle} />
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            className={s.menuItem}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
      </div>
    </>,
    document.body,
  );
}
