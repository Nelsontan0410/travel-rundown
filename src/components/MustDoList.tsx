import s from './MustDo.module.css';
import { Card } from './Basics';
import { Icon } from './Icon';

/** 必逛 / 必吃清单：可以逐项打勾 */
export default function MustDoList({
  title,
  items,
  checked,
  onToggle,
}: {
  title: string;
  items: string[];
  checked: string[];
  onToggle: (text: string) => void;
}) {
  const set = new Set(checked);
  const done = items.filter((x) => set.has(x)).length;
  return (
    <Card>
      <div className={s.head}>
        <span className={s.title}>{title}</span>
        <span className={s.count}>
          {done}/{items.length}
        </span>
      </div>
      <div className={s.bar}>
        <div className={s.fill} style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      {items.map((t) => {
        const on = set.has(t);
        return (
          <button key={t} type="button" role="checkbox" aria-checked={on} className={s.row} onClick={() => onToggle(t)}>
            <span className={`${s.box} ${on ? s.boxOn : ''}`}>{on && <Icon name="CheckCircle2" size="chip" />}</span>
            <span className={on ? s.done : ''}>{t}</span>
          </button>
        );
      })}
    </Card>
  );
}
