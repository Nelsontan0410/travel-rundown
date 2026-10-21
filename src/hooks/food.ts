// 2026-10-21 美食专区：读取一份旅程的美食和个人标记
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { FoodMark, FoodSpot } from '../domain/food';

export interface FoodData {
  foods: FoodSpot[];
  marks: Map<string, FoodMark>;
}

export function useFoods(tripId: string | null | undefined): FoodData | undefined {
  return useLiveQuery(async () => {
    if (!tripId) return { foods: [], marks: new Map() };
    const [foods, marks] = await Promise.all([db.foods.where('tripId').equals(tripId).toArray(), db.foodMarks.where('tripId').equals(tripId).toArray()]);
    foods.sort((a, b) => a.order - b.order);
    return { foods, marks: new Map(marks.map((m) => [m.foodId, m])) };
  }, [tripId]);
}
