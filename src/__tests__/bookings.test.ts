// 2026-10 第一批 ②：预订资料离线准备检查
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, addLinkDoc, deleteDoc, exportTripPackage, restoreBackupDetailed, saveImport, setDocCodeKind, tripPackageInfo } from '../db/repo';
import { bookingGroup, isLinkDoc, looksLikeUrl, offlineReport, offlineState } from '../domain/bookings';
import type { Doc } from '../domain/types';

const doc = (over: Partial<Doc>): Doc => ({
  id: 'd', tripId: 't', title: 'x', kind: 'other', mime: 'image/png', blobKey: 'doc:d', itemKeys: [], addedAt: '', updatedAt: '', ...over,
});

describe('离线状态（纯函数）', () => {
  const saved = new Set(['doc:a', 'doc:qr']);
  it('本机有文件 → 可离线', () => {
    expect(offlineState({}, [doc({ blobKey: 'doc:a' })], saved)).toMatchObject({ level: 'ok', saved: 1 });
  });
  it('二维码图片单独计数', () => {
    expect(offlineState({}, [doc({ blobKey: 'doc:qr', codeKind: 'static' })], saved)).toMatchObject({ level: 'ok', codes: 1 });
  });
  it('动态票码优先提醒，即使另有文件', () => {
    const st = offlineState({}, [doc({ blobKey: 'doc:a' }), doc({ id: 'l', mime: 'text/uri-list', blobKey: 'link:l', url: 'https://x', codeKind: 'dynamic' })], saved);
    expect(st).toMatchObject({ level: 'dynamic', saved: 1, dynamic: 1 });
  });
  it('只有链接 / 只有编号 / 文件不在本机 / 什么都没有', () => {
    expect(offlineState({}, [doc({ mime: 'text/uri-list', blobKey: 'link:l', url: 'https://x' })], saved).level).toBe('link');
    expect(offlineState({ bookingRef: 'ABC' }, [], saved).level).toBe('ref');
    expect(offlineState({ bookingRef: 'ABC' }, [doc({ blobKey: 'doc:gone' })], saved).level).toBe('unsaved');
    expect(offlineState({}, [], saved).level).toBe('missing');
  });
  it('分组：酒店 / 交通（机票 + 交通）/ 门票', () => {
    expect(bookingGroup({ type: 'lodging' })).toBe('lodging');
    expect(bookingGroup({ type: 'flight' })).toBe('transport');
    expect(bookingGroup({ type: 'transit' })).toBe('transport');
    expect(bookingGroup({ type: 'spot' })).toBe('ticket');
  });
  it('链接校验', () => {
    expect(looksLikeUrl('https://klook.com/x')).toBe(true);
    expect(looksLikeUrl('klook')).toBe(false);
  });
});

describe('链接资料与票码（数据库）', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('链接资料不存文件，不算附件；旅行包恢复后不报缺文件', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const it0 = (await db.items.where('tripId').equals(tripId).toArray())[0];
    const id = await addLinkDoc({ tripId, title: 'JR 票', kind: 'ticket', url: ' https://jr.example/t ', itemKeys: [it0.key], dynamic: true, app: 'JR East' });
    const d = (await db.docs.get(id))!;
    expect(isLinkDoc(d)).toBe(true);
    expect(d).toMatchObject({ url: 'https://jr.example/t', codeKind: 'dynamic', app: 'JR East' });
    expect(await db.blobs.count()).toBe(0);
    expect(await tripPackageInfo(tripId)).toEqual({ files: 0, bytes: 0 });
    const zip = await exportTripPackage(tripId, { attachments: false });
    await Promise.all(db.tables.map((t) => t.clear()));
    expect((await restoreBackupDetailed(zip)).missingFiles).toBe(0);
    expect((await db.docs.get(id))?.url).toBe('https://jr.example/t');
  });

  it('二维码标记可加可取消；删除资料连文件一起删', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const id = await addDoc({ tripId, title: 'qr.png', kind: 'ticket', blob: new Blob(['x'], { type: 'image/png' }), itemKeys: [], codeKind: 'static' });
    expect((await db.docs.get(id))?.codeKind).toBe('static');
    await setDocCodeKind(id, undefined);
    expect((await db.docs.get(id))?.codeKind).toBeUndefined();
    await deleteDoc(id);
    expect(await db.docs.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });

  it('报告汇总', () => {
    const r = offlineReport(
      [{ key: 'a', bookingRef: 'X' }, { key: 'b' }] as never,
      (k) => (k === 'a' ? [doc({ blobKey: 'doc:a' })] : []),
      new Set(['doc:a']),
    );
    expect(r.counts.ok).toBe(1);
    expect(r.counts.missing).toBe(1);
    expect(r.todo).toBe(1);
  });
});
