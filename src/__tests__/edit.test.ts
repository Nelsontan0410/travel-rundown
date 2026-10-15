// 2026-10-15：导入后在 App 里编辑行程
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, addExpense, addItem, deleteItem, moveItem, saveImport, setItemStatus, updateDay, updateItem, updateTripInfo } from '../db/repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const tripId = await saveImport(parseMd(md), md);
  const days = (await db.days.where('tripId').equals(tripId).toArray()).sort((a, b) => a.index - b.index);
  const items = async () => (await db.items.where('tripId').equals(tripId).toArray()).sort((a, b) => a.order - b.order);
  return { tripId, days, items };
}

describe('编辑行程', () => {
  it('改标题：key 按规则重算，完成状态、证明、账本跟着走；sourceMd 写回且能重新读出', async () => {
    const { tripId, items } = await seed();
    const canal = (await items()).find((i) => i.title === '小樽运河')!;
    await setItemStatus(tripId, canal.key, 'done');
    await addDoc({ tripId, title: '门票', kind: 'ticket', blob: new Blob(['x'], { type: 'image/png' }), itemKeys: [canal.key] });
    await addExpense({ tripId, date: '2027-01-14', amount: 100, title: '咖啡', category: 'meal', itemKey: canal.key });
    await updateItem(canal.id, { title: '小樽运河散步', place: { name: '小樽运河', localName: '小樽運河' }, mustDo: ['音乐盒堂', ''] });
    const after = (await db.items.get(canal.id))!;
    expect(after.key).toBe('2027-01-14|spot|小樽运河散步');
    expect(after.mustDo).toEqual(['音乐盒堂']);
    expect((await db.itemStates.get([tripId, after.key]))?.status).toBe('done');
    expect(await db.itemStates.get([tripId, canal.key])).toBeUndefined();
    expect((await db.docs.toArray())[0].itemKeys).toEqual([after.key]);
    expect((await db.expenses.toArray())[0].itemKey).toBe(after.key);
    const trip = (await db.trips.get(tripId))!;
    expect(trip.sourceMd).toContain('### [spot] 10:00-15:00 小樽运河散步');
    const re = parseMd(trip.sourceMd);
    expect(re.days.flatMap((d) => d.items).map((i) => i.key)).toContain(after.key);
    // 原文行号指向新写的 MD
    expect(trip.sourceMd.split('\n')[after.src!.from - 1]).toContain('小樽运河散步');
  });

  it('改时间会按时间重新排序；换类型时清掉不属于它的字段', async () => {
    const { days, items } = await seed();
    const d2 = (await items()).filter((i) => i.dayId === days[1].id);
    const breakfast = d2[0];
    await updateItem(breakfast.id, { start: '13:00', end: undefined });
    const order = (await items()).filter((i) => i.dayId === days[1].id).map((i) => i.title);
    expect(order).toEqual(['小樽运河', '三角市场海鲜丼', '酒店早餐']);
    await updateItem(breakfast.id, { type: 'spot' });
    const b = (await db.items.get(breakfast.id))!;
    expect(b.meal).toBeUndefined();
    expect(b.key).toBe('2027-01-14|spot|酒店早餐');
  });

  it('换到另一天、上下移动、新增、删除', async () => {
    const { tripId, days, items } = await seed();
    const curry = (await items()).find((i) => i.title === '汤咖喱晚餐')!;
    await updateItem(curry.id, { dayId: days[2].id });
    expect((await db.items.get(curry.id))!.key.startsWith('2027-01-15|meal|')).toBe(true);
    const id = await addItem(tripId, days[2].id, { type: 'spot', title: '大通公园', start: '09:00' });
    let d3 = (await items()).filter((i) => i.dayId === days[2].id).map((i) => i.title);
    expect(d3[0]).toBe('大通公园');
    expect((await db.items.get(id))!.place).toEqual({ name: '大通公园' });
    await moveItem(id, 1);
    d3 = (await items()).filter((i) => i.dayId === days[2].id).map((i) => i.title);
    expect(d3[1]).toBe('大通公园');
    const it = (await db.items.get(id))!;
    await setItemStatus(tripId, it.key, 'done');
    await deleteItem(id);
    expect(await db.items.get(id)).toBeUndefined();
    expect(await db.itemStates.get([tripId, it.key])).toBeUndefined();
    expect((await db.trips.get(tripId))!.sourceMd).not.toContain('大通公园');
  });

  it('同日重名：按顺序重新编号，绑定跟着正确的那一项', async () => {
    const { tripId, days } = await seed();
    const a = await addItem(tripId, days[3].id, { type: 'note', title: '提醒', start: '07:00' });
    const b = await addItem(tripId, days[3].id, { type: 'note', title: '提醒', start: '08:00' });
    const keyB = (await db.items.get(b))!.key;
    expect(keyB.endsWith('#2')).toBe(true);
    await setItemStatus(tripId, keyB, 'done');
    await deleteItem(a);
    const nb = (await db.items.get(b))!;
    expect(nb.key.endsWith('#2')).toBe(false);
    expect((await db.itemStates.get([tripId, nb.key]))?.status).toBe('done');
  });

  it('改当天主题、城市、旅程名称都写回 MD', async () => {
    const { tripId, days } = await seed();
    await updateDay(days[0].id, { title: '抵达', city: '千岁', note: '' });
    await updateTripInfo(tripId, { title: '北海道冬季，日本' });
    const t = (await db.trips.get(tripId))!;
    expect(t.title).toBe('北海道冬季，日本');
    expect(t.sourceMd).toContain('# 北海道冬季，日本');
    expect(t.sourceMd).toContain('## Day 1 | 13-01-2027 | 千岁 | Asia/Tokyo | 抵达');
  });
});
