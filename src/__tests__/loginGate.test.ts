// 2026-11-15 登录门禁：云端只有一份；本机数据属于第一次登录的账号；私人资料「仅本机」不上传
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, saveImport, setDocLocalOnly } from '../db/repo';
import { setBackend } from '../cloud/backend';
import { applyUpdate, enableSync, joinWithCode, pendingChanges, previewUpdate, publishUpdate } from '../cloud/sync';
import {
  accountMarker,
  autoSyncLocalTrips,
  checkLocalOwner,
  clearLocalDataFor,
  deleteTripEverywhere,
  forgetAccount,
  localOwner,
  rememberAccount,
  rememberAfterLogin,
  restoreFromCloud,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  takeAfterLogin,
} from '../cloud/session';
import { fakeCloud, type FakeCloud } from './cloudFake';

// 测试环境（node）没有浏览器存储，用内存版代替
function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

let cloud: FakeCloud;

const wipe = async () => {
  for (const t of db.tables) await t.clear();
};

beforeEach(async () => {
  (globalThis as { localStorage?: Storage }).localStorage = memStore();
  (globalThis as { sessionStorage?: Storage }).sessionStorage = memStore();
  await wipe();
  cloud = fakeCloud();
  setBackend(cloud);
});

const png = (s: string) => new Blob([s], { type: 'image/png' });

async function ownerWithTwoDocs() {
  cloud.as('phone-a');
  await signUpWithEmail('nelson@example.com', 'secret1');
  const tripId = await saveImport(parseMd(md), md);
  const shared = await addDoc({ tripId, title: 'hotel.png', kind: 'lodging', blob: png('SHARED'), itemKeys: [] });
  const priv = await addDoc({ tripId, title: 'passport.png', kind: 'other', blob: png('PRIVATE'), itemKeys: [], localOnly: true });
  return { tripId, shared, priv };
}

