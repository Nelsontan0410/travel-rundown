// 2026-10-18 同步第一步：主用户发布 → 同伴加入 / 预览 / 套用；三方合并、key 迁移、共享文件、预算共享、记账各自一份
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, addExpense, addItem, saveImport, setBudget, setItemStatus, updateItem, deleteItem } from '../db/repo';
import { setBackend } from '../cloud/backend';
import { applyUpdate, checkUpdates, enableSync, joinWithCode, pendingChanges, previewUpdate, publishUpdate } from '../cloud/sync';
import { mergeSnapshot } from '../cloud/merge';
import { fakeCloud, type FakeCloud } from './cloudFake';

// 一个测试里模拟两台手机：把整个本机数据库存起来 / 换回去
const devices = new Map<string, Record<string, unknown[]>>();
async function useDevice(name: string) {
  for (const [, dump] of devices) void dump;
  const cur = (globalThis as { __dev?: string }).__dev;
  if (cur) {
    const dump: Record<string, unknown[]> = {};
    for (const t of db.tables) dump[t.name] = await t.toArray();
    devices.set(cur, dump);
  }
  for (const t of db.tables) await t.clear();
  const next = devices.get(name);
  if (next) for (const t of db.tables) await t.bulkPut(next[t.name] as never[]);
  (globalThis as { __dev?: string }).__dev = name;
}

let cloud: FakeCloud;
const OWNER = 'owner-phone';
const MATE = 'mate-phone';
let code = '';

beforeEach(async () => {
  devices.clear();
  (globalThis as { __dev?: string }).__dev = undefined;
  for (const t of db.tables) await t.clear();
  cloud = fakeCloud();
  setBackend(cloud);
});

async function ownerSetup() {
  await useDevice('owner');
  cloud.as(OWNER);
  const tripId = await saveImport(parseMd(md), md);
  await setBudget(tripId, 500000);
  const hotel = (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.type === 'lodging')!;
  await addDoc({ tripId, title: 'hotel.png', kind: 'lodging', blob: new Blob(['QRDATA'], { type: 'image/png' }), itemKeys: [hotel.key], codeKind: 'static' });
  expect(await enableSync(tripId, '阿权')).toBe(1);
  code = await cloud.createInvite(tripId, '小明');
  return tripId;
}

async function mateJoin() {
  await useDevice('mate');
  cloud.as(MATE);
  return joinWithCode(code, '小明');
}

