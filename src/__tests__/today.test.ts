// 2026-10 第一批 ⑤：「今天」页
import { describe, expect, it } from 'vitest';
import { fmtLate, lateBy, lodgingTonight, nextItem, pickToday, scheduledNow } from '../domain/today';
import type { Day, Item } from '../domain/types';

const day = (index: number, date: string): Day => ({ id: `d${index}`, tripId: 't', index, date, tz: 'Asia/Tokyo', city: '札幌' });
const days = [day(1, '2027-01-13'), day(2, '2027-01-14'), day(3, '2027-01-15')];
const item = (key: string, over: Partial<Item> = {}): Item => ({ id: key, key, tripId: 't', dayId: 'd2', order: 0, type: 'spot', title: key, ...over });
// 东京 2027-01-14 10:30 = UTC 01:30
const at = new Date(Date.UTC(2027, 0, 14, 1, 30));

describe('今天', () => {
  it('行程中显示今天，出发前 Day 1，结束后最后一天', () => {
    expect(pickToday(days, at)).toMatchObject({ mode: 'today', day: { index: 2 } });
    expect(pickToday(days, new Date(Date.UTC(2026, 11, 1)))).toMatchObject({ mode: 'before', day: { index: 1 } });
    expect(pickToday(days, new Date(Date.UTC(2027, 1, 1)))).toMatchObject({ mode: 'after', day: { index: 3 } });
  });

  it('下一项不按时间自动跳过：按顺序取第一个待完成，备注不算', () => {
    const items = [item('note', { type: 'note' }), item('a', { start: '09:00' }), item('b', { start: '12:00' })];
    const st = new Map([['a', 'todo']]);
    expect(nextItem(items, (k) => (st.get(k) as never) ?? 'todo')?.key).toBe('a'); // 已经 10:30，a 还没点完成，仍是下一项
    expect(nextItem(items, (k) => (k === 'a' ? 'skipped' : 'todo'))?.key).toBe('b');
    expect(nextItem(items, () => 'done')).toBeUndefined();
  });

  it('原定时间提示：晚了多久、按时间现在应在哪一项', () => {
    expect(lateBy(days[1], { start: '09:00' }, at)).toBe(90);
    expect(lateBy(days[1], { start: '11:00' }, at)).toBeUndefined();
    expect(lateBy(days[0], { start: '09:00' }, at)).toBeUndefined();
    expect(fmtLate(90)).toBe('已过 1 小时 30 分');
    expect(fmtLate(45)).toBe('已过 45 分钟');
    const items = [item('a', { start: '09:00' }), item('b', { start: '10:00' }), item('c', { start: '12:00' })];
    expect(scheduledNow(days[1], items, at)?.key).toBe('b');
    expect(scheduledNow(days[0], items, at)).toBeUndefined();
  });

  it('今晚住哪里：入住日到退房前一晚', () => {
    const hotel = item('h', { type: 'lodging', dayId: 'd1', lodging: { checkIn: '2027-01-13', checkOut: '2027-01-15' } });
    const one = item('o', { type: 'lodging', dayId: 'd3' });
    const dd = (it: Item) => days.find((d) => d.id === it.dayId)!.date;
    expect(lodgingTonight('2027-01-13', [hotel, one], dd)?.key).toBe('h');
    expect(lodgingTonight('2027-01-14', [hotel, one], dd)?.key).toBe('h');
    expect(lodgingTonight('2027-01-15', [hotel, one], dd)?.key).toBe('o');
    expect(lodgingTonight('2027-01-16', [hotel, one], dd)).toBeUndefined();
  });
});
