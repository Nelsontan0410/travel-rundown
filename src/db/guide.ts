// 旅行亮点的存取。只读写 guides / highlights 两张表和 hl:<id> 照片；绝不碰行程项、每天、资料。
import { db } from './schema';
import { uuid } from './uuid';
import { clamp, clampFocus, clean, LIMITS, type Focus, type Guide, type GuideTip, type Highlight, type HighlightCategory, type TipCategory } from '../domain/guide';

const now = () => new Date().toISOString();
export const photoKeyOf = (id: string) => `hl:${id}`;

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
export async function setHighlightPhoto(id: string, blob: Blob | null): Promise<void> {
  await db.transaction('rw', [db.highlights, db.blobs], async () => {
    const cur = await db.highlights.get(id);
    if (!cur) return;
    const next: Highlight = { ...cur, updatedAt: now(), focus: undefined };
    if (blob) {
      await db.blobs.put({ key: photoKeyOf(id), blob });
      next.photoKey = photoKeyOf(id);
    } else {
      if (cur.photoKey?.startsWith('hl:')) await db.blobs.delete(cur.photoKey);
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
    if (cur.photoKey?.startsWith('hl:')) await db.blobs.delete(cur.photoKey);
    await db.highlights.delete(id);
  });
}

/** 删除旅程时清掉它的全部旅行亮点和照片 */
export async function clearGuide(tripId: string): Promise<void> {
  const hs = await db.highlights.where('tripId').equals(tripId).toArray();
  await db.blobs.bulkDelete(hs.flatMap((h) => (h.photoKey ? [h.photoKey] : [])));
  await db.highlights.where('tripId').equals(tripId).delete();
  await db.guides.delete(tripId);
}

export { clamp };
