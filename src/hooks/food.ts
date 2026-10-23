// 2026-10-23 美食册：实时读取（资料库保存后 Gallery 自动更新，不用重开 App）。
// 同日改成每个旅程一本：读「当前旅程」（最近打开的那份）的美食。
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { sortFoods, type FoodEntry } from '../domain/food';

/** 当前旅程（和 useCurrentTripId 同一规则）：最近打开的，没有就第一份 */
async function currentTripId(): Promise<string | null> {
  const s = await db.settings.get('app');
  if (s?.lastTripId && (await db.trips.get(s.lastTripId))) return s.lastTripId;
  return (await db.trips.toCollection().first())?.id ?? null;
}

/** 美食册属于哪份旅程：{ id, title }；还没有任何旅程时为 null */
export function useFoodTrip(): { id: string; title: string } | null | undefined {
  return useLiveQuery(async () => {
    const id = await currentTripId();
    const t = id ? await db.trips.get(id) : undefined;
    return t ? { id: t.id, title: t.title } : null;
  }, []);
}

/** 当前旅程的美食；传 tripId 就读那一份 */
export function useFoodEntries(tripId?: string | null): FoodEntry[] | undefined {
  return useLiveQuery(async () => {
    const id = tripId === undefined ? await currentTripId() : tripId;
    return id ? sortFoods(await db.foodEntries.where('tripId').equals(id).toArray()) : [];
  }, [tripId]);
}

export function useFoodEntry(id: string | undefined): FoodEntry | null | undefined {
  return useLiveQuery(async () => (id ? (await db.foodEntries.get(id)) ?? null : null), [id]);
}