describe('同步：主用户发布、同伴套用', () => {
  it('同伴加入后拿到完整行程、共享文件和预算；身份是同伴', async () => {
    const tripId = await ownerSetup();
    const ownerItems = (await db.items.where('tripId').equals(tripId).toArray()).length;
    await mateJoin();
    const t = (await db.trips.get(tripId))!;
    expect(t.cloud).toMatchObject({ role: 'member', version: 1, ownerName: '阿权' });
    expect(t.budget).toBe(500000);
    expect(await db.items.where('tripId').equals(tripId).count()).toBe(ownerItems);
    const doc = (await db.docs.toArray())[0];
    expect(doc).toMatchObject({ fromCloud: true, codeKind: 'static' });
    expect(await (await db.blobs.get(doc.blobKey))!.blob.text()).toBe('QRDATA');
    const hotel = (await db.items.toArray()).find((i) => i.type === 'lodging')!;
    expect(doc.itemKeys).toEqual([hotel.key]);
  });

  it('不是被邀请的人看不到版本，也不能发布；同伴不能邀请', async () => {
    const tripId = await ownerSetup();
    cloud.as('stranger');
    await cloud.ensureSession();
    expect(await cloud.fetchVersion(tripId)).toBeNull();
    await expect(cloud.publish(tripId, 'x', false, {} as never, 'x')).rejects.toThrow();
    await mateJoin();
    await expect(cloud.createInvite(tripId, 'x')).rejects.toThrow();
  });

  it('一个邀请码只能给一台手机；主用户能看到同伴名字，移除后邀请码作废', async () => {
    const tripId = await ownerSetup();
    await mateJoin();
    cloud.as('other-phone');
    await cloud.ensureSession();
    expect(await cloud.peekInvite(code)).toMatchObject({ tripTitle: expect.any(String), inviterName: '阿权', usable: false, mine: false });
    await expect(cloud.joinWithCode(code, '路人')).rejects.toThrow('用过');
    cloud.as(MATE);
    expect(await cloud.peekInvite(code.toLowerCase())).toMatchObject({ usable: true, mine: true });
    cloud.as(OWNER);
    const ms = await cloud.members(tripId);
    expect(ms.map((m) => [m.name, m.role])).toEqual([['阿权', 'owner'], ['小明', 'member']]);
    expect(await cloud.peekInvite(code)).toMatchObject({ usable: false, mine: true });
    await cloud.removeMember(tripId, ms[1].userId);
    expect(await cloud.peekInvite(code)).toBeNull();
    cloud.as(MATE);
    expect(await cloud.fetchVersion(tripId)).toBeNull();
  });

  it('主用户改名、改时间后发布：同伴的勾选和自己的账本跟着走；记账各自一份', async () => {
    const tripId = await ownerSetup();
    await mateJoin();
    const canal = (await db.items.toArray()).find((i) => i.title === '小樽运河')!;
    await setItemStatus(tripId, canal.key, 'done');
    await addExpense({ tripId, date: '2027-01-14', amount: 2500, title: '门票', category: 'ticket', itemKey: canal.key });

    await useDevice('owner');
    cloud.as(OWNER);
    const oCanal = (await db.items.toArray()).find((i) => i.title === '小樽运河')!;
    await updateItem(oCanal.id, { title: '小樽运河散步', start: '11:00' });
    await setBudget(tripId, 600000);
    const pend = await pendingChanges(tripId);
    expect(pend.items).toEqual([expect.objectContaining({ kind: 'changed', title: '小樽运河散步', fields: expect.arrayContaining(['标题', '开始时间']) })]);
    expect(pend.trip).toContain('预算');
    expect(await publishUpdate(tripId, 'Day 2 晚点出发', true)).toBe(2);
    expect((await pendingChanges(tripId)).count).toBe(0);

    await useDevice('mate');
    cloud.as(MATE);
    expect(await checkUpdates()).toEqual({ [tripId]: { version: 2, note: 'Day 2 晚点出发', important: true } });
    const pv = (await previewUpdate(tripId))!;
    expect(pv.diff.items.map((c) => c.title)).toEqual(['小樽运河散步']);
    expect(pv.conflicts).toEqual([]);
    await applyUpdate(tripId, pv);
    const after = (await db.items.toArray()).find((i) => i.id === canal.id)!;
    expect(after).toMatchObject({ title: '小樽运河散步', start: '11:00' });
    expect((await db.itemStates.get([tripId, after.key]))?.status).toBe('done');
    expect((await db.expenses.toArray())[0].itemKey).toBe(after.key);
    expect((await db.trips.get(tripId))!.budget).toBe(600000);
    expect(await checkUpdates()).toEqual({});
  });

  it('同伴自己的修改保留；两边改了同一项 → 冲突，可选保留自己的', async () => {
    const tripId = await ownerSetup();
    await mateJoin();
    const items = await db.items.toArray();
    const curry = items.find((i) => i.title === '汤咖喱晚餐')!;
    const canal = items.find((i) => i.title === '小樽运河')!;
    await updateItem(curry.id, { note: '我想吃辣一点' }); // 只有自己改
    await updateItem(canal.id, { note: '我：下雪就早点走' }); // 两边都改
    const mine = await addItem(tripId, canal.dayId, { type: 'spot', title: '北一硝子', start: '15:30' }); // 自己新增

    await useDevice('owner');
    cloud.as(OWNER);
    const oItems = await db.items.toArray();
    await updateItem(oItems.find((i) => i.title === '小樽运河')!.id, { note: '主：运河 16:00 亮灯' });
    await deleteItem(oItems.find((i) => i.title === '白色恋人公园')!.id);
    await publishUpdate(tripId, '更新', false);

    await useDevice('mate');
    cloud.as(MATE);
    const pv = (await previewUpdate(tripId))!;
    expect(pv.conflicts.map((c) => c.title)).toEqual(['小樽运河']);
    expect(pv.keptMine).toBe(2); // 汤咖喱的备注 + 自己新增的北一硝子
    await applyUpdate(tripId, pv, { [canal.id]: 'mine' });
    const now = await db.items.toArray();
    expect(now.find((i) => i.id === curry.id)!.note).toBe('我想吃辣一点');
    expect(now.find((i) => i.id === canal.id)!.note).toBe('我：下雪就早点走');
    expect(now.find((i) => i.id === mine)).toBeTruthy();
    expect(now.some((i) => i.title === '白色恋人公园')).toBe(false);
    // 自己新增的项排在原来的位置附近（小樽运河之后）
    const day2 = now.filter((i) => i.dayId === canal.dayId).sort((a, b) => a.order - b.order).map((i) => i.title);
    expect(day2.indexOf('北一硝子')).toBeGreaterThan(day2.indexOf('小樽运河'));
  });

  it('冲突默认用主用户的', async () => {
    const tripId = await ownerSetup();
    await mateJoin();
    const canal = (await db.items.toArray()).find((i) => i.title === '小樽运河')!;
    await updateItem(canal.id, { note: '我改的' });
    await useDevice('owner');
    cloud.as(OWNER);
    await updateItem((await db.items.toArray()).find((i) => i.title === '小樽运河')!.id, { note: '主用户改的' });
    await publishUpdate(tripId, 'x', false);
    await useDevice('mate');
    cloud.as(MATE);
    const pv = (await previewUpdate(tripId))!;
    await applyUpdate(tripId, pv);
    expect((await db.items.get(canal.id))!.note).toBe('主用户改的');
  });

  it('主用户重新导入（同样内容）不会变成「删了又加」', async () => {
    const tripId = await ownerSetup();
    const before = (await db.items.toArray()).map((i) => i.id).sort();
    await saveImport(parseMd(md), md, tripId);
    expect((await db.items.toArray()).map((i) => i.id).sort()).toEqual(before);
    expect((await pendingChanges(tripId)).items).toEqual([]);
  });

  it('主用户删掉共享证明 → 同伴那边也删；同伴自己的证明保留', async () => {
    const tripId = await ownerSetup();
    await mateJoin();
    await addDoc({ tripId, title: '我的车票.png', kind: 'ticket', blob: new Blob(['mine'], { type: 'image/png' }), itemKeys: [] });
    await useDevice('owner');
    cloud.as(OWNER);
    for (const d of await db.docs.toArray()) await db.docs.delete(d.id);
    await publishUpdate(tripId, '删证明', false);
    await useDevice('mate');
    cloud.as(MATE);
    await applyUpdate(tripId, (await previewUpdate(tripId))!);
    expect((await db.docs.toArray()).map((d) => d.title)).toEqual(['我的车票.png']);
  });

  it('合并：没有基准时（第一次）全部用主用户的', () => {
    const inc = { schema: 1 as const, trip: {} as never, days: [{ id: 'd1', tripId: 't', index: 1, date: '2027-01-01', tz: 'UTC', city: 'A' }], items: [{ id: 'a', key: '', tripId: 't', dayId: 'd1', order: 0, type: 'spot' as const, title: 'X' }], docs: [] };
    const m = mergeSnapshot(undefined, { days: [], items: [] }, inc);
    expect(m.items.map((i) => i.key)).toEqual(['2027-01-01|spot|x']);
    expect(m.conflicts).toEqual([]);
  });
});

