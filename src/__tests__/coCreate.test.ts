// 2026-10-23 共同制作：美食册按旅程；同伴改什么都能提交（连文件）；主用户接受后发布，大家拿到一样的内容；
// 同伴没提交的修改不会被新版本冲掉
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { addDoc, saveImport, setBudget, updateDay } from '../db/repo';
import { addFoodEntry, updateFoodEntry } from '../db/food';
import { addHighlight, updateHighlight } from '../db/guide';
import { setBackend } from '../cloud/backend';
import { applyUpdate, enableSync, joinWithCode, pendingChanges, publishUpdate } from '../cloud/sync';
import { decide, myLocalChanges, revertLocal, reviewRows, submitSuggestion } from '../cloud/suggest';
import { pickTripForFood } from '../domain/food';
import { fakeCloud, type FakeCloud } from './cloudFake';

const devices = new Map<string, Record<string, unknown[]>>();
async function useDevice(name: string) {
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
let code = '';
const food = (name: string) => ({ name, category: 'main' as const, restaurantName: `${name}店`, address: '广西南宁市兴宁区中山路 1 号' });

beforeEach(async () => {
  devices.clear();
  (globalThis as { __dev?: string }).__dev = undefined;
  for (const t of db.tables) await t.clear();
  cloud = fakeCloud();
  setBackend(cloud);
});

async function setup() {
  await useDevice('owner');
  cloud.as('owner-phone');
  const tripId = await saveImport(parseMd(md), md);
  await setBudget(tripId, 500000);
  await addFoodEntry(tripId, food('老友粉'), { blob: new Blob(['PHOTO1'], { type: 'image/jpeg' }), thumb: new Blob(['THUMB1'], { type: 'image/jpeg' }) });
  await addHighlight({ tripId, title: '中山路夜市', category: 'food', photo: new Blob(['HL1'], { type: 'image/jpeg' }) });
  expect(await enableSync(tripId, '阿权')).toBe(1);
  code = await cloud.createInvite(tripId, '小明');
  await useDevice('mate');
  cloud.as('mate-phone');
  await joinWithCode(code, '小明');
  return tripId;
}

const toOwner = async () => {
  await useDevice('owner');
  cloud.as('owner-phone');
};
const toMate = async () => {
  await useDevice('mate');
  cloud.as('mate-phone');
};

describe('美食册按旅程', () => {
  it('旧的全站美食按地址归到对应旅程，对不上就归最近打开的', () => {
    const trips = [
      { id: 'a', title: '北海道冬季', destination: '北海道，日本' },
      { id: 'b', title: '南宁三天', destination: '南宁, 广西' },
    ];
    expect(pickTripForFood({ restaurantName: '舒记', address: '广西南宁市中山路' }, trips, 'a')).toBe('b');
    expect(pickTripForFood({ restaurantName: '某店', address: 'Somewhere' }, trips, 'a')).toBe('a');
    expect(pickTripForFood({ restaurantName: '某店', address: 'x' }, [], 'a')).toBeUndefined();
  });

  it('美食和照片跟着版本给同伴；缩略图也在', async () => {
    const tripId = await setup();
    const f = (await db.foodEntries.where('tripId').equals(tripId).toArray())[0];
    expect(f).toMatchObject({ name: '老友粉', tripId });
    expect(f.photoKey).toMatch(/^cloud:/);
    expect(await (await db.blobs.get(f.photoKey!))!.blob.text()).toBe('PHOTO1');
    expect(await (await db.blobs.get(`${f.photoKey}#thumb`))!.blob.text()).toBe('THUMB1');
    // 刚加入时没有任何「本机修改」
    expect(await myLocalChanges(tripId)).toEqual([]);
  });

  it('主用户改美食 → 发布里列出来 → 同伴套用后一样', async () => {
    const tripId = await setup();
    await toOwner();
    const f = (await db.foodEntries.toArray())[0];
    await updateFoodEntry(f.id, { ...food('老友粉'), description: '酸笋多放' });
    const diff = await pendingChanges(tripId);
    expect(diff.food).toEqual(['修改美食 · 老友粉']);
    await publishUpdate(tripId, '', false);
    await toMate();
    const v = (await cloud.fetchVersion(tripId))!;
    await applyUpdate(tripId, v);
    expect((await db.foodEntries.get(f.id))!.description).toBe('酸笋多放');
  });
});

describe('同伴共同制作：什么都能提交，文件一起过去', () => {
  it('同伴新增美食（带照片）、改亮点、加资料、改每天备注、改预算 → 提交 → 主用户接受并发布 → 大家一样', async () => {
    const tripId = await setup();
    // 同伴在自己手机上改
    const newFood = await addFoodEntry(tripId, food('柠檬鸭'), { blob: new Blob(['DUCK'], { type: 'image/jpeg' }), thumb: new Blob(['DUCKT'], { type: 'image/jpeg' }) });
    const hl = (await db.highlights.toArray())[0];
    await updateHighlight(hl.id, { desc: '晚上九点后最热闹' });
    const hotel = (await db.items.toArray()).find((i) => i.type === 'lodging')!;
    const docId = await addDoc({ tripId, title: '民宿确认单.pdf', kind: 'lodging', blob: new Blob(['PDFDATA'], { type: 'application/pdf' }), itemKeys: [hotel.key] });
    const day1 = (await db.days.toArray()).find((d) => d.index === 1)!;
    await updateDay(day1.id, { note: '先去酒店放行李' });
    await setBudget(tripId, 600000);

    const changes = await myLocalChanges(tripId);
    const ids = changes.map((c) => c.itemId);
    expect(ids).toEqual(expect.arrayContaining([`food:${newFood}`, `highlight:${hl.id}`, `doc:${docId}`, 'day:day:1', 'trip:trip']));
    expect(changes.find((c) => c.itemId === 'trip:trip')!.fields).toEqual(['总预算']);

    await submitSuggestion(tripId, '我补了一些', ids);
    // 附件上传在同伴自己的建议目录
    expect([...cloud.state.files.keys()].some((k) => k.startsWith(`${tripId}/s/u:mate-phone/`))).toBe(true);

    // 主用户审核
    await toOwner();
    const sg = (await cloud.suggestions(tripId))[0];
    const rows = await reviewRows(tripId, sg);
    expect(rows.every((r) => !r.ownerChanged)).toBe(true);
    const r = await decide(tripId, sg, Object.fromEntries(sg.changes.map((c) => [c.itemId, 'accept' as const])));
    expect(r.rejected).toBe(0);

    // 主用户本机：文字和文件都过来了
    const duck = (await db.foodEntries.get(newFood))!;
    expect(await (await db.blobs.get(duck.photoKey!))!.blob.text()).toBe('DUCK');
    expect(await (await db.blobs.get(`${duck.photoKey}#thumb`))!.blob.text()).toBe('DUCKT');
    expect((await db.highlights.get(hl.id))!.desc).toBe('晚上九点后最热闹');
    const doc = (await db.docs.get(docId))!;
    expect(await (await db.blobs.get(doc.blobKey))!.blob.text()).toBe('PDFDATA');
    const ownerHotel = (await db.items.toArray()).find((i) => i.type === 'lodging')!;
    expect(doc.itemKeys).toEqual([ownerHotel.key]);
    expect((await db.days.toArray()).find((d) => d.index === 1)!.note).toBe('先去酒店放行李');
    expect((await db.trips.get(tripId))!.budget).toBe(600000);

    // 发布 → 同伴套用：没有剩下的本机修改，资料变成共享的
    await publishUpdate(tripId, '采纳建议', false);
    await toMate();
    await applyUpdate(tripId, (await cloud.fetchVersion(tripId))!);
    expect(await myLocalChanges(tripId)).toEqual([]);
    expect((await db.docs.get(docId))!.fromCloud).toBe(true);
    expect((await db.foodEntries.get(newFood))!.photoKey).toMatch(/^cloud:/);
  });

  it('同伴没提交的修改，套用新版本时保留；主用户也改了同一样时以主用户为准', async () => {
    const tripId = await setup();
    const hl = (await db.highlights.toArray())[0];
    const f = (await db.foodEntries.toArray())[0];
    await updateHighlight(hl.id, { desc: '我的说明' });
    await updateFoodEntry(f.id, { ...food('老友粉'), description: '我写的' });
    // 主用户只改了美食
    await toOwner();
    await updateFoodEntry(f.id, { ...food('老友粉'), description: '主用户写的' });
    await publishUpdate(tripId, '', false);
    await toMate();
    await applyUpdate(tripId, (await cloud.fetchVersion(tripId))!);
    expect((await db.highlights.get(hl.id))!.desc).toBe('我的说明');
    expect((await db.foodEntries.get(f.id))!.description).toBe('主用户写的');
    expect((await myLocalChanges(tripId)).map((c) => c.itemId)).toEqual([`highlight:${hl.id}`]);
  });

  it('同伴删掉美食也能提交；恢复成主用户版本会连照片一起回来', async () => {
    const tripId = await setup();
    const f = (await db.foodEntries.toArray())[0];
    await db.foodEntries.delete(f.id);
    const c = (await myLocalChanges(tripId)).find((x) => x.itemId === `food:${f.id}`)!;
    expect(c.op).toBe('remove');
    await revertLocal(tripId, c.itemId);
    const back = (await db.foodEntries.get(f.id))!;
    expect(await (await db.blobs.get(back.photoKey!))!.blob.text()).toBe('PHOTO1');
    expect(await myLocalChanges(tripId)).toEqual([]);
  });

  it('主用户不采纳 → 本机不变', async () => {
    const tripId = await setup();
    const id = await addFoodEntry(tripId, food('粉饺'));
    await submitSuggestion(tripId, '', [`food:${id}`]);
    await toOwner();
    const sg = (await cloud.suggestions(tripId))[0];
    await decide(tripId, sg, { [`food:${id}`]: 'reject' });
    expect(await db.foodEntries.get(id)).toBeUndefined();
  });

  it('别人看不到同伴建议里的附件', async () => {
    const tripId = await setup();
    const id = await addFoodEntry(tripId, food('卷筒粉'), { blob: new Blob(['SECRET'], { type: 'image/jpeg' }) });
    await submitSuggestion(tripId, '', [`food:${id}`]);
    const path = [...cloud.state.files.keys()].find((k) => k.includes('/s/'))!;
    cloud.as('stranger');
    await cloud.ensureSession();
    await expect(cloud.download(path)).rejects.toThrow();
    await expect(cloud.upload(`${tripId}/s/u:stranger/x`, new Blob(['x']))).rejects.toThrow();
  });
});
