// 2026-10 第一批 ⑤：「今天」页的纯逻辑。
// 下一项不按时间自动判定完成：按顺序取第一个还没完成 / 跳过的项，由用户点「完成」或「跳过」推进；
// 时间只用来提示「原定几点、已经晚了多久」和「按原定时间现在应在哪一项」。
import { isToday } from './rules';
import { nowIn } from './format';
import type { Day, Item, ItemStatus } from './types';

export type TodayMode = 'today' | 'before' | 'after';

/** 默认显示哪一天：行程中 = 今天；还没出发 = Day 1；已经结束 = 最后一天 */
export function pickToday(days: Day[], at: Date = new Date()): { day?: Day; mode: TodayMode } {
  const t = days.find((d) => isToday(d, at));
  if (t) return { day: t, mode: 'today' };
  const first = days[0];
  if (!first) return { mode: 'before' };
  const localNow = nowIn(first.tz, at).date;
  return localNow < first.date ? { day: first, mode: 'before' } : { day: days[days.length - 1], mode: 'after' };
}

/** 下一项：按顺序第一个待完成的（「其他 / 备注」类不算） */
export function nextItem(items: Item[], statusOf: (key: string) => ItemStatus): Item | undefined {
  return items.find((it) => it.type !== 'note' && statusOf(it.key) === 'todo');
}

/** 比原定开始时间晚了多少分钟（只在当天、有开始时间、已经过了时才有） */
export function lateBy(day: Day, it: Pick<Item, 'start'>, at: Date = new Date()): number | undefined {
  if (!it.start || !isToday(day, at)) return undefined;
  const [h, m] = nowIn(day.tz, at).time.split(':').map(Number);
  const [sh, sm] = it.start.split(':').map(Number);
  const diff = h * 60 + m - (sh * 60 + sm);
  return diff > 0 ? diff : undefined;
}

/** 「按原定时间，现在应在」：开始时间不晚于现在的最后一项（只在当天） */
export function scheduledNow(day: Day, items: Item[], at: Date = new Date()): Item | undefined {
  if (!isToday(day, at)) return undefined;
  const t = nowIn(day.tz, at).time;
  let cur: Item | undefined;
  for (const it of items) if (it.type !== 'note' && it.start && it.start <= t) cur = it;
  return cur;
}

export function fmtLate(min: number): string {
  if (min < 60) return `已过 ${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `已过 ${h} 小时${m ? ` ${m} 分` : ''}`;
}

/**
 * 今晚住哪里：入住日 ≤ 这天 < 退房日 的住宿。
 * 没写入住日就用它所在那天；没写退房日就只算那一晚。
 */
export function lodgingTonight(date: string, items: Item[], dayDate: (it: Item) => string): Item | undefined {
  return items.find((it) => {
    if (it.type !== 'lodging') return false;
    const inD = it.lodging?.checkIn ?? dayDate(it);
    const outD = it.lodging?.checkOut;
    return outD ? inD <= date && date < outD : inD === date;
  });
}
