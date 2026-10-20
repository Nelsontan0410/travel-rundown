// 审查修复 #4（2026-10-21）：主用户只调整了项目顺序，也要算一次改动，同伴套用后顺序一致
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { moveItem, saveImport, updateItem } from '../db/repo';
import { setBackend } from '../cloud/backend';
import { applyUpdate, enableSync, joinWithCode, pendingChanges, previewUpdate, publishUpdate } from '../cloud/sync';
import { fakeCloud, type FakeCloud } from './cloudFake';

const devices = new Map<string, Record<string, unknown[]>>();
let current: string | undefined;
async function useDevice(name: string) {
  if (current) {
    const dump: Record<string, unknown[]> = {};
    for (const t of db.tables) dump[t.name] = await t.toArray();
    devices.set(current, dump);
  }
  for (const t of db.tables) await t.clear();
  const next = devices.get(name);
  if (next) for (const t of db.tables) await t.bulkPut(next[t.name] as never[]);
  current = name;
}

let cloud: FakeCloud;
let code = '';
beforeEach(async () => {
  devices.clear();
  current = undefined;
  for (const t of db.tables) await t.clear();
  cloud = fakeCloud();
  setBackend(cloud);
});

async function setup() {
  await useDevice('owner');
  cloud.as('owner-phone');
  const tripId = await saveImport(parseMd(md), md);
  await enableSync(tripId, '阿权');
  code = await cloud.createInvite(tripId, '小明');
  await useDevice('mate');
  cloud.as('mate-phone');
  await joinWithCode(code, '小明');
  return tripId;
}

/** 第一个至少有 3 项的那一天，按顺序的项目 id */
async function busyDay(tripId: string) {
  const days = await db.days.where('tripId').equals(tripId).sortBy('index');
  for (const d of days) {
    const its = (await db.items.where('dayId').equals(d.id).toArray()).sort((a, b) => a.order - b.order);
    if (its.length >= 3) return { day: d, ids: its.map((i) => i.id) };
  }
  throw new Error('样例里没有 3 项以上的一天');
}
const orderOf = async (dayId: string) => (await db.items.where('dayId').equals(dayId).toArray()).sort((a, b) => a.order - b.order).map((i) => i.id);

describe('#4 只调整顺序也要同步', () => {
  it('主用户交换两项 → 有未发布改动 → 同伴预览看得到 → 套用后顺序一致', async () => {
    const tripId = await setup();
    await useDevice('owner');
    cloud.as('owner-phone');
    const { day, ids } = await busyDay(tripId);
    await moveItem(ids[1], -1);
    const ownerOrder = await orderOf(day.id);
    expect(ownerOrder.slice(0, 2)).toEqual([ids[1], ids[0]]);

    const pending = await pendingChanges(tripId);
    expect(pending.count).toBeGreaterThan(0);
    expect(pending.days).toContainEqual({ index: day.index, fields: ['项目顺序'] });
    await publishUpdate(tripId, '换顺序', false);

    await useDevice('mate');
    cloud.as('mate-phone');
    const pv = (await previewUpdate(tripId))!;
    expect(pv.diff.days).toContainEqual({ index: day.index, fields: ['项目顺序'] });
    expect(pv.conflicts).toEqual([]);
    await applyUpdate(tripId, pv);
    expect(await orderOf(day.id)).toEqual(ownerOrder);
  });

  it('同伴改过其中一项的内容：内容保留，没改过的项仍按主用户的新顺序', async () => {
    const tripId = await setup();
    const { day, ids } = await busyDay(tripId);
    await updateItem(ids[2], { note: '同伴自己的备注' });
    await useDevice('owner');
    cloud.as('owner-phone');
    await moveItem(ids[1], -1);
    const ownerOrder = await orderOf(day.id);
    await publishUpdate(tripId, '换顺序', false);
    await useDevice('mate');
    cloud.as('mate-phone');
    const pv = (await previewUpdate(tripId))!;
    await applyUpdate(tripId, pv);
    expect(await orderOf(day.id)).toEqual(ownerOrder);
    expect((await db.items.get(ids[2]))!.note).toBe('同伴自己的备注');
  });

  it('主用户没动顺序：同伴自己排的顺序照旧保留；插入新项导致的重新编号不算顺序改动', async () => {
    const tripId = await setup();
    const { day, ids } = await busyDay(tripId);
    await moveItem(ids[2], -1);
    const mateOrder = await orderOf(day.id);
    await useDevice('owner');
    cloud.as('owner-phone');
    await updateItem(ids[0], { note: '主用户改了备注' });
    const pending = await pendingChanges(tripId);
    expect(pending.days.some((d) => d.fields.includes('项目顺序'))).toBe(false);
    await publishUpdate(tripId, '改备注', false);
    await useDevice('mate');
    cloud.as('mate-phone');
    await applyUpdate(tripId, (await previewUpdate(tripId))!);
    expect(await orderOf(day.id)).toEqual(mateOrder);
  });
});
