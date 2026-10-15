// 2026-10 第一批 ⑤：「今天」页的展示件（纯展示）。
import type { ReactNode } from 'react';
import s from './Today.module.css';
import { Icon, type IconKey } from './Icon';

export function TodayBanner({ kicker, title, sub, children }: { kicker: string; title: string; sub: string; children?: ReactNode }) {
  return (
    <header className={s.banner}>
      <p className={s.kicker}>{kicker}</p>
      <h1 className={s.title}>{title}</h1>
      <p className={s.sub}>{sub}</p>
      {children}
    </header>
  );
}

export function TodaySection({ title, action, children, id }: { title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={s.section} aria-labelledby={id}>
      <div className={s.secHead}>
        <h2 id={id} className={s.secTitle}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 下一项：大卡片，原定时间、晚了多久、地点，下面放操作按钮 */
export function NextCard({
  icon,
  title,
  time,
  late,
  place,
  children,
  onOpen,
}: {
  icon: IconKey;
  title: string;
  time?: string;
  late?: string;
  place?: string;
  children: ReactNode;
  onOpen: () => void;
}) {
  return (
    <article className={s.next}>
      <button type="button" className={s.nextHead} onClick={onOpen} aria-label={`打开详情：${title}`}>
        <span className={s.nextIcon}>
          <Icon name={icon} />
        </span>
        <span className={s.nextText}>
          <span className={s.nextTitle}>{title}</span>
          {time && (
            <span className={s.nextTime}>
              {time}
              {late && <span className={s.late}>{late}</span>}
            </span>
          )}
          {place && <span className={s.nextPlace}>{place}</span>}
        </span>
        <Icon name="ChevronRight" size="sm" />
      </button>
      <div className={s.nextActions}>{children}</div>
    </article>
  );
}

export function ActionGrid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>;
}

/** 小方块按钮：看路线 / 给司机看 / 出示预订 */
export function QuickAction({ icon, label, onClick, warn }: { icon: IconKey; label: string; onClick: () => void; warn?: boolean }) {
  return (
    <button type="button" className={`${s.quick} ${warn ? s.quickWarn : ''}`} onClick={onClick}>
      <Icon name={icon} size="sm" />
      <span>{label}</span>
    </button>
  );
}

export function InfoCard({ icon, title, sub, children }: { icon: IconKey; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className={s.info}>
      <div className={s.infoHead}>
        <span className={s.infoIcon}>
          <Icon name={icon} size="sm" />
        </span>
        <span className={s.infoText}>
          <span className={s.infoTitle}>{title}</span>
          {sub && <span className={s.infoSub}>{sub}</span>}
        </span>
      </div>
      {children}
    </div>
  );
}

/** 今天的完整安排：一行一项 */
export function AgendaRow({
  time,
  icon,
  title,
  state,
  isNext,
  hint,
  onClick,
}: {
  time?: string;
  icon: IconKey;
  title: string;
  state: 'todo' | 'done' | 'skipped';
  isNext?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" className={`${s.row} ${state !== 'todo' ? s.rowDone : ''} ${isNext ? s.rowNext : ''}`} onClick={onClick}>
        <span className={s.rowTime}>{time ?? '—'}</span>
        <Icon name={icon} size="sm" />
        <span className={s.rowTitle}>{title}</span>
        {hint && <span className={s.rowHint}>{hint}</span>}
        {state === 'done' && <span className={s.rowState}>已完成</span>}
        {state === 'skipped' && <span className={s.rowState}>已跳过</span>}
      </button>
    </li>
  );
}

export function Agenda({ children }: { children: ReactNode }) {
  return <ul className={s.agenda}>{children}</ul>;
}