describe('私人资料：仅本机', () => {
  it('发布时不带仅本机的资料；同伴加入后只有共享的那份', async () => {
    const { tripId, shared, priv } = await ownerWithTwoDocs();
    await enableSync(tripId, 'Nelson');
    const published = (await cloud.fetchVersion(tripId))!;
    expect(published.snapshot.docs.map((d) => d.id)).toEqual([shared]);

    const code = await cloud.createInvite(tripId, '小明');
    await wipe();
    cloud.as('mate');
    await signUpWithEmail('mate@example.com', 'secret2');
    await joinWithCode(code, '小明');
    const ids = (await db.docs.where('tripId').equals(tripId).toArray()).map((d) => d.id);
    expect(ids).toEqual([shared]);
    expect(ids).not.toContain(priv);
  });

  it('仅本机的资料不算「未发布的改动」，主用户本机的这份一直都在', async () => {
    const { tripId, priv } = await ownerWithTwoDocs();
    await enableSync(tripId, 'Nelson');
    expect((await pendingChanges(tripId)).docs).toEqual([]);
    await publishUpdate(tripId, 'v2', false);
    expect(await db.docs.get(priv)).toBeTruthy();
    expect((await db.blobs.get(`doc:${priv}`))?.blob).toBeTruthy();
  });

  it('改成共享后下次发布会带上，改回仅本机会从共享版本里拿掉', async () => {
    const { tripId, priv } = await ownerWithTwoDocs();
    await enableSync(tripId, 'Nelson');

    await setDocLocalOnly(priv, false);
    expect((await pendingChanges(tripId)).docs).toMatchObject([{ id: priv, kind: 'added' }]);
    await publishUpdate(tripId, 'v2', false);
    expect((await cloud.fetchVersion(tripId))!.snapshot.docs.map((d) => d.id)).toContain(priv);

    await setDocLocalOnly(priv, true);
    expect((await pendingChanges(tripId)).docs).toMatchObject([{ id: priv, kind: 'removed' }]);
    await publishUpdate(tripId, 'v3', false);
    expect((await cloud.fetchVersion(tripId))!.snapshot.docs.map((d) => d.id)).not.toContain(priv);
    expect(await db.docs.get(priv)).toBeTruthy(); // 本机还在
  });

  it('同伴自己的仅本机资料，套用主用户新版本后不会被删', async () => {
    const { tripId } = await ownerWithTwoDocs();
    await enableSync(tripId, 'Nelson');
    const code = await cloud.createInvite(tripId, '小明');

    await wipe();
    cloud.as('mate');
    await signUpWithEmail('mate@example.com', 'secret2');
    await joinWithCode(code, '小明');
    const mine = await addDoc({ tripId, title: 'my-insurance.png', kind: 'other', blob: png('MINE'), itemKeys: [], localOnly: true });

    // 主用户发布新版本（换一台设备操作）
    const mateDump: Record<string, unknown[]> = {};
    for (const t of db.tables) mateDump[t.name] = await t.toArray();
    await wipe();
    cloud.as('phone-a');
    await signInWithEmail('nelson@example.com', 'secret1');
    await restoreFromCloud();
    await publishUpdate(tripId, 'v2', false);
    // 回到同伴设备
    await wipe();
    for (const t of db.tables) await t.bulkPut(mateDump[t.name] as never[]);
    cloud.as('mate');
    await signInWithEmail('mate@example.com', 'secret2');
    const pv = (await previewUpdate(tripId))!;
    await applyUpdate(tripId, pv);
    expect(await db.docs.get(mine)).toBeTruthy();
    expect((await db.blobs.get(`doc:${mine}`))?.blob).toBeTruthy();
  });

  it('换手机登录找回的行程里没有仅本机的资料（只在原来那台设备上）', async () => {
    const { tripId, shared, priv } = await ownerWithTwoDocs();
    await enableSync(tripId, 'Nelson');
    await wipe();
    await signOutAccount();
    cloud.as('macbook');
    await signInWithEmail('nelson@example.com', 'secret1');
    await restoreFromCloud();
    const ids = (await db.docs.where('tripId').equals(tripId).toArray()).map((d) => d.id);
    expect(ids).toContain(shared);
    expect(ids).not.toContain(priv);
  });
});

describe('登录门禁：本机数据属于哪个账号', () => {
  it('第一次登录认领本机数据；同一个账号再登录正常；别的账号登录时不显示（other）', () => {
    expect(localOwner()).toBeNull();
    expect(checkLocalOwner({ userId: 'u1', email: 'a@x.com' })).toBe('ok');
    expect(localOwner()).toEqual({ userId: 'u1', email: 'a@x.com' });
    expect(checkLocalOwner({ userId: 'u1', email: 'a@x.com' })).toBe('ok');
    expect(checkLocalOwner({ userId: 'u2', email: 'b@x.com' })).toBe('other');
  });

  it('退出登录：登录记号清掉，但本机数据和主人记号还在（隐藏但保留）', async () => {
    cloud.as('phone-a');
    await signUpWithEmail('nelson@example.com', 'secret1');
    const s = (await cloud.getSession())!;
    rememberAccount(s);
    checkLocalOwner(s);
    const tripId = await saveImport(parseMd(md), md);
    await signOutAccount();
    expect(accountMarker()).toBeNull();
    expect(localOwner()?.userId).toBe(s.userId);
    expect(await db.trips.get(tripId)).toBeTruthy();
  });

  it('选择清除本机数据后：本机清空，数据交给当前账号', async () => {
    checkLocalOwner({ userId: 'u1', email: 'a@x.com' });
    const tripId = await saveImport(parseMd(md), md);
    await clearLocalDataFor({ userId: 'u2', email: 'b@x.com' });
    expect(await db.trips.get(tripId)).toBeUndefined();
    expect(localOwner()).toEqual({ userId: 'u2', email: 'b@x.com' });
    forgetAccount();
  });

  it('邀请链接：先登录，登录后回到邀请页（只记 /join/ 开头的）', () => {
    rememberAfterLogin('/join/ABCD-EFGH');
    expect(takeAfterLogin()).toBe('/join/ABCD-EFGH');
    expect(takeAfterLogin()).toBeNull();
    rememberAfterLogin('/trips');
    expect(takeAfterLogin()).toBeNull();
  });
});

