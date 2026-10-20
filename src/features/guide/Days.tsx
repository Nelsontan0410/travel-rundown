// 第三页：每日精选（手机 M03 纵向时间线 / 电脑 W03 两列章节）。
// 每天的主题、照片、是否显示只存在旅行亮点里；按天的数据来自真实旅程，不复制行程时间表。
import g from './Guide.module.css';
import { Icon } from '../../components/Icon';
import { EditableText, GuidePhoto } from './parts';
import { LIMITS, type DayPick } from '../../domain/guide';
import { fmtMonthDay } from '../../domain/format';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : WEEK[d.getUTCDay()];
};

export function DaysSection({
  picks,
  edit,
  customTitle,
  onOpenDay,
  onTitle,
  onPhoto,
  onHidden,
}: {
  picks: DayPick[];
  edit: boolean;
  customTitle: (dayId: string) => string;
  onOpenDay: (dayId: string) => void;
  onTitle: (dayId: string, v: string) => void;
  onPhoto: (dayId: string) => void;
  onHidden: (dayId: string, hidden: boolean) => void;
}) {
  const list = edit ? picks : picks.filter((p) => !p.hidden);
  if (!list.length) return <p className={g.hint}>每一天都设成了不显示。点「编辑」可以把它们重新显示出来。</p>;
  return (
    <ol className={g.timeline}>
      {list.map((p) => (
        <li key={p.day.id} className={`${g.dayItem} ${p.hidden ? g.dayHidden : ''}`} data-day-card={p.day.id}>
          <span className={g.dayDot} aria-hidden />
          <article className={`${g.dayCard} ${p.photoKey ? '' : g.dayNoPhoto}`}>
            {(p.photoKey || edit) && (
              <div className={g.dayMedia}>
                {p.photoKey ? (
                  <GuidePhoto photoKey={p.photoKey} focus={p.focus} alt={`Day ${p.day.index} ${p.title}`} className={g.dayPhoto} />
                ) : (
                  <div className={`${g.dayPhoto} ${g.photoEmpty}`}>
                    <span>当天照片</span>
                  </div>
                )}
                <span className={g.dayBadge} aria-hidden>
                  <small>DAY</small>
                  {pad(p.day.index)}
                </span>
                {edit && (
                  <button type="button" className={g.photoEdit} onClick={() => onPhoto(p.day.id)}>
                    <Icon name="Camera" size="sm" />
                    {p.photoKey ? '换照片' : '照片'}
                  </button>
                )}
              </div>
            )}
            <div className={g.dayBody}>
              <p className={g.dayDateLine}>
                <span className={g.dayStamp}>DAY {pad(p.day.index)}</span>
                <span>{fmtMonthDay(p.day.date)}</span>
                <span>{weekday(p.day.date)}</span>
                {p.day.city && <span>{p.day.city}</span>}
              </p>
              {edit ? (
                <EditableText
                  as="h3"
                  className={g.dayTitle}
                  editing
                  max={LIMITS.dayTitle}
                  label={`Day ${p.day.index} 主题`}
                  placeholder={p.custom ? '当天主题' : p.title}
                  value={customTitle(p.day.id)}
                  onCommit={(v) => onTitle(p.day.id, v)}
                />
              ) : (
                <h3 className={g.dayTitle}>{p.title}</h3>
              )}
              {p.picks.length > 0 && <p className={g.dayLine}>{p.picks.map((x) => x.title).join(' · ')}</p>}
              <div className={g.dayActions}>
                <button type="button" className={g.navLink} onClick={() => onOpenDay(p.day.id)}>
                  查看当天行程
                  <Icon name="ChevronRight" size="sm" />
                </button>
                {edit && (
                  <button type="button" className={g.tool} aria-pressed={p.hidden} onClick={() => onHidden(p.day.id, !p.hidden)}>
                    <Icon name={p.hidden ? 'Eye' : 'EyeOff'} size="sm" />
                    {p.hidden ? '显示这一天' : '不显示这一天'}
                  </button>
                )}
              </div>
              {edit && p.hidden && <p className={g.warn}>这一天不会出现在每日精选里，行程本身不受影响。</p>}
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}
