// 2026-10-23 全新美食专区的存取。只读写 foodEntries 表和 food:<id>:… 照片；不碰行程或其他模块的资料。
// 同日改成每个旅程一本：新增时要给 tripId，数量上限和排列顺序都按旅程算。
import { db } from './schema';
import { uuid } from './uuid';
import { thumbKeyOf } from '../lib/photo';
import { cleanFoodDraft, FOOD_LIMITS, foodPhotoKeyPrefix, pickTripForFood, validateFood, type FoodDraft, type FoodEntry } from '../domain/food';

const now = () => new Date().toISOString();

/** 照片：undefined = 不变；null = 移除；{ blob, thumb } = 换成新照片 */
export type PhotoChange = undefined | null | { blob: Blob; thumb?: Blob };

function assertValid(d: Partial<FoodDraft>): FoodDraft {
  const errs = validateFood(d);
  const first = Object.values(errs)[0];
  if (first) throw new Error(first);
  return cleanFoodDraft(d) as FoodDraft;
}

const photoKeys = (key: string | undefined) => (key ? [key, thumbKeyOf(key)] : []);

export async function addFoodEntry(tripId: string, draft: Partial<FoodDraft>, photo?: PhotoChange): Promise<string> {
  if (!tripId) throw new Error('请先导入或选择一份旅程');
  const d = assertValid(draft);
  const id = uuid();
  await db.transaction('rw', db.foodEntries, db.blobs, async () => {
    const all = await db.foodEntries.where('tripId').equals(tripId).toArray();
    if (all.length >= FOOD_LIMITS.entries) throw new Error(`每个旅程的美食最多 ${FOOD_LIMITS.entries} 道`);
    const order = all.reduce((m, f) => Math.max(m, f.order), -1) + 1;
    const ts = now();
    const entry: FoodEntry = { ...d, id, tripId, order, createdAt: ts, updatedAt: ts };
    if (photo) {
      const key = `${foodPhotoKeyPrefix(id)}${uuid()}`;
      await db.blobs.put({ key, blob: photo.blob });
      if (photo.thumb) await db.blobs.put({ key: thumbKeyOf(key), blob: photo.thumb });
      entry.photoKey = key;
    }
    await db.foodEntries.put(entry);
  });
  return id;
}

/** 整份替换表单内容（表单里清空的字段会被清掉）；照片按 PhotoChange 处理，旧照片一并删除 */
export async function updateFoodEntry(id: string, draft: Partial<FoodDraft>, photo?: PhotoChange): Promise<void> {
  const d = assertValid(draft);
  await db.transaction('rw', db.foodEntries, db.blobs, async () => {
    const cur = await db.foodEntries.get(id);
    if (!cur) throw new Error('这道美食已经被删除');
    const next: FoodEntry = { ...d, id, ...(cur.tripId ? { tripId: cur.tripId } : {}), order: cur.order, createdAt: cur.createdAt, updatedAt: now() };
    if (cur.photoKey) next.photoKey = cur.photoKey;
    if (photo === null) {
      await db.blobs.bulkDelete(photoKeys(cur.photoKey));
      delete next.photoKey;
      delete next.photoFocus;
    } else if (photo) {
      // 每次换照片用新的键：Gallery、预载里的旧图不会被误用
      const key = `${foodPhotoKeyPrefix(id)}${uuid()}`;
      await db.blobs.put({ key, blob: photo.blob });
      if (photo.thumb) await db.blobs.put({ key: thumbKeyOf(key), blob: photo.thumb });
      await db.blobs.bulkDelete(photoKeys(cur.photoKey));
      next.photoKey = key;
    }
    await db.foodEntries.put(next);
  });
}

/** 删除一道美食和它的照片 */
export async function deleteFoodEntry(id: string): Promise<void> {
  await db.transaction('rw', db.foodEntries, db.blobs, async () => {
    const cur = await db.foodEntries.get(id);
    if (!cur) return;
    await db.blobs.bulkDelete(photoKeys(cur.photoKey));
    await db.foodEntries.delete(id);
  });
}

/** 全部美食照片的键（备份用） */
export async function foodBlobKeys(): Promise<string[]> {
  return (await db.foodEntries.toArray()).flatMap((f) => photoKeys(f.photoKey));
}

/** 没有归属旅程的美食（旧备份恢复进来的）归到对应旅程，规则同 Dexie v8 升级 */
export async function adoptOrphanFood(): Promise<number> {
  return db.transaction('rw', db.foodEntries, db.trips, db.settings, async () => {
    const orphans = (await db.foodEntries.toArray()).filter((f) => !f.tripId);
    if (!orphans.length) return 0;
    const trips = await db.trips.toArray();
    const last = (await db.settings.get('app'))?.lastTripId;
    let n = 0;
    for (const f of orphans) {
      const t = pickTripForFood(f, trips, last);
      if (t) {
        await db.foodEntries.update(f.id, { tripId: t });
        n += 1;
      }
    }
    return n;
  });
}
