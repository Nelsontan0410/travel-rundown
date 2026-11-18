// 修订 2026-10 · ISSUE-002 倒计时 / ISSUE-003 打卡排序
import { describe, expect, it } from 'vitest';
import { departureLabel, departureOf, departureOfTrip, remaining, zonedToUtc } from '../domain/countdown';
import { checklistOrder } from '../domain/checklist';

describe('出发倒计时', () => {
  it('按出发地时区换算', () => {
    expect(zonedToUtc('2027-01-10', '00:00', 'Asia/Singapore')).toBe(Date.UTC(2027, 0, 9, 16, 0));
    expect(zonedToUtc('2027-01-10', '22:30', 'Asia/Kuala_Lumpur')).toBe(Date.UTC(2027, 0, 10, 14, 30));
    // 夏令时：纽约 7 月是 UTC-4
    expect(zonedToUtc('2027-07-01', '09:00', 'America/New_York')).toBe(Date.UTC(2027, 6, 1, 13, 0));
  });
  it('没填出发时间按 00:00，并标明是默认值', () => {
    const d = departureOf({ startDate: '2027-01-10', homeTz: 'Asia/Singapore' });
    expect(d.assumed).toBe(true);
    expect(d.time).toBe('00:00');
    expect(departureOf({ startDate: '2027-01-10', homeTz: 'Asia/Singapore', departTime: '21:45' }).assumed).toBe(false);
  });
  it('四个单位，跨日进位，到点归零不出现负数', () => {
    const at = Date.UTC(2027, 0, 10);
    expect(remaining(at, at - ((87 * 24 + 12) * 3600 + 35 * 60 + 48) * 1000)).toEqual({ days: 87, hours: 12, minutes: 35, seconds: 48, started: false });
    expect(remaining(at, at - 1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1, started: false });
    expect(remaining(at, at - 86400000)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0, started: false });
    expect(remaining(at, at + 5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, started: true });
  });
  it('缺日期不产生 NaN', () => {
    expect(departureOf({ startDate: '', homeTz: 'Asia/Singapore' }).at).toBeUndefined();
    expect(remaining(undefined, Date.now())).toBeUndefined();
    expect(remaining(NaN, Date.now())).toBeUndefined();
  });
});

describe('每日打卡排序', () => {
  const items = [
    { key: 'a', order: 0 },
    { key: 'b', order: 1 },
    { key: 'c', order: 2 },
    { key: 'd', order: 3 },
  ];
  it('完成的移到底部，未完成保持原顺序', () => {
    const done = new Set(['a']);
    const r = checklistOrder(items, (k) => (done.has(k) ? 'done' : 'todo'));
    expect(r.open.map((i) => i.key)).toEqual(['b', 'c', 'd']);
    expect(r.done.map((i) => i.key)).toEqual(['a']);
  });
  it('取消完成回到原位；跳过的不算完成', () => {
    const st: Record<string, 'done' | 'todo' | 'skipped'> = { a: 'done', c: 'skipped' };
    const r = checklistOrder([...items].reverse(), (k) => st[k] ?? 'todo');
    expect(r.open.map((i) => i.key)).toEqual(['b', 'c', 'd']);
    st.a = 'todo';
    expect(checklistOrder(items, (k) => st[k] ?? 'todo').open.map((i) => i.key)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('出发时间跟随机票（2026-11-18）', () => {
  const days = [{ id: 'd1', date: '2027-01-10', index: 0 }, { id: 'd2', date: '2027-01-11', index: 1 }];
  const items = [
    { dayId: 'd2', type: 'flight' as const, start: '08:00' },
    { dayId: 'd1', type: 'spot' as const, start: '06:00' },
    { dayId: 'd1', type: 'flight' as const, start: '14:35' },
  ];
  const base = { startDate: '2027-01-10', homeTz: 'Asia/Singapore' };
  it('填了机票倒数：用机票的起飞时刻和时区，优先于手动时间', () => {
    const departureAt = Date.UTC(2027, 0, 10, 1, 5); // 新加坡 09:05
    const fc = { origin: 'SG', destination: 'JP', departureAt, returnAt: departureAt + 86400000 * 9, departureTz: 'Asia/Singapore', returnTz: 'Asia/Tokyo' };
    const d = departureOfTrip({ trip: { ...base, departTime: '21:45', flightCountdown: fc }, days, items });
    expect(d).toMatchObject({ at: departureAt, time: '09:05', tz: 'Asia/Singapore', source: 'flight', assumed: false });
    expect(departureLabel(d)).toBe('跟随机票：09:05（Asia/Singapore）');
  });
  it('没机票倒数：手动时间 > 第一天航班 > 00:00', () => {
    expect(departureOfTrip({ trip: { ...base, departTime: '21:45' }, days, items }).source).toBe('manual');
    const d = departureOfTrip({ trip: base, days, items });
    expect(d).toMatchObject({ time: '14:35', source: 'item', assumed: false, at: Date.UTC(2027, 0, 10, 6, 35) });
    expect(departureOfTrip({ trip: base, days, items: items.slice(0, 2) }).source).toBe('assumed');
  });
});
