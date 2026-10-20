import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { isLinkDoc } from '../domain/bookings';
import { tripPackageInfo, type PackageInfo } from '../db/repo';
import { DEFAULT_SETTINGS, type Day, type Doc, type Expense, type Garment, type Item, type ItemStatus, type Outfit, type PackItem, type Settings, type Trip } from '../domain/types';

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => (await db.settings.get('app')) ?? DEFAULT_SETTINGS, []);
}

export function useTrips(): Trip[] | undefined {
  return useLiveQuery(() => db.trips.toArray(), []);
}

/** 当前旅程：最近一次看的旅程；没有记录时取第一个 */
export function useCurrentTripId(): string | null | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get('app');
    if (s?.lastTripId && (await db.trips.get(s.lastTripId))) return s.lastTripId;
    const first = await db.trips.toCollection().first();
    return first?.id ?? null;
  }, []);
}

export interface TripData {
  trip: Trip;
  days: Day[];
  items: Item[]; // 按天、按出现顺序
  docs: Doc[];
  states: Map<string, ItemStatus>;
  /** 必逛 / 必吃已勾选的文字 */
  checked: Map<string, string[]>;
  /** 账本明细，按日期、录入时间排序 */
  expenses: Expense[];
  savedBlobs: Set<string>;
  dayById: Map<string, Day>;
}

export function useTripData(tripId: string | null | undefined): TripData | null | undefined {
  return useLiveQuery(async () => {
    if (!tripId) return null;
    const trip = await db.trips.get(tripId);
    if (!trip) return null;
    const [days, items, docs, states, expenses] = await Promise.all([
      db.days.where('tripId').equals(tripId).toArray(),
      db.items.where('tripId').equals(tripId).toArray(),
      db.docs.where('tripId').equals(tripId).toArray(),
      db.itemStates.where('tripId').equals(tripId).toArray(),
      db.expenses.where('tripId').equals(tripId).toArray(),
    ]);
    expenses.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    days.sort((a, b) => a.index - b.index || a.date.localeCompare(b.date));
    const dayOrder = new Map(days.map((d, i) => [d.id, i]));
    items.sort((a, b) => (dayOrder.get(a.dayId) ?? 0) - (dayOrder.get(b.dayId) ?? 0) || a.order - b.order);
    const keys = docs.map((d) => d.blobKey);
    const present = keys.length ? await db.blobs.where('key').anyOf(keys).primaryKeys() : [];
    docs.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    return {
      trip,
      days,
      items,
      docs,
      states: new Map(states.map((s) => [s.itemKey, s.status])),
      checked: new Map(states.filter((s) => s.checked?.length).map((s) => [s.itemKey, s.checked!])),
      expenses,
      savedBlobs: new Set(present as string[]),
      dayById: new Map(days.map((d) => [d.id, d])),
    };
  }, [tripId]);
}

/** 旅程卡片的封面：只用用户自己设的封面；没有就不放照片（卡片里显示占位图标） */
export function useTripCovers(): Map<string, { src: string; alt: string }> | undefined {
  return useLiveQuery(async () => {
    const trips = await db.trips.toArray();
    const out = new Map<string, { src: string; alt: string }>();
    for (const t of trips) {
      if (t.coverBlobKey) {
        const b = await db.blobs.get(t.coverBlobKey);
        if (b) {
          out.set(t.id, { src: URL.createObjectURL(b.blob), alt: `${t.title} 封面` });
          continue;
        }
      }
    }
    return out;
  }, []);
}

export function statusOf(td: TripData, key: string): ItemStatus {
  return td.states.get(key) ?? 'todo';
}

export function useBlobUrl(key: string | undefined): string | undefined {
  const blob = useLiveQuery(async () => (key ? (await db.blobs.get(key))?.blob ?? null : null), [key]);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/** 应用壳是否已被 Service Worker 缓存好 */
export function useAppShellReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let alive = true;
    const check = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (alive) setReady(!!reg?.active);
    };
    void check();
    navigator.serviceWorker.addEventListener('controllerchange', check);
    const t = setInterval(check, 3000);
    return () => {
      alive = false;
      clearInterval(t);
      navigator.serviceWorker.removeEventListener('controllerchange', check);
    };
  }, []);
  return ready;
}

export interface Readiness {
  app: boolean;
  data: boolean;
  filesSaved: number;
  filesTotal: number;
  allGreen: boolean;
}

export function readiness(td: TripData | null | undefined, app: boolean): Readiness {
  // 只有链接的资料没有文件，不算进「附件已保存」
  const files = td ? td.docs.filter((d) => !isLinkDoc(d)) : [];
  const total = files.length;
  const saved = td ? files.filter((d) => td.savedBlobs.has(d.blobKey)).length : 0;
  const data = !!td;
  return { app, data, filesSaved: saved, filesTotal: total, allGreen: app && data && saved === total };
}

/** 2026-10：旅行包里附件的数量和大小（导出前显示） */
export function useTripPackageInfo(tripId: string | undefined): PackageInfo | undefined {
  return useLiveQuery(async () => (tripId ? tripPackageInfo(tripId) : undefined), [tripId]);
}

/** 2026-10：衣橱（所有旅程共用），按添加顺序 */
export function useWardrobe(): Garment[] | undefined {
  return useLiveQuery(async () => (await db.garments.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), []);
}

export interface TripPacking {
  outfits: Outfit[];
  items: PackItem[];
  packed: Set<string>;
}

/** 2026-10：这份旅程的每日穿搭和打包清单 */
export function useTripPacking(tripId: string | null | undefined): TripPacking | undefined {
  return useLiveQuery(async () => {
    if (!tripId) return { outfits: [], items: [], packed: new Set<string>() };
    const [outfits, items, checks] = await Promise.all([
      db.outfits.where('tripId').equals(tripId).toArray(),
      db.packItems.where('tripId').equals(tripId).toArray(),
      db.packChecks.where('tripId').equals(tripId).toArray(),
    ]);
    return { outfits, items, packed: new Set(checks.map((c) => c.ref)) };
  }, [tripId]);
}

/** 2026-10-15：最近打开的那份旅程的主题（公共页面跟随它） */
export function useCurrentTripTheme(): Trip['theme'] | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get('app');
    const t = (s?.lastTripId && (await db.trips.get(s.lastTripId))) || (await db.trips.toCollection().first());
    return t?.theme ?? 'summer';
  }, []);
}