describe('通知', () => {
  it('同伴加入 → 主用户收到；主用户发布 → 同伴收到「谁发布了什么」和改动摘要；退出 / 移除也有', async () => {
    const tripId = await ownerSetup();
    await mateJoin();
    // 主用户这边看到「小明 加入了旅程」
    cloud.as(OWNER);
    let evs = await cloud.events([tripId]);
    expect(evs.map((e) => e.kind)).toEqual(['publish', 'join']);
    expect(evs[1].title).toBe('小明 加入了旅程');

    // 主用户改两项、删一项后发布
    await useDevice('owner');
    cloud.as(OWNER);
    const items = await db.items.toArray();
    await updateItem(items.find((i) => i.title === '小樽运河')!.id, { start: '11:00' });
    await deleteItem(items.find((i) => i.title === '白色恋人公园')!.id);
    await publishUpdate(tripId, 'Day 2 晚点出发', true);

    await useDevice('mate');
    cloud.as(MATE);
    evs = await cloud.events([tripId]);
    const pub = evs.at(-1)!;
    expect(pub).toMatchObject({ kind: 'publish', title: '阿权 发布了 v2（重要更新）', actorName: '阿权' });
    expect(pub.detail).toMatchObject({ version: 2, note: 'Day 2 晚点出发', important: true });
    expect(pub.detail.summary).toMatchObject({ added: 0, changed: 1, removed: 1 });
    expect(pub.detail.summary!.lines).toEqual(expect.arrayContaining([expect.stringContaining('修改 · Day 2 小樽运河'), expect.stringContaining('删除 · Day 3 白色恋人公园')]));

    // 只能拿 afterId 之后的
    expect((await cloud.events([tripId], pub.id - 1)).map((e) => e.id)).toEqual([pub.id]);

    await cloud.leaveTrip(tripId);
    cloud.as(OWNER);
    expect((await cloud.events([tripId])).at(-1)!.title).toBe('小明 退出了旅程');
    // 外人看不到
    cloud.as('stranger');
    await cloud.ensureSession();
    expect(await cloud.events([tripId])).toEqual([]);
  });

  it('未读 = 别人做的、比看过的新', async () => {
    const { unreadOf } = await import('../store/cloud');
    const ev = (id: number, actorId: string) => ({ id, tripId: 't', actorId, kind: 'publish', title: '', detail: {}, createdAt: '' });
    const events = [ev(1, 'a'), ev(2, 'me'), ev(3, 'b')];
    expect(unreadOf({ events, seenId: 0, session: { userId: 'me' } }).map((e) => e.id)).toEqual([1, 3]);
    expect(unreadOf({ events, seenId: 2, session: { userId: 'me' } }).map((e) => e.id)).toEqual([3]);
  });
});

