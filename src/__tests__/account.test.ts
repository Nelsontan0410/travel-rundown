// 2026-10-26 账号：主用户用 Google / 邮箱登录，换手机或清缓存后重新登录能把旅程找回来；匿名同伴绑定账号后不丢旅程
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, saveImport, setBudget } from '../db/repo';
import { cloudErrorText, setBackend } from '../cloud/backend';
import { enableSync, joinWithCode, pendingChanges } from '../cloud/sync';
import { hasAccount, restoreFromCloud, signInWithEmail, signInWithGoogle, signOutAccount, signUpWithEmail } from '../cloud/session';
import { fakeCloud, type FakeCloud } from './cloudFake';

let cloud: FakeCloud;

const wipeLocal = async () => {
  for (const t of db.tables) await t.clear();
};

beforeEach(async () => {
  await wipeLocal();
  cloud = fakeCloud();
  setBackend(cloud);
});

async function ownerPublishes() {
  cloud.as('phone-a');
  await signUpWithEmail('nelson@example.com', 'secret1');
  const tripId = await saveImport(parseMd(md), md);
  await setBudget(tripId, 500000);
  const hotel = (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.type === 'lodging')!;
  await addDoc({ tripId, title: 'hotel.png', kind: 'lodging', blob: new Blob(['QRDATA'], { type: 'image/png' }), itemKeys: [hotel.key] });
  await enableSync(tripId, 'Nelson');
  return tripId;
}

describe('账号：邮箱 / Google 登录', () => {
  it('邮箱注册后是账号身份（不是匿名），退出后再登录是同一个用户', async () => {
    cloud.as('phone-a');
    await signUpWithEmail('nelson@example.com', 'secret1');
    const first = (await cloud.getSession())!;
    expect(hasAccount(first)).toBe(true);
    expect(first.email).toBe('nelson@example.com');
    await signOutAccount();
    expect(await cloud.getSession()).toBeNull();
    cloud.as('phone-b');
    await signInWithEmail('nelson@example.com', 'secret1');
    expect((await cloud.getSession())!.userId).toBe(first.userId);
  });

  it('密码不对、邮箱重复注册都给出能看懂的中文提示', async () => {
    cloud.as('phone-a');
    await signUpWithEmail('nelson@example.com', 'secret1');
    cloud.as('phone-b');
    await expect(signInWithEmail('nelson@example.com', 'wrong')).rejects.toThrow('Invalid login credentials');
    await expect(signUpWithEmail('nelson@example.com', 'secret1')).rejects.toThrow('User already registered');
    expect(cloudErrorText(new Error('Invalid login credentials'))).toBe('邮箱或密码不对');
    expect(cloudErrorText(new Error('User already registered'))).toContain('直接登录');
    expect(cloudErrorText(new Error('Unsupported provider: provider is not enabled'))).toContain('Google');
  });

  it('Google 登录：手机和 MacBook 用同一个 Google 账号就是同一个用户', async () => {
    cloud.googleIs('nelson@gmail.com');
    cloud.as('iphone');
    await signInWithGoogle();
    const a = (await cloud.getSession())!;
    cloud.as('macbook');
    await signInWithGoogle();
    const b = (await cloud.getSession())!;
    expect(hasAccount(a)).toBe(true);
    expect(b.userId).toBe(a.userId);
  });

  it('Google 登录没在后台打开时，报错提示去打开', async () => {
    cloud.as('iphone');
    await expect(signInWithGoogle()).rejects.toThrow(/provider is not enabled/);
  });
});

describe('账号：清缓存 / 换设备后找回旅程', () => {
  it('主用户清掉本机全部资料后，重新登录能找回旅程，并且还是主用户、没有多余的待发布改动', async () => {
    const tripId = await ownerPublishes();
    const itemCount = await db.items.where('tripId').equals(tripId).count();

    await wipeLocal(); // 清缓存
    await signOutAccount();
    cloud.as('phone-a');
    await signInWithEmail('nelson@example.com', 'secret1');

    const r = await restoreFromCloud();
    expect(r.failed).toEqual([]);
    expect(r.restored).toHaveLength(1);
    const t = (await db.trips.get(tripId))!;
    expect(t.cloud).toMatchObject({ role: 'owner', version: 1, ownerName: 'Nelson' });
    expect(t.budget).toBe(500000);
    expect(await db.items.where('tripId').equals(tripId).count()).toBe(itemCount);
    const doc = (await db.docs.toArray())[0];
    expect(await (await db.blobs.get(doc.blobKey))!.blob.text()).toBe('QRDATA');
    // 找回的是已发布的版本，所以没有「还没发布的改动」
    expect((await pendingChanges(tripId)).count).toBe(0);
  });

  it('换一台手机（MacBook）登录同一个账号也能找回；本机已经有的旅程不会被覆盖', async () => {
    const tripId = await ownerPublishes();
    await db.trips.update(tripId, { title: '本机改过的名字' });

    // 同一台设备：本机已经有这份旅程，找回什么都不做
    expect((await restoreFromCloud()).restored).toEqual([]);
    expect((await db.trips.get(tripId))!.title).toBe('本机改过的名字');

    // 换设备：本机空的，登录后找回
    await wipeLocal();
    cloud.as('macbook');
    await signInWithEmail('nelson@example.com', 'secret1');
    expect((await restoreFromCloud()).restored).toHaveLength(1);
    expect((await db.trips.get(tripId))!.cloud?.role).toBe('owner');
  });

  it('同伴也能找回：匿名加入后绑定邮箱，userId 不变，清缓存后登录找回的是同伴身份', async () => {
    const tripId = await ownerPublishes();
    const code = await cloud.createInvite(tripId, '小明');
    const ownerLocal = await db.trips.toArray();

    await wipeLocal();
    cloud.as('mate');
    await joinWithCode(code, '小明');
    const anon = (await cloud.getSession())!;
    expect(anon.anonymous).toBe(true);
    expect(hasAccount(anon)).toBe(false);

    await signUpWithEmail('mate@example.com', 'secret2'); // 匿名升级成账号
    const bound = (await cloud.getSession())!;
    expect(bound.userId).toBe(anon.userId);
    expect(hasAccount(bound)).toBe(true);

    await wipeLocal();
    await signOutAccount();
    cloud.as('mate-new-phone');
    await signInWithEmail('mate@example.com', 'secret2');
    expect((await restoreFromCloud()).restored).toHaveLength(1);
    expect((await db.trips.get(tripId))!.cloud).toMatchObject({ role: 'member', ownerName: 'Nelson' });
    void ownerLocal;
  });

  it('没登录时找回什么都不做；别人的旅程找不回来', async () => {
    const tripId = await ownerPublishes();
    await wipeLocal();
    cloud.as('stranger-phone');
    expect((await restoreFromCloud()).restored).toEqual([]);
    await signUpWithEmail('other@example.com', 'secret3');
    expect((await restoreFromCloud()).restored).toEqual([]);
    expect(await db.trips.get(tripId)).toBeUndefined();
  });
});