describe('云端只有一份：登录后自动备份本机行程', () => {
  it('本机还没上云的行程自动发布，当前账号是主用户；仅本机的资料不上传', async () => {
    cloud.as('phone-a');
    // 旧版本留下的本机行程（没登录时建的）
    const tripId = await saveImport(parseMd(md), md);
    const shared = await addDoc({ tripId, title: 'a.png', kind: 'other', blob: png('A'), itemKeys: [] });
    await addDoc({ tripId, title: 'secret.png', kind: 'other', blob: png('S'), itemKeys: [], localOnly: true });

    await signUpWithEmail('nelson@example.com', 'secret1');
    const r = await autoSyncLocalTrips();
    expect(r).toEqual({ done: 1, failed: 0 });
    expect((await db.trips.get(tripId))!.cloud).toMatchObject({ role: 'owner', version: 1 });
    expect((await cloud.fetchVersion(tripId))!.snapshot.docs.map((d) => d.id)).toEqual([shared]);

    // 再跑一次什么都不做
    expect(await autoSyncLocalTrips()).toEqual({ done: 0, failed: 0 });
  });

  it('没登录账号（匿名身份）时不备份', async () => {
    cloud.as('phone-a');
    await saveImport(parseMd(md), md);
    await cloud.ensureSession();
    expect(await autoSyncLocalTrips()).toEqual({ done: 0, failed: 0 });
  });

  it('登录同一个账号的另一台设备：自动备份的行程能直接找回', async () => {
    cloud.as('phone-a');
    const tripId = await saveImport(parseMd(md), md);
    await signUpWithEmail('nelson@example.com', 'secret1');
    await autoSyncLocalTrips();

    await wipe();
    await signOutAccount();
    cloud.as('macbook');
    await signInWithEmail('nelson@example.com', 'secret1');
    expect((await restoreFromCloud()).restored).toHaveLength(1);
    expect((await db.trips.get(tripId))!.cloud?.role).toBe('owner');
  });
});

describe('删除旅程（2026-11-18）：删了不会再被自动找回', () => {
  it('主用户删除 → 云端也删，重新登录找不回；同伴删除 → 退出，找不回', async () => {
    cloud.as('phone-a');
    await signUpWithEmail('nelson@example.com', 'secret1');
    const tripId = await saveImport(parseMd(md), md);
    await enableSync(tripId, 'Nelson');
    const code = await cloud.createInvite(tripId, '小明');
    const mateDump: Record<string, unknown[]> = {};
    await wipe();
    cloud.as('mate');
    await signUpWithEmail('mate@example.com', 'secret2');
    await joinWithCode(code, '小明');
    // 同伴删除 = 退出
    await deleteTripEverywhere(tripId);
    expect(await db.trips.get(tripId)).toBeUndefined();
    expect((await restoreFromCloud()).restored).toEqual([]);
    expect(await db.trips.get(tripId)).toBeUndefined();
    for (const t of db.tables) mateDump[t.name] = await t.toArray();
    // 主用户换手机找回，再删除 → 云端没了
    await wipe();
    cloud.as('phone-b');
    await signInWithEmail('nelson@example.com', 'secret1');
    await restoreFromCloud();
    expect(await db.trips.get(tripId)).toBeTruthy();
    await deleteTripEverywhere(tripId);
    expect(cloud.state.trips.has(tripId)).toBe(false);
    await wipe();
    expect((await restoreFromCloud()).restored).toEqual([]);
    expect(await db.trips.get(tripId)).toBeUndefined();
  });

  it('没开同步的旅程只删本机，不需要登录', async () => {
    const tripId = await saveImport(parseMd(md), md);
    await deleteTripEverywhere(tripId);
    expect(await db.trips.get(tripId)).toBeUndefined();
  });
});