describe('同伴建议 → 主用户采纳 → 发布 → 同伴套用', () => {
  it('同伴选几处修改提交；主用户接受一部分、拒绝一部分；发布后同伴那边干净合并，没采纳的仍留在本机', async () => {
    const { myLocalChanges, submitSuggestion, decide, reviewRows } = await import('../cloud/suggest');
    const tripId = await ownerSetup();
    await mateJoin();
    const items = await db.items.toArray();
    const canal = items.find((i) => i.title === '小樽运河')!;
    const curry = items.find((i) => i.title === '汤咖喱晚餐')!;
    const park = items.find((i) => i.title === '白色恋人公园')!;
    await updateItem(canal.id, { start: '11:30', note: '雪大就晚点' }); // 会被接受
    await updateItem(curry.id, { note: '想吃辣' }); // 会被拒绝
    await deleteItem(park.id); // 会被接受
    const glass = await addItem(tripId, canal.dayId, { type: 'spot', title: '北一硝子', start: '15:30' }); // 会被接受；还有一处不提交
    await addItem(tripId, canal.dayId, { type: 'meal', title: '我的私房咖啡', start: '16:30' });

    const mine = await myLocalChanges(tripId);
    expect(mine.map((c) => `${c.op}:${c.title}`).sort()).toEqual(['add:北一硝子', 'add:我的私房咖啡', 'change:小樽运河', 'change:汤咖喱晚餐', 'remove:白色恋人公园'].sort());
    expect(mine.find((c) => c.title === '小樽运河')!.fields).toEqual(expect.arrayContaining(['开始时间', '备注']));
    const pickIds = mine.filter((c) => c.title !== '我的私房咖啡').map((c) => c.itemId);
    await submitSuggestion(tripId, '我的建议', pickIds);

    // 主用户收到通知和建议
    await useDevice('owner');
    cloud.as(OWNER);
    expect((await cloud.events([tripId])).at(-1)).toMatchObject({ kind: 'suggest', title: '小明 提交了 4 处修改建议' });
    const [sg] = await cloud.suggestions(tripId);
    expect(sg.changes).toHaveLength(4);
    const rows = await reviewRows(tripId, sg);
    expect(rows.every((r) => !r.ownerChanged)).toBe(true);
    const decisions = Object.fromEntries(sg.changes.map((c) => [c.itemId, c.title === '汤咖喱晚餐' ? 'reject' : 'accept'])) as Record<string, 'accept' | 'reject'>;
    expect(await decide(tripId, sg, decisions)).toEqual({ accepted: 3, rejected: 1 });
    const owned = await db.items.toArray();
    expect(owned.find((i) => i.id === canal.id)).toMatchObject({ start: '11:30', note: '雪大就晚点' });
    expect(owned.some((i) => i.id === park.id)).toBe(false);
    expect(owned.find((i) => i.id === glass)).toMatchObject({ title: '北一硝子', start: '15:30' });
    expect(owned.find((i) => i.id === curry.id)!.note).toBeUndefined();
    expect((await cloud.events([tripId])).at(-1)!.title).toBe('阿权 采纳了 小明 的 3 处建议（1 处未采纳）');
    await expect(decide(tripId, sg, decisions)).rejects.toThrow('处理过了');
    await publishUpdate(tripId, '采纳小明的建议', false);

    // 同伴套用：被采纳的不再算自己的修改，没采纳 / 没提交的仍在本机
    await useDevice('mate');
    cloud.as(MATE);
    const pv = (await previewUpdate(tripId))!;
    expect(pv.conflicts).toEqual([]);
    await applyUpdate(tripId, pv);
    const left = await myLocalChanges(tripId);
    expect(left.map((c) => c.title).sort()).toEqual(['我的私房咖啡', '汤咖喱晚餐']);
    expect((await db.items.toArray()).filter((i) => i.title === '北一硝子')).toHaveLength(1);
    const [mineSg] = await cloud.suggestions(tripId);
    expect(mineSg.status).toBe('partial');
  });

  it('主用户之后又改过同一项 → 审核时提示；主用户不能提交建议；撤回', async () => {
    const { myLocalChanges, submitSuggestion, reviewRows } = await import('../cloud/suggest');
    const tripId = await ownerSetup();
    await mateJoin();
    const canal = (await db.items.toArray()).find((i) => i.title === '小樽运河')!;
    await updateItem(canal.id, { note: '我的' });
    await submitSuggestion(tripId, '', (await myLocalChanges(tripId)).map((c) => c.itemId));
    await useDevice('owner');
    cloud.as(OWNER);
    await updateItem(canal.id, { note: '主用户后来改的' });
    const [sg] = await cloud.suggestions(tripId);
    expect((await reviewRows(tripId, sg))[0].ownerChanged).toBe(true);
    await expect(cloud.submitSuggestion(tripId, 1, '', sg.changes)).rejects.toThrow('只有同伴');
    await useDevice('mate');
    cloud.as(MATE);
    await cloud.withdrawSuggestion(sg.id);
    expect(await cloud.suggestions(tripId)).toEqual([]);
  });
});
