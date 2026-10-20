// 审查修复 #1（2026-10-21）：删除旅程时，另一份旅程还在用的文件不能删
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { deleteTrip, saveImport } from '../db/repo';
import type { Doc } from '../domain/types';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const file = (s: string) => new Blob([s], { type: 'image/png' });
const docOf = (tripId: string, id: string, blobKey: string): Doc =>
  ({ id, tripId, title: id, kind: 'other', mime: 'image/png', blobKey, itemKeys: [], addedAt: '', updatedAt: '', fromCloud: true }) as Doc;

describe('#1 删除旅程不删共用文件', () => {
  it('两份旅程共用同一个文件：删一份，另一份的文件还在；两份都删了才清掉', async () => {
    const a = await saveImport(parseMd(md), md);
    const b = await saveImport(parseMd(md), md);
    await db.blobs.put({ key: 'cloud:shared', blob: file('F') });
    await db.docs.bulkPut([docOf(a, 'da', 'cloud:shared'), docOf(b, 'db', 'cloud:shared')]);

    await deleteTrip(a);
    expect(await db.blobs.get('cloud:shared')).toBeDefined();
    expect((await db.docs.get('db'))?.blobKey).toBe('cloud:shared');

    await deleteTrip(b);
    expect(await db.blobs.get('cloud:shared')).toBeUndefined();
  });

  it('只被这一份旅程用的文件照常清掉', async () => {
    const a = await saveImport(parseMd(md), md);
    const b = await saveImport(parseMd(md), md);
    await db.blobs.bulkPut([
      { key: 'doc:own', blob: file('A') },
      { key: 'doc:other', blob: file('B') },
    ]);
    await db.docs.bulkPut([docOf(a, 'da', 'doc:own'), docOf(b, 'db', 'doc:other')]);
    await deleteTrip(a);
    expect(await db.blobs.get('doc:own')).toBeUndefined();
    expect(await db.blobs.get('doc:other')).toBeDefined();
  });

  it('封面、亮点照片和每日照片被另一份旅程用着时也保留（含缩略图）', async () => {
    const a = await saveImport(parseMd(md), md);
    const b = await saveImport(parseMd(md), md);
    await db.blobs.bulkPut([
      { key: 'cloud:cover', blob: file('C') },
      { key: 'cloud:hl', blob: file('H') },
      { key: 'cloud:hl#thumb', blob: file('h') },
      { key: 'cloud:day', blob: file('D') },
    ]);
    for (const t of [a, b]) {
      await db.trips.update(t, { coverBlobKey: 'cloud:cover' });
      await db.highlights.put({ id: `h-${t}`, tripId: t, category: 'spot', title: 'x', hidden: false, order: 0, photoKey: 'cloud:hl', updatedAt: '' } as never);
      await db.guides.put({ tripId: t, tips: [], days: { d1: { photoKey: 'cloud:day' } }, updatedAt: '' } as never);
    }
    await deleteTrip(a);
    for (const k of ['cloud:cover', 'cloud:hl', 'cloud:hl#thumb', 'cloud:day']) expect(await db.blobs.get(k)).toBeDefined();
    await deleteTrip(b);
    for (const k of ['cloud:cover', 'cloud:hl', 'cloud:hl#thumb', 'cloud:day']) expect(await db.blobs.get(k)).toBeUndefined();
  });
});
