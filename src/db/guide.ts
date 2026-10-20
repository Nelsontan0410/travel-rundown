// 旅行亮点的存取。只读写 guides / highlights 两张表和 hl:<id> 照片；绝不碰行程项、每天、资料。
import { db } from './schema';
import { thumbKeyOf } from '../lib/photo';
import { uuid } from './uuid';
import { clamp, clampFocus, clean, LIMITS, moveTipIn, type Focus, type Guide, type GuideDay, type GuideTip, type Highlight, type HighlightCategory, type TipCategory } from '../domain/guide';

const now = () => new Date().toISOString();
export const photoKeyOf = (id: string) => `hl:${id}`;
export const dayPhotoKeyOf = (dayId: string) => `gday:${dayId}`;

export async function getGuide(tripId: string): Promise<Guide> {
  return (await db.guides.get(tripId)) ?? { tripId, tips: [], updatedAt: now() };
}

async function patchGuide(tripId: string, patch: Partial<Guide>): Promise<void> {
  const cur = await getGuide(tripId);
  await db.guides.put({ ...cur, ...patch, tripId, updatedAt: now() });
}

export const setIntro = (tripId: string, text: string) => patchGuide(tripId, { intro: clean(text, LIMITS.intro) });
export const setCoverFocus = (tripId: string, f: Focus) => patchGuide(tripId, { coverFocus: clampFocus(f) });

export async function addTip(tripId: string, category: TipCategory, text: string): Promise<string> {
  const t = clean(text, LIMITS.tip);
  if (!t) throw new Error('贴士内容不能空着');
  const g = await getGuide(tripId);
  if (g.tips.length >= LIMITS.tips) throw new Error(`贴士最多 ${LIMITS.tips} 条`);
  const tip: GuideTip = { id: uuid(), category, text: t };
  await patchGuide(tripId, { tips: [...g.tips, tip] });
  return tip.id;
}
export async function updateTip(tripId: string, id: string, text: string): Promise<void> {
  const g = await getGuide(tripId);
  const t = clean(text, LIMITS.tip);
  await patchGuide(tripId, { tips: t ? g.tips.map((x) => (x.id === id ? { ...x, text: t } : x)) : g.tips.filter((x) => x.id !== id) });
}
export async function toggleTip(tripId: string, id: string, done: boolean): Promise<void> {
  const g = await getGuide(tripId);
  await patchGuide(tripId, { tips: g.tips.map((x) => (x.id === id ? { ...x, done: done || undefined } : x)) });
}
export async function moveTip(tripId: string, id: string, dir: -1 | 1): Promise<void> {
  const g = await getGuide(tripId);
  await patchGuide(tripId, { tips: moveTipIn(g.tips, id, dir) });
}
export async function removeTip(tripId: string, id: string): Promise<void> {
  const g = await getGuide(tripId);
  await patchGuide(tripId, { tips: g.tips.filter((x) => x.id !== id) });
}

export interface NewHighlight {
  tripId: string;
  title: string;
  category: HighlightCategory;
  desc?: string;
  dayIndex?: number;
  itemId?: string;
  photo?: Blob;
  thumb?: Blob;
}

export async function addHighlight(input: NewHighlight): Promise<string> {
  const title = clean(input.title, LIMITS.title);
  if (!title) throw new Error('请先写个标题');
  const id = uuid();
  await db.transaction('rw', [db.highlights, db.blobs], async () => {
    const all = await db.highlights.where('tripId').equals(input.tripId).toArray();
    const order = all.reduce((m, h) => Math.max(m, h.order), -1) + 1;
    const hl: Highlight = {
      id,
      tripId: input.tripId,
      category: input.category,
      title,
      desc: clean(input.desc, LIMITS.desc),
      dayIndex: input.dayIndex,
      itemId: input.itemId,
      order,
      hidden: false,
      updatedAt: now(),
    };
    if (input.photo) {
      await db.blobs.put({ key: photoKeyOf(id), blob: input.photo });
      if (input.thumb) await db.blobs.put({ key: thumbKeyOf(photoKeyOf(id)), blob: input.thumb });
      hl.photoKey = photoKeyOf(id);
    }
    await db.highlights.put(hl);
  });
  return id;
}

export async function updateHighlight(
  id: string,
  patch: Partial<Pick<Highlight, 'title' | 'desc' | 'category' | 'dayIndex' | 'focus' | 'hidden'>>,
): Promise<void> {
  const cur = await db.highlights.get(id);
  if (!cur) return;
  const next: Highlight = { ...cur, updatedAt: now() };
  if (patch.title !== undefined) next.title = clean(patch.title, LIMITS.title) ?? cur.title; // 标题不允许清空
  if (patch.desc !== undefined) next.desc = clean(patch.desc, LIMITS.desc);
  if (patch.category) next.category = patch.category;
  if ('dayIndex' in patch) next.dayIndex = patch.dayIndex;
  if (patch.focus) next.focus = clampFocus(patch.focus);
  if (patch.hidden !== undefined) next.hidden = patch.hidden;
  await db.highlights.put(next);
}

