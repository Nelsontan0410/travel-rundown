// 2026-10-21 美食专区的存取。只读写 foods / foodMarks 两张表；
// 唯一会碰行程的是 swapMealTo（改去这家），它走 repo.updateItem，和手动编辑行程完全一样。
import { db } from './schema';
import { uuid } from './uuid';
import { updateItem } from './repo';
import { cleanFood, foodIdentity, FOOD_LIMITS, swapPatch, type FoodInput, type FoodMark, type FoodSpot } from '../domain/food';

export type { FoodInput };

const now = () => new Date().toISOString();

async function nextOrder(tripId: string): Promise<number> {
  const all = await db.foods.where('tripId').equals(tripId).toArray();
  return all.reduce((n, f) => Math.max(n, f.order), -1) + 1;
}

export async function addFood(tripId: string, input: FoodInput): Promise<string> {
  const f = cleanFood(input);
  if (!f.name) throw new Error('店名不能空着');
  if ((await db.foods.where('tripId').equals(tripId).count()) >= FOOD_LIMITS.spots) throw new Error(`美食最多 ${FOOD_LIMITS.spots} 家`);
  const id = uuid();
  const ts = now();
  await db.foods.put({ ...f, kind: f.kind ?? 'meal', source: input.source ?? 'manual', id, tripId, order: await nextOrder(tripId), createdAt: ts, updatedAt: ts });
  return id;
}

/** patch 里给 undefined 的字段会被清掉（表单清空某一栏） */
export async function updateFood(id: string, patch: Partial<FoodInput>): Promise<void> {
  const cur = await db.foods.get(id);
  if (!cur) return;
  const merged = cleanFood({ ...cur, ...patch, id: cur.id, tripId: cur.tripId, order: cur.order, createdAt: cur.createdAt });
  if (!merged.name) throw new Error('店名不能空着');
  await db.foods.put({ ...merged, updatedAt: now() });
}

export async function deleteFood(id: string): Promise<void> {
  await db.transaction('rw', db.foods, db.foodMarks, async () => {
    const f = await db.foods.get(id);
    if (!f) return;
    await db.foods.delete(id);
    await db.foodMarks.delete([f.tripId, id]);
  });
}

/** 上移 / 下移（按当前整份顺序交换） */
export async function moveFood(id: string, dir: -1 | 1): Promise<void> {
  await db.transaction('rw', db.foods, async () => {
    const f = await db.foods.get(id);
    if (!f) return;
    const all = (await db.foods.where('tripId').equals(f.tripId).toArray()).sort((a, b) => a.order - b.order);
    const i = all.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= all.length) return;
    const ts = now();
    await db.foods.bulkPut([
      { ...all[i], order: all[j].order, updatedAt: ts },
      { ...all[j], order: all[i].order, updatedAt: ts },
    ]);
  });
}

export async function setFoodMark(tripId: string, foodId: string, patch: { ate?: boolean; fav?: boolean }): Promise<void> {
  const cur = await db.foodMarks.get([tripId, foodId]);
  const next: FoodMark = { tripId, foodId, ...cur, ...patch, updatedAt: now() };
  if (!next.ate) delete next.ate;
  if (!next.fav) delete next.fav;
  if (!next.ate && !next.fav) await db.foodMarks.delete([tripId, foodId]);
  else await db.foodMarks.put(next);
}

export interface FoodImportResult {
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * 导入美食清单：按「店名 + 城市」合并。已有的店更新内容（id、顺序、吃过 / 收藏不变），新店接在最后。
 * 清单里没有的店不删除（可能是自己手动加的）。
 */
export async function importFoods(tripId: string, rows: FoodInput[], opts: { keepExisting?: boolean } = {}): Promise<FoodImportResult> {
  const res: FoodImportResult = { added: 0, updated: 0, unchanged: 0 };
  await db.transaction('rw', db.foods, async () => {
    const all = await db.foods.where('tripId').equals(tripId).toArray();
    const byId = new Map(all.map((f) => [foodIdentity(f), f]));
    let order = all.reduce((n, f) => Math.max(n, f.order), -1) + 1;
    const ts = now();
    const puts: FoodSpot[] = [];
    for (const raw of rows) {
      const r = cleanFood(raw);
      if (!r.name) continue;
      const old = byId.get(foodIdentity(r));
      if (old && opts.keepExisting) {
        res.unchanged++;
        continue;
      }
      if (old) {
        const merged = cleanFood({ ...old, ...r, source: old.source, id: old.id, tripId, order: old.order, createdAt: old.createdAt, updatedAt: old.updatedAt });
        if (JSON.stringify(merged) === JSON.stringify(old)) res.unchanged++;
        else {
          puts.push({ ...merged, updatedAt: ts });
          res.updated++;
        }
        continue;
      }
      if (all.length + res.added >= FOOD_LIMITS.spots) break;
      const f: FoodSpot = { ...r, kind: r.kind ?? 'meal', source: raw.source ?? 'import', id: uuid(), tripId, order: order++, createdAt: ts, updatedAt: ts };
      byId.set(foodIdentity(f), f);
      puts.push(f);
      res.added++;
    }
    if (puts.length) await db.foods.bulkPut(puts);
  });
  return res;
}

/**
 * 原定那一餐吃不成，改去美食专区里的一家：
 * 那一餐的标题、地点、必吃换成这家，原计划写进「备选方案」；原计划的店如果不在美食专区里，自动收进来。
 * 完成状态、证明、账本由 updateItem 按导入规则迁移。
 */
export async function swapMealTo(itemId: string, foodId: string): Promise<void> {
  const item = await db.items.get(itemId);
  const food = await db.foods.get(foodId);
  if (!item || !food || item.type !== 'meal') throw new Error('找不到这一餐或这家店');
  const day = await db.days.get(item.dayId);
  const keep: FoodInput = {
    name: item.place?.name || item.title,
    place: item.place,
    city: day?.city,
    kind: 'meal',
    meals: item.meal ? [item.meal] : undefined,
    mustTry: item.mustDo,
    note: item.note,
    dayIndexes: day ? [day.index] : undefined,
    source: 'itinerary',
  };
  await importFoods(item.tripId, [keep], { keepExisting: true });
  await updateItem(itemId, swapPatch(item, food));
}
