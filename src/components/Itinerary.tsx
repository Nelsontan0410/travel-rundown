import type { MouseEvent } from 'react';
import s from './Itinerary.module.css';
import { Button, StatusChip } from './Basics';
import { Icon } from './Icon';
import type { RightSlot } from '../domain/rules';
import type { IconName } from '../domain/rules';

/** HeroCover（01） */
export function HeroCover({ coverUrl, dateRange, offline }: { coverUrl?: string; dateRange: string; offline: boolean }) {
  return (
    <div className={s.hero}>
      {coverUrl ? (
        <>
          <img className={s.heroImg} src={coverUrl} alt="" />
          <div className={s.heroShade} />
        </>
      ) : (
        <Icon name="Mountain" size="lg" className={s.heroPlaceholder} />
      )}
      <div className={s.heroBottom}>
        <span className={`${s.heroDate} ${coverUrl ? '' : s.heroDateDark}`}>{dateRange}</span>
        {offline && <StatusChip variant="success">行程已离线保存</StatusChip>}
      </div>
    </div>
  );
}

export function DayTiles({
  days,
  selectedId,
  onSelect,
}: {
  days: { id: string; date: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={s.tiles} role="tablist" aria-label="日期">
      {days.map((d) => {
        const [, m, dd] = d.date.split('-').map(Number);
        const on = d.id === selectedId;
        return (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-day={d.id}
            className={`${s.tile} ${on ? s.tileOn : ''}`}
            onClick={() => onSelect(d.id)}
          >
            <span className={s.tileNum}>{dd}</span>
            <span className={s.tileMonth}>{m}月</span>
          </button>
        );
      })}
    </div>
  );
}

export function DayHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 className={s.dayTitle}>{title}</h2>
      <p className={s.daySub}>{sub}</p>
    </>
  );
}

export function Timeline({ children }: { children: React.ReactNode }) {
  return <div className={s.rows}>{children}</div>;
}

interface RowProps {
  first: boolean;
  time?: string;
  dot: 'done' | 'current' | 'pending';
  icon: IconName;
  title: string;
  subtitle: string;
  slot: RightSlot;
  current: boolean;
  actions?: { proof?: () => void; nav?: () => void };
  onOpen: () => void;
  onNav: () => void;
}

/** TimelineRow + ItemCard（01） */
export function TimelineRow({ first, time, dot, icon, title, subtitle, slot, current, actions, onOpen, onNav }: RowProps) {
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const iconColor = icon === 'Ticket' ? 'var(--color-warning-ink)' : 'var(--color-primary)';
  return (
    <div className={s.row}>
      <div className={s.time}>{time ?? ''}</div>
      <div className={s.rail}>
        <span className={`${s.line} ${first ? s.firstLine : ''}`} />
        <span className={`${s.dot} ${dot === 'done' ? s.dotDone : dot === 'current' ? s.dotCurrent : ''}`} />
      </div>
      <div className={`${s.card} ${current ? s.current : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
        <div className={s.cardMain}>
          <span className={s.cardIcon} style={{ color: iconColor }}>
            <Icon name={icon} />
          </span>
          <div className={s.cardText}>
            <p className={s.cardTitle}>{title}</p>
            {subtitle && <p className={s.cardSub}>{subtitle}</p>}
          </div>
          <div className={s.slot}>
            {slot.kind === 'nav' ? (
              <Button variant="outline" size="sm" icon="Navigation" onClick={stop(onNav)}>
                导航
              </Button>
            ) : (
              <StatusChip variant={slot.variant}>{slot.label}</StatusChip>
            )}
            <Icon name="ChevronRight" size="sm" />
          </div>
        </div>
        {current && actions && (actions.proof || actions.nav) && (
          <div className={s.actions}>
            {actions.proof && (
              <Button variant="outline" size="sm" icon="FileText" onClick={stop(actions.proof)}>
                预订证明
              </Button>
            )}
            {actions.nav && (
              <Button variant="outline" size="sm" icon="Navigation" onClick={stop(actions.nav)}>
                导航
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
