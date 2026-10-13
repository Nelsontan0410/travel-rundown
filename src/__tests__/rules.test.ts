import { describe, expect, it } from 'vitest';
import { rightSlot, currentItemId, bookingStatusOf, bookingSubtitle, itemIcon, itemSubtitle } from '../domain/rules';
import { fmtDateRange, utcOffsetLabel } from '../domain/format';
import type { Day, Item } from '../domain/types';

const base: Item = { id: '1', key: 'k', tripId: 't', dayId: 'd', order: 0, type: 'spot', title: 'x' };

describe('rightSlot（01 右侧槽五种情形）', () => {
  it('已完成', () => expect(rightSlot(base, 'done', 0)).toEqual({ kind: 'chip', variant: 'success', label: '已完成' }));
  it('已跳过', () => expect(rightSlot(base, 'skipped', 0)).toEqual({ kind: 'chip', variant: 'neutral', label: '已跳过' }));
  it('已预订', () => expect(rightSlot({ ...base, bookingRef: 'A', navUrl: 'https://x' }, 'todo', 0)).toMatchObject({ label: '已预订' }));
  it('导航按钮', () => expect(rightSlot({ ...base, navUrl: 'https://x' }, 'todo', 0)).toEqual({ kind: 'nav' }));
  it('待完成', () => expect(rightSlot(base, 'todo', 0)).toMatchObject({ label: '待完成' }));
});

describe('currentItemId', () => {
  const day: Day = { id: 'd', tripId: 't', index: 1, date: '2027-01-13', tz: 'Asia/Tokyo', city: '' };
  const items: Item[] = ['11:30', '13:00', '15:00', '18:00'].map((s, i) => ({ ...base, id: String(i), key: String(i), start: s }));
  const at = (iso: string) => new Date(iso);
  it('last item started', () => expect(currentItemId(day, items, () => 'todo', at('2027-01-13T15:30:00+09:00'))).toBe('2'));
  it('before first → first todo', () =>
    expect(currentItemId(day, items, (k) => (k === '0' ? 'done' : 'todo'), at('2027-01-13T08:00:00+09:00'))).toBe('1'));
  it('other day → none', () => expect(currentItemId(day, items, () => 'todo', at('2027-01-14T10:00:00+09:00'))).toBeUndefined());
});

describe('misc', () => {
  it('booking status default', () => {
    expect(bookingStatusOf(base, 1)).toBe('confirmed');
    expect(bookingStatusOf(base, 0)).toBe('pending');
    expect(bookingStatusOf({ ...base, bookingStatus: 'pending' }, 2)).toBe('pending');
  });
  it('date range', () => {
    expect(fmtDateRange('2027-01-13', '2027-01-22')).toBe('13-JAN — 22-JAN-2027');
    expect(fmtDateRange('2026-12-30', '2027-01-02')).toBe('30-DEC-2026 — 2-JAN-2027');
  });
  it('utc offset', () => expect(utcOffsetLabel('Asia/Tokyo')).toBe('UTC+9'));
  it('subtitle & icons', () => {
    expect(itemSubtitle({ ...base, type: 'transit', toPlace: { name: '前往温泉区' } })).toBe('交通 · 前往温泉区');
    expect(itemSubtitle({ ...base, note: '自助晚餐' })).toBe('备注: 自助晚餐');
    expect(itemIcon({ ...base, title: '酒店晚餐' })).toBe('Utensils');
    expect(itemIcon({ ...base, type: 'transit', meta: { 线路: '地铁银座线' } })).toBe('TrainFront');
  });
  it('booking subtitle', () => {
    const day: Day = { id: 'd', tripId: 't', index: 1, date: '2027-01-13', tz: 'Asia/Tokyo', city: '' };
    expect(bookingSubtitle({ ...base, type: 'flight', end: '11:30' }, day)).toBe('13-JAN · 11:30 到达');
    expect(bookingSubtitle({ ...base, type: 'lodging', meta: { 退房日期: '2027-01-14' } }, day)).toBe('13-JAN — 14-JAN');
    expect(bookingSubtitle({ ...base, type: 'spot' }, day)).toBe('13-JAN · 时间待定');
  });
});
