// 审查修复 #3（2026-10-21）：换了文件（大小、类型都一样）后，发布出去的必须是新内容
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, replaceDocBlob, saveImport, setCover } from '../db/repo';
import { setBackend } from '../cloud/backend';
import { applyUpdate, currentSnapshot, enableSync, joinWithCode, previewUpdate, publishUpdate, sha256 } from '../cloud/sync';
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
beforeEach(async () => {
  devices.clear();
  current = undefined;
  for (const t of db.tables) await t.clear();
  cloud = fakeCloud();
  setBackend(cloud);
});

const png = (s: string) => new Blob([s], { type: 'image/png' });

describe('#3 文件指纹不沿用旧值', () => {
  it('换成同样大小、同样类型的文件：快照指纹更新，同伴套用后拿到新内容', async () => {
    await useDevice('owner');
    cloud.as('owner-phone');
    const tripId = await saveImport(parseMd(md), md);
    const docId = await addDoc({ tripId, title: '票', kind: 'ticket', blob: png('AAAA'), itemKeys: [] });
    await enableSync(tripId, '阿权');
    const code = await cloud.createInvite(tripId, '小明');
    await useDevice('mate');
    cloud.as('mate-phone');
    await joinWithCode(code, '小明');

    await useDevice('owner');
    cloud.as('owner-phone');
    await replaceDocBlob(docId, png('BBBB'));
    const { snapshot } = await currentSnapshot(tripId);
    expect(snapshot.docs.find((d) => d.id === docId)!.fileHash).toBe(await sha256(png('BBBB')));
    await publishUpdate(tripId, '换文件', false);

    await useDevice('mate');
    cloud.as('mate-phone');
    await applyUpdate(tripId, (await previewUpdate(tripId))!);
    const doc = (await db.docs.get(docId))!;
    expect(await (await db.blobs.get(doc.blobKey))!.blob.text()).toBe('BBBB');
  });

  it('封面换成同样大小的图：指纹跟着变', async () => {
    const tripId = await saveImport(parseMd(md), md);
    await setCover(tripId, png('1111'));
    const a = (await currentSnapshot(tripId)).snapshot.trip.coverHash;
    await setCover(tripId, png('2222'));
    const b = (await currentSnapshot(tripId)).snapshot.trip.coverHash;
    expect(b).toBe(await sha256(png('2222')));
    expect(b).not.toBe(a);
  });
});
