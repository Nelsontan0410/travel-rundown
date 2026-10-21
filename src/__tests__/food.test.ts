// 2026-10-21 美食专区：数据、备选推荐、导入、改去这家
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { deleteTrip, exportTripPackage, restoreBackupDetailed, saveImport } from '../db/repo';
import { addFood, deleteFood, importFoods, moveFood, setFoodMark, swapMealTo, updateFood } from '../db/food';
import { filterFoods, foodAlternatives, foodCities, sameCity, type FoodMark, type FoodSpot } from '../domain/food';
import { foodPrompt, parseFoodMd } from '../importer/food';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed(): Promise<string> {
  return saveImport(parseMd(md), md);
}

const spot = (id: string, x: Partial<FoodSpot> = {}): FoodSpot => ({ id, tripId: 't', name: id, kind: 'meal', source: 'manual', order: 0, createdAt: '', updatedAt: '', ...x });

describe('备选推荐（纯函数）', () => {
  const day = { index: 2, city: '小樽' };
  const meal = { title: '三角市场海鲜丼', meal: 'lunch' as const, place: { name: '三角市场' } };

  it('同城、这天优先；吃过的和原定那家不出现', () => {
    const foods = [
      spot('札幌拉面', { city: '札幌', meals: ['lunch'], order: 0 }),
      spot('小樽寿司', { city: '小樽市', meals: ['dinner'], order: 1 }),
      spot('小樽海鲜', { city: '小樽', meals: ['lunch'], order: 2 }),
      spot('三角市场', { city: '小樽', order: 3 }),
      spot('吃过的', { city: '小樽', order: 4 }),
      spot('第二天', { city: '余市', dayIndexes: [2], order: 5 }),
    ];
    const marks = new Map<string, FoodMark>([['吃过的', { tripId: 't', foodId: '吃过的', ate: true, updatedAt: '' }]]);
    const out = foodAlternatives(meal, day, foods, marks);
    expect(out.map((a) => a.food.id)).toEqual(['小樽海鲜', '第二天', '小樽寿司', '札幌拉面']);
    expect(out[0].reasons).toEqual(['同城', '适合午餐']);
    expect(out.find((a) => a.food.id === '札幌拉面')!.nearby).toBe(false);
  });

  it('城市名互相包含算同城', () => {
    expect(sameCity('札幌', '北海道札幌市')).toBe(true);
    expect(sameCity('札幌', undefined)).toBe(false);
    expect(foodCities([spot('a', { city: '函馆' }), spot('b', { city: '札幌市' })], [{ city: '札幌' }, { city: '小樽' }])).toEqual(['札幌', '函馆']);
  });

  it('筛选：城市、餐别（没写适合的都算）、搜索必吃', () => {
    const foods = [spot('a', { city: '札幌', meals: ['dinner'], mustTry: ['味噌拉面'] }), spot('b', { city: '札幌' }), spot('c', { city: '小樽', meals: ['lunch'] })];
    const marks = new Map<string, FoodMark>();
    expect(filterFoods(foods, marks, { city: '札幌', meal: 'lunch' }).map((f) => f.id)).toEqual(['b']);
    expect(filterFoods(foods, marks, { q: '味噌' }).map((f) => f.id)).toEqual(['a']);
  });
});

describe('美食清单导入（解析）', () => {
  it('Markdown：城市标题、类型、当地名、地址、必吃、第几天', () => {
    const r = parseFoodMd(`# 美食清单
## 札幌
### [正餐] 一幻拉面 | えびそば一幻
- 菜系: 拉面
- 适合: 午餐、晚餐
- 地址: 札幌市中央区 | 札幌市中央区南7条西9
- 必吃: 虾味噌拉面；煎饺
- 价位: ¥1,200/人
- 营业: 11:00–24:00
- 预约: 不用
- 第几天: 1、3
### [甜品] 六花亭
- 适合: 都可以
## 小樽
### 不写类型的店
- 地区: 运河边
`);
    expect(r.warnings).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({
      name: '一幻拉面', city: '札幌', kind: 'meal', cuisine: '拉面', meals: ['lunch', 'dinner'], mustTry: ['虾味噌拉面', '煎饺'],
      price: '¥1,200/人', hours: '11:00–24:00', reserve: false, dayIndexes: [1, 3],
      place: { name: '一幻拉面', localName: 'えびそば一幻', address: '札幌市中央区', localAddress: '札幌市中央区南7条西9' },
    });
    expect(r.rows[1]).toMatchObject({ name: '六花亭', kind: 'dessert', meals: [] });
    expect(r.rows[2]).toMatchObject({ name: '不写类型的店', city: '小樽', kind: 'meal', note: '地区：运河边' });
  });

  it('JSON 数组也能读；坏 JSON 给提示不报错', () => {
    const r = parseFoodMd(JSON.stringify([{ name: 'A', city: '札幌', kind: '小吃', meals: ['dinner', '午餐'], mustTry: 'x、y', days: [2] }, { foo: 1 }, null]));
    expect(r.rows[0]).toMatchObject({ name: 'A', kind: 'snack', meals: ['dinner', 'lunch'], mustTry: ['x', 'y'], dayIndexes: [2] });
    expect(r.warnings).toHaveLength(2);
    expect(parseFoodMd('{bad').warnings[0]).toMatch(/JSON/);
    expect(parseFoodMd('随便写点').warnings[0]).toMatch(/没有读到/);
  });

  it('提示词带上目的地和城市', () => {
    const p = foodPrompt({ destination: '北海道，日本', cities: ['札幌', '小樽'], days: 4 });
    expect(p).toContain('北海道，日本');
    expect(p).toContain('札幌、小樽');
    expect(parseFoodMd(p.slice(p.indexOf('## 城市名'), p.indexOf('类型只能用'))).rows[0]).toMatchObject({ name: '店名中文', city: '城市名' });
  });
});

