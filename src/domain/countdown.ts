// 修订 2026-10 · ISSUE-002：出发倒计时。
// 出发时刻 = 出发日 + 出发时间（没填按 00:00），时区 = 出发地时区（Trip.homeTz）。
import type { Trip } from './types';

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
}

export function departureOf(trip: Pick<Trip, 'startDate' | 'homeTz' | 'departTime'>): Departure {
  const time = trip.departTime && /^\d{2}:\d{2}$/.test(trip.departTime) ? trip.departTime : '00:00';
  const tz = trip.homeTz || 'UTC';
  if (!trip.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)) return { time, tz, assumed: !trip.departTime };
  const at = zonedToUtc(trip.startDate, time, tz);
  return { at: Number.isFinite(at) ? at : undefined, time, tz, assumed: !trip.departTime };
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
