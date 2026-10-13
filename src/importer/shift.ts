// 导入预览里用日历改出发日期：整份草稿平移，key 按新日期重算（和 parseMd 同一套规则）。
import type { ParseResult } from './parseMd';
import { addDays, daysBetween } from '../domain/format';
import { makeItemKey } from '../domain/itemKey';

export function shiftDraft(r: ParseResult, newStart: string): ParseResult {
  if (!r.trip.startDate || !newStart) return r;
  const delta = daysBetween(r.trip.startDate, newStart);
  if (!delta) return r;
  const used = new Set<string>();
  const sh = (d?: string) => (d ? addDays(d, delta) : d);
  return {
    ...r,
    trip: { ...r.trip, startDate: sh(r.trip.startDate)!, endDate: sh(r.trip.endDate)! },
    days: r.days.map((d) => {
      const date = sh(d.date)!;
      return {
        ...d,
        date,
        items: d.items.map((it) => ({
          ...it,
          key: makeItemKey(date, it.type, it.title, used),
          ...(it.lodging ? { lodging: { ...it.lodging, checkIn: sh(it.lodging.checkIn), checkOut: sh(it.lodging.checkOut) } } : {}),
        })),
      };
    }),
  };
}