describe('美食存取', () => {
  it('新增、修改（清空字段）、排序、删除连标记一起删', async () => {
    const tripId = await seed();
    const a = await addFood(tripId, { name: '  A  ', kind: 'meal', city: '札幌', note: '排队' });
    const b = await addFood(tripId, { name: 'B', kind: 'cafe' });
    expect((await db.foods.get(a))).toMatchObject({ name: 'A', order: 0, source: 'manual' });
    await updateFood(a, { note: undefined, cuisine: '拉面' });
    expect((await db.foods.get(a))!.note).toBeUndefined();
    expect((await db.foods.get(a))!.cuisine).toBe('拉面');
    await expect(updateFood(a, { name: ' ' })).rejects.toThrow();
    await moveFood(b, -1);
    expect((await db.foods.get(b))!.order).toBe(0);
    await setFoodMark(tripId, a, { fav: true });
    await setFoodMark(tripId, a, { ate: true });
    expect(await db.foodMarks.get([tripId, a])).toMatchObject({ fav: true, ate: true });
    await setFoodMark(tripId, a, { fav: false, ate: false });
    expect(await db.foodMarks.get([tripId, a])).toBeUndefined();
    await setFoodMark(tripId, a, { fav: true });
    await deleteFood(a);
    expect(await db.foodMarks.count()).toBe(0);
  });

  it('重复导入按店名 + 城市合并，保留 id、顺序和标记；手动加的不删', async () => {
    const tripId = await seed();
    const manual = await addFood(tripId, { name: '自己加的', kind: 'meal' });
    const first = await importFoods(tripId, parseFoodMd('## 札幌\n### 一幻拉面\n- 价位: 1000\n### 汤咖喱 GARAKU\n').rows);
    expect(first).toEqual({ added: 2, updated: 0, unchanged: 0 });
    const id = (await db.foods.where('tripId').equals(tripId).toArray()).find((f) => f.name === '一幻拉面')!.id;
    await setFoodMark(tripId, id, { ate: true });
    const again = await importFoods(tripId, parseFoodMd('## 札幌市\n### 一幻 拉面\n- 价位: 1200\n### 汤咖喱 GARAKU\n## 小樽\n### 一幻拉面\n').rows);
    // 「札幌市」和「札幌」不是同一个城市写法 → 按字面合并：一幻拉面|札幌市 是新的
    expect(again.added + again.updated + again.unchanged).toBe(3);
    const third = await importFoods(tripId, parseFoodMd('## 札幌\n### 一幻 拉面\n- 价位: 1200\n### 汤咖喱 GARAKU\n').rows);
    expect(third).toEqual({ added: 0, updated: 1, unchanged: 1 });
    expect((await db.foods.get(id))!.price).toBe('1200');
    expect((await db.foodMarks.get([tripId, id]))!.ate).toBe(true);
    expect(await db.foods.get(manual)).toBeTruthy();
  });

  it('改去这家：那一餐换成新店，原计划写进备选并收进美食专区，完成状态跟过去', async () => {
    const tripId = await seed();
    const meal = (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.title === '三角市场海鲜丼')!;
    await db.items.update(meal.id, { navUrl: 'https://maps.example/old', bookingRef: 'R-1', bookingStatus: 'confirmed' });
    await db.itemStates.put({ tripId, itemKey: meal.key, status: 'done', updatedAt: '' });
    const f = await addFood(tripId, { name: '小樽寿司屋', kind: 'meal', city: '小樽', place: { name: '小樽寿司屋', localName: '小樽寿司屋', address: '小樽市稲穂' }, mustTry: ['握寿司'], price: '¥3,000' });
    await swapMealTo(meal.id, f);
    const after = (await db.items.get(meal.id))!;
    expect(after).toMatchObject({ title: '小樽寿司屋', mustDo: ['握寿司'], note: '¥3,000', alt: '原计划：三角市场海鲜丼（订单 R-1）' });
    expect(after.place).toMatchObject({ name: '小樽寿司屋', address: '小樽市稲穂' });
    expect(after.navUrl).toBeUndefined();
    expect(after.bookingRef).toBeUndefined();
    expect(after.key).not.toBe(meal.key);
    expect((await db.itemStates.get([tripId, after.key]))!.status).toBe('done');
    const foods = await db.foods.where('tripId').equals(tripId).toArray();
    const kept = foods.find((x) => x.source === 'itinerary')!;
    expect(kept).toMatchObject({ name: '三角市场', city: '小樽', meals: ['lunch'], dayIndexes: [2] });
    expect((await db.trips.get(tripId))!.sourceMd).toContain('小樽寿司屋');
    // 再换回原来那家：备选里原计划不重复
    await swapMealTo(meal.id, kept.id);
    expect((await db.items.get(meal.id))!.title).toBe('三角市场');
    expect(await db.foods.where("tripId").equals(tripId).count()).toBe(2);
  });
});

describe('旅行包和删除旅程', () => {
  it('旅行包带上美食和标记；删旅程一起删', async () => {
    const tripId = await seed();
    const a = await addFood(tripId, { name: 'A', kind: 'meal' });
    await setFoodMark(tripId, a, { fav: true });
    const pkg = await exportTripPackage(tripId, { attachments: false });
    await deleteTrip(tripId);
    expect(await db.foods.count()).toBe(0);
    expect(await db.foodMarks.count()).toBe(0);
    await restoreBackupDetailed(pkg);
    expect((await db.foods.get(a))!.name).toBe('A');
    expect((await db.foodMarks.get([tripId, a]))!.fav).toBe(true);
  });
});
