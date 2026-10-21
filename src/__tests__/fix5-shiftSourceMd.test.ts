// 审查修复 #5（2026-10-21）：改出发日期后，原文（重新导入读的就是它）也要跟着改，确认重新导入不能把日期改回去
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, loadDiffOld, saveImport, setItemStatus, shiftTripStart } from '../db/repo';
import { diffImport, flattenParsed } from '../importer/diff';
import { addDays } from '../domain/format';
import hokkaido from '../../qa/fixtures/hokkaido.md?raw';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('#5 改出发日期同步原文', () => {
  it('改期 → 用原文重新导入：日期和页面一致，预览没有任何删除 / 新增，确认后不回退', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const before = (await db.trips.get(tripId))!;
    const newStart = addDays(before.startDate, 7);
    const spot = (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.title === '小樽运河')!;
    await setItemStatus(tripId, spot.key, 'done');
    const docId = await addDoc({ tripId, blob: new Blob(['x']), title: '门票', kind: 'ticket', itemKeys: [spot.key] });

    await shiftTripStart(tripId, newStart);
    const shifted = (await db.trips.get(tripId))!;
    expect(shifted.startDate).toBe(newStart);

    // 「重新导入」预填的就是 sourceMd
    const r = parseMd(shifted.sourceMd);
    expect(r.errors).toEqual([]);
    expect(r.trip.startDate).toBe(newStart);
    expect(r.trip.endDate).toBe(shifted.endDate);

    const d = diffImport(await loadDiffOld(tripId), flattenParsed(r.days));
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);

    await saveImport(r, shifted.sourceMd, tripId);
    const after = (await db.trips.get(tripId))!;
    expect(after.startDate).toBe(newStart);
    const days = await db.days.where('tripId').equals(tripId).sortBy('index');
    expect(days[0].date).toBe(newStart);
    // 完成状态和证明仍然挂在改期后的那一项上
    const moved = (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.title === '小樽运河')!;
    expect((await db.itemStates.get([tripId, moved.key]))?.status).toBe('done');
    expect((await db.docs.get(docId))!.itemKeys).toEqual([moved.key]);
  });

  it('改期后每一项的原文行号指向新原文里自己那一段', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const t = (await db.trips.get(tripId))!;
    await shiftTripStart(tripId, addDays(t.startDate, 3));
    const t2 = (await db.trips.get(tripId))!;
    const lines = t2.sourceMd.split('\n');
    for (const it of await db.items.where('tripId').equals(tripId).toArray()) {
      expect(it.src).toBeDefined();
      expect(lines.slice(it.src!.from - 1, it.src!.to).join('\n')).toContain(it.title);
    }
  });

  it('真实北海道行程：改期后原文重新解析，日期一致、没有删除 / 新增', async () => {
    const tripId = await saveImport(parseMd(hokkaido), hokkaido);
    const t = (await db.trips.get(tripId))!;
    await shiftTripStart(tripId, addDays(t.startDate, -10));
    const t2 = (await db.trips.get(tripId))!;
    const r = parseMd(t2.sourceMd);
    expect(r.trip.startDate).toBe(t2.startDate);
    const d = diffImport(await loadDiffOld(tripId), flattenParsed(r.days));
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});
