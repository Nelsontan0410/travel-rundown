// 2026-10-23 全站美食册：实时读取（资料库保存后 Gallery 自动更新，不用重开 App）
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { sortFoods, type FoodEntry } from '../domain/food';

export function useFoodEntries(): FoodEntry[] | undefined {
  return useLiveQuery(async () => sortFoods(await db.foodEntries.toArray()), []);
}

export function useFoodEntry(id: string | undefined): FoodEntry | null | undefined {
  return useLiveQuery(async () => (id ? (await db.foodEntries.get(id)) ?? null : null), [id]);
}