/** 换照片；blob 为 null 表示移除。自己上传的旧照片一并清掉 */
export async function setHighlightPhoto(id: string, blob: Blob | null, thumb?: Blob): Promise<void> {
  await db.transaction('rw', [db.highlights, db.blobs], async () => {
    const cur = await db.highlights.get(id);
    if (!cur) return;
    const next: Highlight = { ...cur, updatedAt: now(), focus: undefined };
    if (blob) {
      await db.blobs.put({ key: photoKeyOf(id), blob });
      if (thumb) await db.blobs.put({ key: thumbKeyOf(photoKeyOf(id)), blob: thumb });
      else await db.blobs.delete(thumbKeyOf(photoKeyOf(id)));
      next.photoKey = photoKeyOf(id);
    } else {
      if (cur.photoKey?.startsWith('hl:')) await db.blobs.bulkDelete([cur.photoKey, thumbKeyOf(cur.photoKey)]);
      delete next.photoKey;
    }
    await db.highlights.put(next);
  });
}

/** 按给定 id 顺序重排整份亮点（含隐藏的） */
export async function reorderHighlights(tripId: string, ids: string[]): Promise<void> {
  await db.transaction('rw', db.highlights, async () => {
    const all = await db.highlights.where('tripId').equals(tripId).toArray();
    const byId = new Map(all.map((h) => [h.id, h]));
    const seen = new Set<string>();
    let n = 0;
    const ts = now();
    for (const id of [...ids, ...all.map((h) => h.id)]) {
      const h = byId.get(id);
      if (!h || seen.has(id)) continue;
      seen.add(id);
      if (h.order !== n) await db.highlights.put({ ...h, order: n, updatedAt: ts });
      n++;
    }
  });
}

/** 删除亮点：只删这条展示资料和它自己的照片，关联的行程项不动 */
export async function deleteHighlight(id: string): Promise<void> {
  await db.transaction('rw', [db.highlights, db.blobs], async () => {
    const cur = await db.highlights.get(id);
    if (!cur) return;
    if (cur.photoKey?.startsWith('hl:')) await db.blobs.bulkDelete([cur.photoKey, thumbKeyOf(cur.photoKey)]);
    await db.highlights.delete(id);
  });
}

// ———— 每日精选：某一天的主题、照片、是否显示（只存在旅行亮点里，不改行程） ————
async function patchDay(tripId: string, dayId: string, fn: (d: GuideDay) => GuideDay): Promise<void> {
  const g = await getGuide(tripId);
  const days = { ...(g.days ?? {}) };
  const next = fn({ ...(days[dayId] ?? {}) });
  // 什么都没设的就不留空对象
  if (!next.title && !next.photoKey && !next.hidden && !next.focus) delete days[dayId];
  else days[dayId] = next;
  await patchGuide(tripId, { days });
}
export const setDayTitle = (tripId: string, dayId: string, title: string) =>
  patchDay(tripId, dayId, (d) => ({ ...d, title: clean(title, LIMITS.dayTitle) }));
export const setDayHidden = (tripId: string, dayId: string, hidden: boolean) => patchDay(tripId, dayId, (d) => ({ ...d, hidden: hidden || undefined }));
export const setDayFocus = (tripId: string, dayId: string, f: Focus) => patchDay(tripId, dayId, (d) => (d.photoKey ? { ...d, focus: clampFocus(f) } : d));
/** 换这一天的代表照片；blob 为 null 表示移除（回到用当天亮点的照片） */
export async function setDayPhoto(tripId: string, dayId: string, blob: Blob | null, thumb?: Blob): Promise<void> {
  await db.transaction('rw', [db.guides, db.blobs], async () => {
    const key = dayPhotoKeyOf(dayId);
    if (blob) {
      await db.blobs.put({ key, blob });
      if (thumb) await db.blobs.put({ key: thumbKeyOf(key), blob: thumb });
      else await db.blobs.delete(thumbKeyOf(key));
    } else {
      const cur = (await getGuide(tripId)).days?.[dayId]?.photoKey;
      if (cur?.startsWith('gday:')) await db.blobs.bulkDelete([cur, thumbKeyOf(cur)]);
    }
    await patchDay(tripId, dayId, (d) => (blob ? { ...d, photoKey: key, focus: undefined } : { ...d, photoKey: undefined, focus: undefined }));
  });
}

/** 这份旅程旅行亮点用到的所有照片键（亮点 + 每天） */
export function guidePhotoKeys(g: Guide | undefined, hs: Highlight[]): string[] {
  return [...hs.flatMap((h) => (h.photoKey ? [h.photoKey] : [])), ...Object.values(g?.days ?? {}).flatMap((d) => (d.photoKey ? [d.photoKey] : []))];
}

/** 删除旅程时清掉它的全部旅行亮点和照片 */
export async function clearGuide(tripId: string): Promise<void> {
  const hs = await db.highlights.where('tripId').equals(tripId).toArray();
  const keys = guidePhotoKeys(await db.guides.get(tripId), hs);
  await db.blobs.bulkDelete([...keys, ...keys.map(thumbKeyOf)]);
  await db.highlights.where('tripId').equals(tripId).delete();
  await db.guides.delete(tripId);
}

export { clamp };
