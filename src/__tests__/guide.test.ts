// 2026-10-20 旅行亮点：纯函数、本机存取、重新导入不覆盖、备份往返、随版本同步给同伴、照片检查
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { deleteTrip, exportBackup, restoreBackup, saveImport } from '../db/repo';
import { moveTip, toggleTip } from '../db/guide';
import { addHighlight, addTip, deleteHighlight, reorderHighlights, setCoverFocus, setDayFocus, setDayHidden, setDayPhoto, setDayTitle, setHighlightPhoto, setIntro, updateHighlight } from '../db/guide';
import { candidatesFrom, clampFocus, dayPicks, focusStyle, linkState, moveId, moveTipIn, moveTo, visibleHighlights } from '../domain/guide';
import { checkPhotoFile, fitSize, storageErrorText, thumbKeyOf } from '../lib/photo';
import { setBackend } from '../cloud/backend';
import { enableSync, joinWithCode, pendingChanges, publishUpdate } from '../cloud/sync';
import { fakeCloud } from './cloudFake';

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});

async function trip() {
  const id = await saveImport(parseMd(md), md);
  const days = await db.days.where('tripId').equals(id).toArray();
  const items = await db.items.where('tripId').equals(id).toArray();
  return { id, days, items };
}
const img = (s = 'PHOTO') => new Blob([s], { type: 'image/jpeg' });

