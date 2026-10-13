import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import {
  addDoc, addExpense, lockDoc, openLockedDoc, saveImport, setItemChecked, setItemStatus, shiftTripStart, unlockDoc,
} from '../db/repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const tripId = await saveImport(parseMd(md), md);
  const items = await db.items.where('tripId').equals(tripId).toArray();
  return { tripId, items };
}

describe('repo v2', () => {
  it('import stores budget; status and checks live together', async () => {
    const { tripId, items } = await seed();
    expect((await db.trips.get(tripId))!.budget).toBe(800000);
    const spot = items.find((i) => i.title === '小樽运河')!;
    await setItemChecked(tripId, spot.key, ['音乐盒堂']);
    await setItemStatus(tripId, spot.key, 'done');
    expect(await db.itemStates.get([tripId, spot.key])).toMatchObject({ status: 'done', checked: ['音乐盒堂'] });
  });

  it('re-import keeps budget the user did not override and keeps checks', async () => {
    const { tripId, items } = await seed();
    const spot = items.find((i) => i.title === '小樽运河')!;
    await setItemChecked(tripId, spot.key, ['音乐盒堂']);
    const md2 = md.replace('- 预算: 8000\n', '');
    await saveImport(parseMd(md2), md2, tripId);
    expect((await db.trips.get(tripId))!.budget).toBe(800000);
    expect((await db.itemStates.get([tripId, spot.key]))!.checked).toEqual(['音乐盒堂']);
  });

  it('shift start date moves days, lodging and every key-bound record', async () => {
    const { tripId, items } = await seed();
    const flight = items.find((i) => i.title === '吉隆坡 → 新千岁')!;
    await setItemStatus(tripId, flight.key, 'done');
    const docId = await addDoc({ tripId, blob: new Blob(['x']), title: 'eticket.pdf', kind: 'flight', itemKeys: [flight.key] });
    await addExpense({ tripId, date: '2027-01-13', amount: 1000, title: '机票', category: 'flight', itemKey: flight.key });
    await shiftTripStart(tripId, '2027-02-01');
    const trip = (await db.trips.get(tripId))!;
    expect([trip.startDate, trip.endDate]).toEqual(['2027-02-01', '2027-02-04']);
    const days = (await db.days.where('tripId').equals(tripId).sortBy('index')).map((d) => d.date);
    expect(days).toEqual(['2027-02-01', '2027-02-02', '2027-02-03', '2027-02-04']);
    const moved = (await db.items.get(flight.id))!;
    expect(moved.key.startsWith('2027-02-01|flight|')).toBe(true);
    expect((await db.itemStates.get([tripId, moved.key]))!.status).toBe('done');
    expect((await db.docs.get(docId))!.itemKeys).toEqual([moved.key]);
    expect((await db.expenses.where('tripId').equals(tripId).first())!.itemKey).toBe(moved.key);
    const lodging = (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.type === 'lodging')!;
    expect(lodging.lodging).toMatchObject({ checkIn: '2027-02-01', checkOut: '2027-02-03' });
  });

  it('lock / open / unlock a proof', async () => {
    const { tripId } = await seed();
    const docId = await addDoc({ tripId, blob: new Blob(['secret'], { type: 'text/plain' }), title: 'p.txt', kind: 'other', itemKeys: [], password: 'abcd' });
    const doc = (await db.docs.get(docId))!;
    expect(doc.lock).toBeDefined();
    expect(doc.mime).toBe('text/plain');
    await expect(openLockedDoc(docId, 'nope')).rejects.toThrow();
    expect(await (await openLockedDoc(docId, 'abcd')).text()).toBe('secret');
    await unlockDoc(docId, 'abcd');
    expect((await db.docs.get(docId))!.lock).toBeUndefined();
    await lockDoc(docId, 'efgh');
    expect(await (await openLockedDoc(docId, 'efgh')).text()).toBe('secret');
  });
});

import Dexie from 'dexie';
describe('Dexie v1 → v2 upgrade', () => {
  it('moves v1 meta into typed fields and adds the expenses table', async () => {
    db.close();
    await Dexie.delete('travel-rundown');
    const old = new Dexie('travel-rundown');
    old.version(1).stores({
      trips: 'id', days: 'id, tripId, date', items: 'id, dayId, key, tripId', docs: 'id, tripId, *itemKeys',
      blobs: 'key', itemStates: '[tripId+itemKey], tripId', settings: 'id',
    });
    await old.table('items').put({ id: 'i1', key: 'k', tripId: 't', dayId: 'd', order: 0, type: 'flight', title: 'F', meta: { 航班号: 'NH 844', 备注2: 'x' } });
    old.close();
    await db.open();
    const it = (await db.items.get('i1'))!;
    expect(it.flight).toEqual({ number: 'NH 844' });
    expect(it.meta).toEqual({ 备注2: 'x' });
    expect(await db.expenses.count()).toBe(0);
  });
});
