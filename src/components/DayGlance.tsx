// 2026-10-19 每日行程（手机）新层级的展示组件：
//  ItineraryHeader：当前旅程名 + 切换 + 真实的同步状态 + 旅程设置
//  TripEntries：预订资料 / 同伴 入口
import type { ReactNode } from 'react';
import s from './DayGlance.module.css';
import { Icon } from './Icon';

export function ItineraryHeader({
  title,
  phase,
  sync,
  onSwitch,
  onSettings,
  mobileActions,
}: {
  mobileActions?: ReactNode;
  title: string;
  /** 例如「3 天后出发」「第 2 天 · 共 4 天」「已结束」 */
  phase?: string;
  /** 只在真的开启了同步时传，例如「已发布 v3」「已套用 v2」「有新版本 v3」 */
  sync?: { label: string; attention?: boolean };
  onSwitch: () => void;
  onSettings: () => void;
}) {
  return (
    <header className={s.header}>
      <div className={s.row}>
        <button type="button" className={s.titleBtn} onClick={onSwitch} aria-label={`当前旅程：${title}，切换旅程`}>
          <span className={s.title}>{title || '未命名旅程'}</span>
          <Icon name="ChevronRight" size="sm" className={s.chev} />
        </button>
        <button type="button" className={`${s.icon} ${mobileActions ? s.desktopSettings : ''}`} aria-label="旅程设置" onClick={onSettings}>
          <Icon name="Settings" />
        </button>
        {mobileActions}
      </div>
      {(phase || sync) && (
        <div className={s.meta}>
          {phase && <span className={s.phase}>{phase}</span>}
          {sync && (
            <span className={`${s.sync} ${sync.attention ? s.syncAttention : ''}`}>
              <span className={s.dot} aria-hidden="true" />
              {sync.label}
            </span>
          )}
        </div>
      )}
    </header>
  );
}

export function TripEntries({ docs, mates, onDocs, onMates }: { docs: string; mates: string; onDocs: () => void; onMates: () => void }) {
  return (
    <div className={s.entries}>
      <button type="button" className={s.entry} onClick={onDocs}>
        <Icon name="FileText" size="sm" />
        <span>{docs}</span>
        <Icon name="ChevronRight" size="sm" className={s.chev} />
      </button>
      <button type="button" className={s.entry} onClick={onMates}>
        <Icon name="Globe" size="sm" />
        <span>{mates}</span>
        <Icon name="ChevronRight" size="sm" className={s.chev} />
      </button>
    </div>
  );
}
