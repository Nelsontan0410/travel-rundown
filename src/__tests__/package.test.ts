// 2026-10：单个旅行包导出 / 恢复（含附件、不含附件）
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, addExpense, exportTripPackage, restoreBackupDetailed, saveImport, setItemStatus, tripPackageInfo } from '../db/repo';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const tripId = await saveImport(parseMd(md), md);
  const other = await saveImport(parseMd(md.replace(/^.*$/m, '另一个旅程，日本')), md);
  const items = await db.items.where('tripId').equals(tripId).toArray();
  const it0 = items[0];
  await setItemStatus(tripId, it0.key, 'done');
  await addDoc({ tripId, title: '机票', kind: 'flight', blob: new Blob(['PDFDATA'], { type: 'application/pdf' }), itemKeys: [it0.key] });
  await addExpense({ tripId, date: '2027-01-13', amount: 1234, title: '咖啡', category: 'meal' });
  return { tripId, other, key: it0.key };
}

async function wipe() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

describe('旅行包', () => {
  it('附件数量和大小', async () => {
    const { tripId } = await seed();
    expect(await tripPackageInfo(tripId)).toEqual({ files: 1, bytes: 7 });
  });

  it('含附件：只打包这一份旅程，恢复后状态、账本、文件都在', async () => {
    const { tripId, other, key } = await seed();
    const zip = await exportTripPackage(tripId, { attachments: true });
    await wipe();
    const r = await restoreBackupDetailed(zip);
    expect(r).toEqual({ trips: 1, scope: 'trip', attachments: true, missingFiles: 0 });
    expect(await db.trips.get(other)).toBeUndefined();
    expect((await db.itemStates.get([tripId, key]))?.status).toBe('done');
    expect(await db.expenses.where('tripId').equals(tripId).count()).toBe(1);
    const doc = (await db.docs.where('tripId').equals(tripId).toArray())[0];
    expect(await (await db.blobs.get(doc.blobKey))!.blob.text()).toBe('PDFDATA');
  });

  it('不含附件：资料在，文件不在，并报告缺几个', async () => {
    const { tripId } = await seed();
    const zip = await exportTripPackage(tripId, { attachments: false });
    await wipe();
    const r = await restoreBackupDetailed(zip);
    expect(r).toMatchObject({ scope: 'trip', attachments: false, missingFiles: 1 });
    expect(await db.docs.where('tripId').equals(tripId).count()).toBe(1);
    expect(await db.blobs.count()).toBe(0);
  });

  it('不含附件的包恢复到原手机：已有的文件不会被删掉', async () => {
    const { tripId } = await seed();
    const zip = await exportTripPackage(tripId, { attachments: false });
    const r = await restoreBackupDetailed(zip);
    expect(r.missingFiles).toBe(0);
    expect(await db.blobs.count()).toBe(1);
  });
});
