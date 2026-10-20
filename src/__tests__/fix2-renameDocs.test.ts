// 审查修复 #2（2026-10-21）：重新导入时确认改名，证明资料的关联要跟着迁到新 key（关联数量不变也要）
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, saveImport } from '../db/repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const tripId = await saveImport(parseMd(md), md);
  const items = await db.items.where('tripId').equals(tripId).toArray();
  const spot = items.find((i) => i.title === '小樽运河')!;
  return { tripId, items, spot };
}
const newKeyOf = async (tripId: string, title: string) => (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.title === title)!.key;

describe('#2 改名后证明关联迁移', () => {
  it('改名、关联数量不变：证明挂到新 key 上，没有旧 key 残留', async () => {
    const { tripId, spot } = await seed();
    const docId = await addDoc({ tripId, blob: new Blob(['x']), title: '门票', kind: 'ticket', itemKeys: [spot.key] });
    const md2 = md.replace('### [spot] 10:00-15:00 小樽运河', '### [spot] 10:00-15:00 小樽运河散步');
    const r2 = parseMd(md2);
    const newKey = r2.days.flatMap((d) => d.items).find((i) => i.title === '小樽运河散步')!.key;
    await saveImport(r2, md2, tripId, { [spot.key]: newKey });
    expect(await newKeyOf(tripId, '小樽运河散步')).toBe(newKey);
    expect((await db.docs.get(docId))!.itemKeys).toEqual([newKey]);
  });

  it('一份证明关联两项，其中一项改名：数量不变，改名那一项迁移，另一项不动', async () => {
    const { tripId, spot, items } = await seed();
    const other = items.find((i) => i.key !== spot.key)!;
    const docId = await addDoc({ tripId, blob: new Blob(['x']), title: '套票', kind: 'ticket', itemKeys: [spot.key, other.key] });
    const md2 = md.replace('### [spot] 10:00-15:00 小樽运河', '### [spot] 10:00-15:00 小樽运河散步');
    const r2 = parseMd(md2);
    const newKey = r2.days.flatMap((d) => d.items).find((i) => i.title === '小樽运河散步')!.key;
    await saveImport(r2, md2, tripId, { [spot.key]: newKey });
    expect((await db.docs.get(docId))!.itemKeys).toEqual([newKey, other.key]);
  });

  it('关联的项被删掉：数量减少，照旧解除关联、证明保留', async () => {
    const { tripId, spot } = await seed();
    const docId = await addDoc({ tripId, blob: new Blob(['x']), title: '门票', kind: 'ticket', itemKeys: [spot.key] });
    const md2 = md.replace(/### \[spot\] 10:00-15:00 小樽运河\n(- .*\n)*/, '');
    await saveImport(parseMd(md2), md2, tripId);
    expect((await db.docs.get(docId))!.itemKeys).toEqual([]);
  });

  it('没有任何改动：不重写证明（updatedAt 不变）', async () => {
    const { tripId, spot } = await seed();
    const docId = await addDoc({ tripId, blob: new Blob(['x']), title: '门票', kind: 'ticket', itemKeys: [spot.key] });
    const before = (await db.docs.get(docId))!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await saveImport(parseMd(md), md, tripId);
    expect((await db.docs.get(docId))!.updatedAt).toBe(before);
  });
});
