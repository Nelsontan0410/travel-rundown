// 2026-10 第一批 ④：衣橱、每日穿搭、打包清单
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import {
  addGarment, addPackItems, deleteGarment, deletePackItem, deleteTrip, exportTripPackage, restoreBackupDetailed, saveImport, setOutfit, setPacked,
  shiftTripStart, tripPackageInfo, updateGarment,
} from '../db/repo';
import { dayList, packingList, PACK_PRESETS } from '../domain/packing';
import type { Garment } from '../domain/types';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const g = (id: string, category: Garment['category'], name = id): Garment => ({ id, name, category, createdAt: '', updatedAt: '' });

describe('打包清单（纯函数）', () => {
  const garments = new Map([g('coat', 'outer', '羽绒外套'), g('t1', 'top'), g('t2', 'top'), g('jeans', 'bottom')].map((x) => [x.id, x]));
  const days = [1, 2, 3, 4].map((index) => ({ index }));
  const outfits = [
    { tripId: 't', dayIndex: 1, garmentIds: ['coat', 't1', 'jeans'], updatedAt: '' },
    { tripId: 't', dayIndex: 2, garmentIds: ['coat', 't2', 'jeans'], updatedAt: '' },
    { tripId: 't', dayIndex: 3, garmentIds: ['coat', 'gone'], updatedAt: '' },
  ];
  it('同一件衣服只出现一次，并列出穿的是哪几天', () => {
    const l = packingList(days, outfits, garments, [], new Set(['garment:coat']));
    expect(l.clothes.map((c) => c.garment.id)).toEqual(['coat', 't1', 't2', 'jeans']);
    expect(l.clothes[0]).toMatchObject({ days: [1, 2, 3], packed: true });
    expect(dayList(l.clothes[0].days)).toBe('Day 1、2、3');
    expect(l.unplanned).toEqual([4]);
    expect(l).toMatchObject({ packed: 1, total: 4 });
  });
  it('其他物品按分组，计入进度', () => {
    const items = [{ id: 'a', tripId: 't', name: '护照', group: 'docs' as const, createdAt: '1' }];
    const l = packingList(days, [], garments, items, new Set(['item:a']));
    expect(l.groups).toEqual([{ group: 'docs', rows: [{ item: items[0], packed: true }] }]);
    expect(l).toMatchObject({ packed: 1, total: 1, unplanned: [1, 2, 3, 4] });
  });
  it('超出行程天数的穿搭不算（重新导入后天数变少）', () => {
    const l = packingList([{ index: 1 }], outfits, garments, [], new Set());
    expect(l.clothes.map((c) => c.garment.id)).toEqual(['coat', 't1', 'jeans']);
  });
});

describe('衣橱与穿搭（数据库）', () => {
  it('删除单品：所有穿搭里拿掉，打包勾选清掉，照片删掉', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const coat = await addGarment({ name: ' 羽绒外套 ', category: 'outer', photo: new Blob(['jpg'], { type: 'image/jpeg' }) });
    const tee = await addGarment({ name: 'T 恤', category: 'top' });
    expect((await db.garments.get(coat))?.name).toBe('羽绒外套');
    await setOutfit(tripId, 1, [coat, tee, coat]);
    expect((await db.outfits.get([tripId, 1]))?.garmentIds).toEqual([coat, tee]);
    await setPacked(tripId, `garment:${coat}`, true);
    await deleteGarment(coat);
    expect((await db.outfits.get([tripId, 1]))?.garmentIds).toEqual([tee]);
    expect(await db.packChecks.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });

  it('改照片 / 删照片', async () => {
    const id = await addGarment({ name: '帽子', category: 'accessory' });
    await updateGarment(id, { note: '红色' }, new Blob(['x'], { type: 'image/png' }));
    expect((await db.garments.get(id))).toMatchObject({ note: '红色', photoBlobKey: `garment:${id}` });
    await updateGarment(id, { note: '' }, null);
    const after = (await db.garments.get(id))!;
    expect(after.photoBlobKey).toBeUndefined();
    expect(after.note).toBeUndefined();
    expect(await db.blobs.count()).toBe(0);
  });

  it('清空某天的穿搭就删掉记录；改出发日期不影响（按 Day 序号绑定）', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const tee = await addGarment({ name: 'T 恤', category: 'top' });
    await setOutfit(tripId, 2, [tee]);
    await shiftTripStart(tripId, '2027-02-01');
    expect((await db.outfits.get([tripId, 2]))?.garmentIds).toEqual([tee]);
    await setOutfit(tripId, 2, []);
    expect(await db.outfits.count()).toBe(0);
  });

  it('常用物品不重复加入；删物品连勾选一起删', async () => {
    const tripId = await saveImport(parseMd(md), md);
    expect(await addPackItems(tripId, PACK_PRESETS.basic.rows)).toBe(PACK_PRESETS.basic.rows.length);
    expect(await addPackItems(tripId, PACK_PRESETS.basic.rows)).toBe(0);
    const it0 = (await db.packItems.toArray())[0];
    await setPacked(tripId, `item:${it0.id}`, true);
    await deletePackItem(it0.id);
    expect(await db.packChecks.count()).toBe(0);
  });

  it('旅行包带上穿搭、打包清单和用到的衣物（含照片）；删旅程保留衣橱', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const coat = await addGarment({ name: '外套', category: 'outer', photo: new Blob(['jpg!'], { type: 'image/jpeg' }) });
    await addGarment({ name: '没穿的', category: 'top' });
    await setOutfit(tripId, 1, [coat]);
    await addPackItems(tripId, [{ name: '护照', group: 'docs' }]);
    expect((await tripPackageInfo(tripId)).files).toBe(1);
    const zip = await exportTripPackage(tripId, { attachments: true });
    await Promise.all(db.tables.map((t) => t.clear()));
    await restoreBackupDetailed(zip);
    expect((await db.garments.toArray()).map((x) => x.name)).toEqual(['外套']);
    expect(await db.outfits.count()).toBe(1);
    expect(await db.packItems.count()).toBe(1);
    expect(await (await db.blobs.get(`garment:${coat}`))!.blob.text()).toBe('jpg!');
    await deleteTrip(tripId);
    expect(await db.outfits.count()).toBe(0);
    expect(await db.packItems.count()).toBe(0);
    expect(await db.garments.count()).toBe(1);
  });
});
