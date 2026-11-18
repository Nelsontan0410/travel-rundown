// 修订 2026-10 · ISSUE-002：出发倒计时。
// 出发时刻 = 出发日 + 出发时间（没填按 00:00），时区 = 出发地时区（Trip.homeTz）。
// 2026-11-18：出发时间自动取机票 —— 填了机票倒数就用它的起飞时刻；否则手动填的出发时间；
// 再否则第一天第一个航班的开始时间；都没有才按 00:00。
import type { Day, Item, Trip } from './types';
import { localTime, validFlightSettings } from './flightCountdown';

/** 某时区某天某时刻对应的 UTC 毫秒（处理夏令时：用该时刻在该时区的实际偏移校正两次） */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (![y, mo, d, h, mi].every(Number.isFinite)) return NaN;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = (t: number) => {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      const o: Record<string, number> = {};
      for (const p of f.formatToParts(new Date(t))) if (p.type !== 'literal') o[p.type] = Number(p.value);
      return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - t;
    } catch {
      return 0;
    }
  };
  let t = guess - off(guess);
  t = guess - off(t);
  return t;
}

export interface Departure {
  /** 出发时刻（UTC 毫秒）；没有出发日期时为 undefined */
  at?: number;
  time: string;
  tz: string;
  /** 没填出发时间，按 00:00 计算 */
  assumed: boolean;
  /** 出发时间从哪来：机票倒数 / 手动填写 / 第一天的航班 / 按 00:00 */
  source: 'flight' | 'manual' | 'item' | 'assumed';
}

const HHMM = /^\d{2}:\d{2}$/;

/** 第一天（出发日）第一个有开始时间的航班的开始时间 */
export function firstDayFlightTime(trip: Pick<Trip, 'startDate'>, days: Pick<Day, 'id' | 'date' | 'index'>[], items: Pick<Item, 'dayId' | 'type' | 'start'>[]): string | undefined {
  const first = days.find((d) => d.date === trip.startDate) ?? [...days].sort((a, b) => a.index - b.index)[0];
  if (!first) return undefined;
  return items.find((i) => i.dayId === first.id && i.type === 'flight' && i.start && HHMM.test(i.start))?.start;
}

export function departureOf(
  trip: Pick<Trip, 'startDate' | 'homeTz' | 'departTime'> & Partial<Pick<Trip, 'flightCountdown'>>,
  firstFlight?: string,
): Departure {
  const fc = trip.flightCountdown;
  if (validFlightSettings(fc)) {
    return { at: fc.departureAt, time: localTime(fc.departureAt, fc.departureTz).slice(11), tz: fc.departureTz, assumed: false, source: 'flight' };
  }
  const tz = trip.homeTz || 'UTC';
  const manual = trip.departTime && HHMM.test(trip.departTime) ? trip.departTime : undefined;
  const fromItem = firstFlight && HHMM.test(firstFlight) ? firstFlight : undefined;
  const time = manual ?? fromItem ?? '00:00';
  const source: Departure['source'] = manual ? 'manual' : fromItem ? 'item' : 'assumed';
  const assumed = source === 'assumed';
  if (!trip.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)) return { time, tz, assumed, source };
  const at = zonedToUtc(trip.startDate, time, tz);
  return { at: Number.isFinite(at) ? at : undefined, time, tz, assumed, source };
}

/** 页面用：整份旅程的出发时刻 */
export function departureOfTrip(td: { trip: Parameters<typeof departureOf>[0]; days: Pick<Day, 'id' | 'date' | 'index'>[]; items: Pick<Item, 'dayId' | 'type' | 'start'>[] }): Departure {
  return departureOf(td.trip, firstDayFlightTime(td.trip, td.days, td.items));
}

/** 出发时间的说明文字（倒数下方、设置页） */
export function departureLabel(d: Departure): string {
  if (d.source === 'flight') return `跟随机票：${d.time}（${d.tz}）`;
  if (d.source === 'item') return `跟随第一天航班：${d.time}（${d.tz}）`;
  if (d.source === 'manual') return `${d.time}（${d.tz}）`;
  return `未设置，按 00:00（${d.tz}）倒数`;
}

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 已经到出发时刻 */
  started: boolean;
}

/** 剩余时间拆成天 / 时 / 分 / 秒；到点后全部为 0，不出现负数 */
export function remaining(at: number | undefined, now: number): Remaining | undefined {
  if (at === undefined || !Number.isFinite(at)) return undefined;
  const ms = Math.max(0, at - now);
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    started: ms === 0,
  };
}
