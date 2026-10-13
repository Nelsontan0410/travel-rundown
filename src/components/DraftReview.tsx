import s from './DraftReview.module.css';
import { Card } from './Basics';
import { Icon } from './Icon';
import type { IconName } from '../domain/rules';

export interface DraftRow {
  key: string;
  time?: string;
  icon: IconName;
  title: string;
  sub?: string;
}

/** 导入预览：按天列出将要导入的内容，确认后才保存 */
export function DraftDay({ title, date, rows }: { title: string; date: string; rows: DraftRow[] }) {
  return (
    <Card className={s.day}>
      <div className={s.dayHead}>
        <span className={s.dayTitle}>{title}</span>
        <span className={s.dayDate}>{date}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className={s.row}>
          <span className={s.time}>{r.time ?? ''}</span>
          <span className={s.icon}>
            <Icon name={r.icon} size="sm" />
          </span>
          <span className={s.text}>
            <span className={s.title}>{r.title}</span>
            {r.sub && <span className={s.sub}>{r.sub}</span>}
          </span>
        </div>
      ))}
    </Card>
  );
}

export function TypeCounts({ items }: { items: { icon: IconName; label: string; n: number }[] }) {
  return (
    <div className={s.counts}>
      {items.map((c) => (
        <span key={c.label} className={s.count}>
          <Icon name={c.icon} size="xs" />
          {c.label} {c.n}
        </span>
      ))}
    </div>
  );
}