describe('纯函数', () => {
  it('排序：上移下移和拖动结果一致，越界不动', () => {
    const o = ['a', 'b', 'c', 'd'];
    expect(moveId(o, 'b', -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveId(o, 'd', 1)).toEqual(o);
    expect(moveId(o, 'a', -1)).toEqual(o);
    expect(moveTo(o, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveTo(o, 'a', 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveTo(o, 'zz', 1)).toEqual(o);
  });
  it('照片位置限制在范围内', () => {
    expect(clampFocus({ x: -1, y: 2, zoom: 9 })).toEqual({ x: 0, y: 1, zoom: 3 });
    expect(clampFocus({ x: NaN, y: 0.5, zoom: 0.2 })).toEqual({ x: 0, y: 0.5, zoom: 1 });
    expect(focusStyle(undefined).objectPosition).toBe('50.0% 50.0%');
    expect(focusStyle({ x: 0.2, y: 0.8, zoom: 2 }).transform).toBe('scale(2)');
  });
  it('可选项目：只有景点、餐厅、住宿等，不含航班和交通；支持搜索；标记已添加', async () => {
    const { id, days, items } = await trip();
    const c = candidatesFrom(days, items, []);
    expect(c.length).toBeGreaterThan(0);
    const types = new Set(items.filter((i) => c.some((x) => x.itemId === i.id)).map((i) => i.type));
    expect(types.has('flight')).toBe(false);
    expect(types.has('transit')).toBe(false);
    const first = c[0];
    const hid = await addHighlight({ tripId: id, title: first.title, category: first.category, itemId: first.itemId });
    const hs = await db.highlights.toArray();
    expect(candidatesFrom(days, items, hs).find((x) => x.itemId === first.itemId)!.used).toBe(true);
    expect(candidatesFrom(days, items, hs, first.title.slice(0, 2)).length).toBeGreaterThan(0);
    expect(candidatesFrom(days, items, hs, 'zzzz-no-such')).toEqual([]);
    expect(linkState((await db.highlights.get(hid))!, items)).toBe('ok');
    expect(linkState((await db.highlights.get(hid))!, [])).toBe('missing');
  });
  it('每日精选：用户的亮点排前面，不够再用当天景点；不编造内容', async () => {
    const { id, days, items } = await trip();
    const spot = items.find((i) => i.type === 'spot')!;
    const d = days.find((x) => x.id === spot.dayId)!;
    await addHighlight({ tripId: id, title: '我的最爱', category: 'spot', dayIndex: d.index });
    const dp = dayPicks(days, items, await db.highlights.toArray());
    const day = dp.find((x) => x.day.id === d.id)!;
    expect(day.picks[0]).toMatchObject({ title: '我的最爱', fromHighlight: true });
    for (const p of day.picks.filter((x) => !x.fromHighlight)) expect(items.find((i) => i.id === p.id)?.dayId).toBe(d.id);
    expect(day.picks.length).toBeLessThanOrEqual(3);
  });
});

describe('每日精选：每天的主题、照片、是否显示', () => {
  it('主题默认用行程里的；改了只存在亮点里；限长；清空回到默认；行程的这一天不变', async () => {
    const { id, days, items } = await trip();
    const d = days[0];
    const before = await db.days.get(d.id);
    expect(dayPicks(days, items, [])[0]).toMatchObject({ title: d.title || d.city, custom: false, hidden: false });
    await setDayTitle(id, d.id, '初见札幌' + '很长'.repeat(20));
    const g = (await db.guides.get(id))!;
    expect(Array.from(g.days![d.id].title!).length).toBe(24);
    expect(dayPicks(days, items, [], g.days)[0]).toMatchObject({ custom: true });
    await setDayTitle(id, d.id, '');
    expect((await db.guides.get(id))!.days?.[d.id]).toBeUndefined(); // 什么都没设就不留空对象
    expect(await db.days.get(d.id)).toEqual(before);
  });
  it('当天照片：没设时用当天第一个有照片的亮点；设了用自己的；移除回到亮点照片并清掉文件', async () => {
    const { id, days, items } = await trip();
    const spot = items.find((i) => i.type === 'spot')!;
    const d = days.find((x) => x.id === spot.dayId)!;
    await addHighlight({ tripId: id, title: spot.title, category: 'spot', itemId: spot.id, photo: img('H') });
    const hs = await db.highlights.toArray();
    expect(dayPicks(days, items, hs).find((p) => p.day.id === d.id)!.photoKey).toBe(hs[0].photoKey);
    await setDayPhoto(id, d.id, img('DAY'));
    await setDayFocus(id, d.id, { x: 0.2, y: 0.3, zoom: 1.4 });
    let g = (await db.guides.get(id))!;
    expect(g.days![d.id]).toMatchObject({ photoKey: `gday:${d.id}`, focus: { x: 0.2, y: 0.3, zoom: 1.4 } });
    expect(dayPicks(days, items, hs, g.days).find((p) => p.day.id === d.id)!.photoKey).toBe(`gday:${d.id}`);
    expect(await (await db.blobs.get(`gday:${d.id}`))!.blob.text()).toBe('DAY');
    await setDayPhoto(id, d.id, null);
    g = (await db.guides.get(id))!;
    expect(await db.blobs.get(`gday:${d.id}`)).toBeUndefined();
    expect(dayPicks(days, items, hs, g.days).find((p) => p.day.id === d.id)!.photoKey).toBe(hs[0].photoKey);
  });
  it('不显示某一天：只是标记，行程不变；删除旅程会清掉当天照片', async () => {
    const { id, days, items } = await trip();
    await setDayHidden(id, days[1].id, true);
    await setDayPhoto(id, days[2].id, img());
    const g = (await db.guides.get(id))!;
    expect(dayPicks(days, items, [], g.days).filter((p) => p.hidden).map((p) => p.day.id)).toEqual([days[1].id]);
    expect(await db.days.where('tripId').equals(id).count()).toBe(days.length);
    await deleteTrip(id);
    expect(await db.blobs.get(`gday:${days[2].id}`)).toBeUndefined();
  });
  it('重新导入：按第几天沿用 Day id，每天的主题和照片保留', async () => {
    const { id, days } = await trip();
    await setDayTitle(id, days[0].id, '我的第一天');
    await setDayPhoto(id, days[0].id, img('KEEP'));
    await saveImport(parseMd(md), md, id);
    const after = await db.days.where('tripId').equals(id).toArray();
    expect(after.some((d) => d.id === days[0].id)).toBe(true);
    expect((await db.guides.get(id))!.days![days[0].id]).toMatchObject({ title: '我的第一天', photoKey: `gday:${days[0].id}` });
  });
});

describe('实用信息：贴士与清单', () => {
  it('同类里排序，不影响其他类；清单勾选；刷新后（重新读）保持', async () => {
    const t = (id: string, category: 'checklist' | 'food') => ({ id, category, text: id });
    const tips = [t('a', 'checklist'), t('x', 'food'), t('b', 'checklist'), t('c', 'checklist')];
    expect(moveTipIn(tips, 'b', -1).map((x) => x.id)).toEqual(['b', 'x', 'a', 'c']);
    expect(moveTipIn(tips, 'a', -1)).toEqual(tips);
    expect(moveTipIn(tips, 'c', 1)).toEqual(tips);
    const { id } = await trip();
    const a = await addTip(id, 'checklist', '确认预约');
    const b = await addTip(id, 'checklist', '准备手信');
    await addTip(id, 'food', '老友粉');
    await moveTip(id, b, -1);
    await toggleTip(id, a, true);
    const g = (await db.guides.get(id))!;
    expect(g.tips.filter((x) => x.category === 'checklist').map((x) => [x.text, !!x.done])).toEqual([['准备手信', false], ['确认预约', true]]);
    await toggleTip(id, a, false);
    expect((await db.guides.get(id))!.tips.find((x) => x.id === a)!.done).toBeUndefined();
  });
});

describe('照片：裁切比例与缩略图', () => {
  it('裁切比例只接受四种；缩略图跟着换、移除、删除一起清掉；存储满了有看得懂的提示', async () => {
    expect(clampFocus({ x: 0.5, y: 0.5, zoom: 1, ratio: '3:4' }).ratio).toBe('3:4');
    expect(clampFocus({ x: 0.5, y: 0.5, zoom: 1, ratio: '5:4' as never }).ratio).toBeUndefined();
    const { id } = await trip();
    const h = await addHighlight({ tripId: id, title: 'A', category: 'spot', photo: img('M'), thumb: img('T') });
    const key = `hl:${h}`;
    expect(await (await db.blobs.get(thumbKeyOf(key)))!.blob.text()).toBe('T');
    await setHighlightPhoto(h, img('M2'));  // 换照片没给缩略图：旧缩略图不能留着
    expect(await db.blobs.get(thumbKeyOf(key))).toBeUndefined();
    await setHighlightPhoto(h, img('M3'), img('T3'));
    await updateHighlight(h, { focus: { x: 0.3, y: 0.4, zoom: 1.2, ratio: '1:1' } });
    expect((await db.highlights.get(h))!.focus).toEqual({ x: 0.3, y: 0.4, zoom: 1.2, ratio: '1:1' });
    await setHighlightPhoto(h, null);
    expect(await db.blobs.get(key)).toBeUndefined();
    expect(await db.blobs.get(thumbKeyOf(key))).toBeUndefined();
    const h2 = await addHighlight({ tripId: id, title: 'B', category: 'spot', photo: img(), thumb: img() });
    await deleteHighlight(h2);
    expect(await db.blobs.get(thumbKeyOf(`hl:${h2}`))).toBeUndefined();
    expect(storageErrorText({ name: 'QuotaExceededError' })).toContain('存储空间不够');
    expect(storageErrorText({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toContain('存储空间不够');
    expect(storageErrorText(new Error('x'))).toBeUndefined();
  });
});

describe('照片检查', () => {
  it('长边缩到 1600，不放大；非图片、过大会被拒绝', () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(checkPhotoFile({ type: 'application/pdf', size: 10, name: 'a.pdf' })).toBe('type');
    expect(checkPhotoFile({ type: '', size: 10, name: 'IMG_1.HEIC' })).toBeNull();
    expect(checkPhotoFile({ type: 'image/jpeg', size: 31 * 1024 * 1024 })).toBe('big');
    expect(checkPhotoFile({ type: 'image/png', size: 1000 })).toBeNull();
  });
});

describe('本机存取', () => {
  it('新增、改文字（长度限制、标题不能清空）、换照片、移除照片、排序、隐藏、删除', async () => {
    const { id } = await trip();
    const a = await addHighlight({ tripId: id, title: '青秀山', category: 'spot', photo: img('A') });
    const b = await addHighlight({ tripId: id, title: '老友粉', category: 'food' });
    const c = await addHighlight({ tripId: id, title: '三街两巷', category: 'culture' });
    expect((await db.highlights.get(a))!.photoKey).toBe(`hl:${a}`);
    expect(await (await db.blobs.get(`hl:${a}`))!.blob.text()).toBe('A');
    await expect(addHighlight({ tripId: id, title: '   ', category: 'spot' })).rejects.toThrow();

    await updateHighlight(b, { title: 'x'.repeat(100), desc: 'y'.repeat(500) });
    const rb = (await db.highlights.get(b))!;
    expect(Array.from(rb.title).length).toBe(40);
    expect(Array.from(rb.desc!).length).toBe(140);
    await updateHighlight(b, { title: '   ' });
    expect((await db.highlights.get(b))!.title).toBe(rb.title); // 标题不允许清空

    await setHighlightPhoto(a, img('A2'));
    expect(await (await db.blobs.get(`hl:${a}`))!.blob.text()).toBe('A2');
    await setHighlightPhoto(a, null);
    expect(await db.blobs.get(`hl:${a}`)).toBeUndefined();
    expect((await db.highlights.get(a))!.photoKey).toBeUndefined();

    await reorderHighlights(id, [c, a, b]);
    expect((await db.highlights.toArray()).sort((x, y) => x.order - y.order).map((h) => h.id)).toEqual([c, a, b]);
    await updateHighlight(a, { hidden: true });
    expect(visibleHighlights(await db.highlights.toArray()).map((h) => h.id)).toEqual([c, b]);
    await updateHighlight(a, { hidden: false });
    expect(visibleHighlights(await db.highlights.toArray()).length).toBe(3);

    await setHighlightPhoto(c, img('C'));
    await deleteHighlight(c);
    expect(await db.highlights.get(c)).toBeUndefined();
    expect(await db.blobs.get(`hl:${c}`)).toBeUndefined();
  });

  it('删除关联了行程项的亮点：行程项、每天、资料完全不受影响', async () => {
    const { id, items } = await trip();
    const it = items.find((i) => i.type === 'spot')!;
    const h = await addHighlight({ tripId: id, title: it.title, category: 'spot', itemId: it.id });
    const before = await db.items.where('tripId').equals(id).toArray();
    await updateHighlight(h, { hidden: true });
    await deleteHighlight(h);
    expect(await db.items.where('tripId').equals(id).toArray()).toEqual(before);
  });

  it('简介、封面位置、贴士：长度限制，空贴士不能加', async () => {
    const { id } = await trip();
    await setIntro(id, 'z'.repeat(300));
    await setCoverFocus(id, { x: 2, y: -1, zoom: 5 });
    await addTip(id, 'food', '老友粉');
    await expect(addTip(id, 'note', '  ')).rejects.toThrow();
    const g = (await db.guides.get(id))!;
    expect(Array.from(g.intro!).length).toBe(120);
    expect(g.coverFocus).toEqual({ x: 1, y: 0, zoom: 3 });
    expect(g.tips).toHaveLength(1);
  });

  it('重新导入行程：亮点和照片原样保留，关联的行程项 id 不变；行程项没了只提示、不删亮点', async () => {
    const { id, items } = await trip();
    const it = items.find((i) => i.type === 'spot')!;
    const h = await addHighlight({ tripId: id, title: '我的标题', desc: '我写的', category: 'spot', itemId: it.id, photo: img('KEEP') });
    await setIntro(id, '我的简介');
    await saveImport(parseMd(md), md, id);
    const after = (await db.highlights.get(h))!;
    expect(after).toMatchObject({ title: '我的标题', desc: '我写的', itemId: it.id });
    expect((await db.guides.get(id))!.intro).toBe('我的简介');
    expect(await (await db.blobs.get(`hl:${h}`))!.blob.text()).toBe('KEEP');
    expect(linkState(after, await db.items.where('tripId').equals(id).toArray())).toBe('ok');
    // 导入一份少了这一项的行程
    const md2 = md.split('\n').filter((l) => !l.includes(it.title)).join('\n');
    await saveImport(parseMd(md2), md2, id);
    const still = (await db.highlights.get(h))!;
    expect(still.title).toBe('我的标题');
    expect(linkState(still, await db.items.where('tripId').equals(id).toArray())).toBe('missing');
  });

  it('删除旅程时一并清掉亮点、简介和照片', async () => {
    const { id } = await trip();
    const h = await addHighlight({ tripId: id, title: 'A', category: 'spot', photo: img() });
    await setIntro(id, 'x');
    await deleteTrip(id);
    expect(await db.highlights.count()).toBe(0);
    expect(await db.guides.count()).toBe(0);
    expect(await db.blobs.get(`hl:${h}`)).toBeUndefined();
  });

  it('备份 → 恢复：亮点、简介、照片都在', async () => {
    const { id } = await trip();
    const h = await addHighlight({ tripId: id, title: '备份测试', category: 'food', photo: img('BK') });
    await setIntro(id, '简介');
    const zip = await exportBackup();
    for (const t of db.tables) await t.clear();
    await restoreBackup(zip);
    expect((await db.highlights.get(h))!.title).toBe('备份测试');
    expect((await db.guides.get(id))!.intro).toBe('简介');
    expect(await (await db.blobs.get(`hl:${h}`))!.blob.text()).toBe('BK');
  });
});

describe('随版本同步给同伴', () => {
  const devices = new Map<string, Record<string, unknown[]>>();
  let cur: string | undefined;
  async function useDevice(name: string) {
    if (cur) {
      const dump: Record<string, unknown[]> = {};
      for (const t of db.tables) dump[t.name] = await t.toArray();
      devices.set(cur, dump);
    }
    for (const t of db.tables) await t.clear();
    const next = devices.get(name);
    if (next) for (const t of db.tables) await t.bulkPut(next[t.name] as never[]);
    cur = name;
  }
  it('主用户的亮点、封面位置、简介、贴士和照片：发布后同伴加入就能看到；之后的修改出现在「还没发布的改动」里', async () => {
    devices.clear();
    cur = undefined;
    const cloud = fakeCloud();
    setBackend(cloud);
    await useDevice('owner');
    cloud.as('o');
    const { id, items } = await trip();
    const it = items.find((i) => i.type === 'spot')!;
    const h1 = await addHighlight({ tripId: id, title: '青秀山', category: 'spot', itemId: it.id, photo: img('P1') });
    const h2 = await addHighlight({ tripId: id, title: '老友粉', category: 'food' });
    await updateHighlight(h2, { hidden: true });
    await setIntro(id, '一趟充满广西味道的旅行');
    await setCoverFocus(id, { x: 0.3, y: 0.6, zoom: 1.5 });
    await addTip(id, 'photo', '一早拍摄');
    const d0 = (await db.days.where('tripId').equals(id).toArray()).sort((a, b) => a.index - b.index)[0];
    await setDayTitle(id, d0.id, '初见札幌');
    await setDayPhoto(id, d0.id, img('DAYP'));
    await enableSync(id, '阿权');
    const code = await cloud.createInvite(id, '小明');

    await useDevice('mate');
    cloud.as('m');
    await joinWithCode(code, '小明');
    const g = (await db.guides.get(id))!;
    expect(g).toMatchObject({ intro: '一趟充满广西味道的旅行', coverFocus: { x: 0.3, y: 0.6, zoom: 1.5 } });
    expect(g.tips.map((t) => t.text)).toEqual(['一早拍摄']);
    const hs = (await db.highlights.where('tripId').equals(id).toArray()).sort((a, b) => a.order - b.order);
    expect(hs.map((h) => [h.id, h.title, h.hidden])).toEqual([[h1, '青秀山', false], [h2, '老友粉', true]]);
    expect(hs[0].itemId).toBe(it.id);
    expect(await (await db.blobs.get(hs[0].photoKey!))!.blob.text()).toBe('P1');
    expect(g.days![d0.id].title).toBe('初见札幌');
    expect(await (await db.blobs.get(g.days![d0.id].photoKey!))!.blob.text()).toBe('DAYP');

    await useDevice('owner');
    cloud.as('o');
    expect((await pendingChanges(id)).guide).toEqual([]);
    await updateHighlight(h1, { desc: '俯瞰南宁' });
    await reorderHighlights(id, [h2, h1]);
    await deleteHighlight(h2);
    await setDayHidden(id, d0.id, true);
    const d = await pendingChanges(id);
    expect(d.guide).toContain('每日精选');
    expect(d.count).toBeGreaterThan(0);
    expect(d.guide.some((l) => l.includes('修改亮点 · 青秀山'))).toBe(true);
    expect(d.guide.some((l) => l.includes('删除亮点 · 老友粉'))).toBe(true);
    await publishUpdate(id, '更新亮点', false);

    await useDevice('mate');
    cloud.as('m');
    const { checkUpdates, previewUpdate, applyUpdate } = await import('../cloud/sync');
    expect(Object.keys(await checkUpdates())).toContain(id);
    const pv = (await previewUpdate(id))!;
    expect(pv.diff.guide.length).toBeGreaterThan(0);
    await applyUpdate(id, pv);
    const after = await db.highlights.where('tripId').equals(id).toArray();
    expect(after.map((h) => h.id)).toEqual([h1]);
    expect(after[0].desc).toBe('俯瞰南宁');
  });

  it('没写任何亮点内容的旅程：快照不带 guide，也没有多余的「亮点」改动', async () => {
    devices.clear();
    cur = undefined;
    const cloud = fakeCloud();
    setBackend(cloud);
    await useDevice('owner2');
    cloud.as('o2');
    const { id } = await trip();
    await enableSync(id, '阿权');
    const base = (await db.cloudBases.get(id))!;
    expect(base.snapshot.guide).toBeUndefined();
    expect((await pendingChanges(id)).guide).toEqual([]);
  });
});
