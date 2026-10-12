import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { db } from './schema';
import { uuid } from './uuid';
import type { ParseResult } from '../importer/parseMd';
import type { DiffOldItem } from '../importer/diff';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TRANSLATE,
  type Day,
  type Doc,
  type DocKind,
  type Item,
  type ItemState,
  type ItemStatus,
  type Settings,
  type Trip,
  type TranslateLang,
} from '../domain/types';

const now = () => new Date().toISOString();

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'app' });
}

export async function setLastTrip(tripId: string): Promise<void> {
  await updateSettings({ lastTripId: tripId });
}

/** 保存导入结果。targetTripId 有值时为重新导入：覆盖 Day 和 Item，按 Item.key 保留状态和证明绑定。 */
export async function saveImport(
  result: ParseResult,
  sourceMd: string,
  targetTripId?: string,
  /** 用户确认的「疑似改名」：旧 key → 新 key，状态和证明绑定随之迁移 */
  renames: Record<string, string> = {},
): Promise<string> {
  const ts = now();
  return db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.itemStates, db.settings], async () => {
    const existing = targetTripId ? await db.trips.get(targetTripId) : undefined;
    const tripId = existing?.id ?? uuid();
    const trip: Trip = {
      id: tripId,
      title: result.trip.title,
      startDate: result.trip.startDate,
      endDate: result.trip.endDate,
      homeTz: result.trip.homeTz,
      destination: result.trip.destination,
      coverBlobKey: existing?.coverBlobKey,
      translate: existing?.translate ?? DEFAULT_TRANSLATE,
      sourceMd,
      importedAt: ts,
      updatedAt: ts,
    };

    if (existing) {
      const oldDays = await db.days.where('tripId').equals(tripId).primaryKeys();
      await db.days.bulkDelete(oldDays);
      const oldItems = await db.items.where('tripId').equals(tripId).primaryKeys();
      await db.items.bulkDelete(oldItems);
    }

    const days: Day[] = [];
    const items: Item[] = [];
    for (const d of result.days) {
      const dayId = uuid();
      days.push({ id: dayId, tripId, index: d.index, date: d.date, tz: d.tz, city: d.city, title: d.title, note: d.note });
      for (const it of d.items) {
        items.push({ ...it, id: uuid(), tripId, dayId });
      }
    }
    await db.trips.put(trip);
    await db.days.bulkPut(days);
    await db.items.bulkPut(items);

    if (existing) {
      const keys = new Set(items.map((i) => i.key));
      for (const [oldKey, newKey] of Object.entries(renames)) {
        if (!keys.has(newKey) || oldKey === newKey) continue;
        const st = await db.itemStates.get([tripId, oldKey]);
        if (st) {
          await db.itemStates.delete([tripId, oldKey]);
          await db.itemStates.put({ ...st, itemKey: newKey, updatedAt: ts });
        }
      }
      // 匹配不上的证明回到「未关联」，不会被删除
      const docs = await db.docs.where('tripId').equals(tripId).toArray();
      for (const doc of docs) {
        const mapped = doc.itemKeys.map((k) => renames[k] ?? k);
        const kept = Array.from(new Set(mapped.filter((k) => keys.has(k))));
        if (kept.length !== doc.itemKeys.length) await db.docs.update(doc.id, { itemKeys: kept, updatedAt: ts });
      }
    }
    await updateSettings({ lastTripId: tripId });
    return tripId;
  });
}

/** 重新导入预览用：读出旧行程每一项，并标记是否带有用户数据 */
export async function loadDiffOld(tripId: string): Promise<DiffOldItem[]> {
  const [days, items, states, docs] = await Promise.all([
    db.days.where('tripId').equals(tripId).toArray(),
    db.items.where('tripId').equals(tripId).toArray(),
    db.itemStates.where('tripId').equals(tripId).toArray(),
    db.docs.where('tripId').equals(tripId).toArray(),
  ]);
  const dateOf = new Map(days.map((d) => [d.id, d.date]));
  const withState = new Set(states.filter((s) => s.status !== 'todo').map((s) => s.itemKey));
  const withDoc = new Set(docs.flatMap((d) => d.itemKeys));
  return items.map((i) => ({
    key: i.key,
    type: i.type,
    title: i.title,
    start: i.start,
    end: i.end,
    navUrl: i.navUrl,
    note: i.note,
    bookingRef: i.bookingRef,
    placeName: i.place?.name,
    date: dateOf.get(i.dayId) ?? '',
    hasUserData: withState.has(i.key) || withDoc.has(i.key),
  }));
}

export async function setItemStatus(tripId: string, itemKey: string, status: ItemStatus): Promise<void> {
  await db.itemStates.put({ tripId, itemKey, status, updatedAt: now() });
}

export async function addDoc(input: {
  tripId: string;
  blob: Blob;
  title: string;
  kind: DocKind;
  itemKeys: string[];
}): Promise<string> {
  const id = uuid();
  const blobKey = `doc:${id}`;
  const ts = now();
  const doc: Doc = {
    id,
    tripId: input.tripId,
    title: input.title,
    kind: input.kind,
    mime: input.blob.type || 'application/octet-stream',
    blobKey,
    itemKeys: input.itemKeys,
    addedAt: ts,
    updatedAt: ts,
  };
  await db.transaction('rw', db.docs, db.blobs, async () => {
    await db.blobs.put({ key: blobKey, blob: input.blob });
    await db.docs.put(doc);
  });
  requestPersist();
  return id;
}

/** 文件缺失时重新上传：沿用原来的 Doc 和绑定，只换文件本体 */
export async function replaceDocBlob(docId: string, blob: Blob): Promise<void> {
  const doc = await db.docs.get(docId);
  if (!doc) return;
  await db.blobs.put({ key: doc.blobKey, blob });
  await db.docs.update(docId, { mime: blob.type || doc.mime, updatedAt: now() });
}

export async function setDocItemKeys(docId: string, itemKeys: string[]): Promise<void> {
  await db.docs.update(docId, { itemKeys, updatedAt: now() });
}

export async function setCover(tripId: string, blob: Blob): Promise<void> {
  const key = `cover:${tripId}`;
  await db.blobs.put({ key, blob });
  await db.trips.update(tripId, { coverBlobKey: key, updatedAt: now() });
}

export async function setTranslateTo(tripId: string, to: TranslateLang): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (!trip) return;
  await db.trips.update(tripId, { translate: { ...(trip.translate ?? DEFAULT_TRANSLATE), to }, updatedAt: now() });
}

export async function deleteTrip(tripId: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.blobs, db.itemStates, db.settings], async () => {
    const trip = await db.trips.get(tripId);
    const docs = await db.docs.where('tripId').equals(tripId).toArray();
    await db.blobs.bulkDelete([...docs.map((d) => d.blobKey), ...(trip?.coverBlobKey ? [trip.coverBlobKey] : [])]);
    await db.docs.bulkDelete(docs.map((d) => d.id));
    await db.days.where('tripId').equals(tripId).delete();
    await db.items.where('tripId').equals(tripId).delete();
    await db.itemStates.where('tripId').equals(tripId).delete();
    await db.trips.delete(tripId);
    const s = await getSettings();
    if (s.lastTripId === tripId) await db.settings.put({ ...s, lastTripId: undefined });
  });
}

export function requestPersist(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* 不支持时忽略 */
  }
}

// ---------- 完整备份：一个 zip，含行程、完成状态和证明文件 ----------

interface BackupJson {
  app: 'travel-rundown';
  version: 1;
  exportedAt: string;
  trips: Trip[];
  days: Day[];
  items: Item[];
  docs: Doc[];
  itemStates: ItemState[];
  settings: Settings[];
  blobs: { key: string; type: string; file: string }[];
}

export async function exportBackup(): Promise<Blob> {
  const [trips, days, items, docs, itemStates, settings, blobs] = await Promise.all([
    db.trips.toArray(),
    db.days.toArray(),
    db.items.toArray(),
    db.docs.toArray(),
    db.itemStates.toArray(),
    db.settings.toArray(),
    db.blobs.toArray(),
  ]);
  const files: Record<string, Uint8Array> = {};
  const blobMeta: BackupJson['blobs'] = [];
  for (let i = 0; i < blobs.length; i++) {
    const name = `files/${i}`;
    files[name] = new Uint8Array(await blobs[i].blob.arrayBuffer());
    blobMeta.push({ key: blobs[i].key, type: blobs[i].blob.type, file: name });
  }
  const json: BackupJson = {
    app: 'travel-rundown',
    version: 1,
    exportedAt: now(),
    trips,
    days,
    items,
    docs,
    itemStates,
    settings,
    blobs: blobMeta,
  };
  files['backup.json'] = strToU8(JSON.stringify(json));
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped], { type: 'application/zip' });
}

export async function restoreBackup(file: Blob): Promise<number> {
  const data = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const raw = data['backup.json'];
  if (!raw) throw new Error('不是有效的备份文件');
  const json = JSON.parse(strFromU8(raw)) as BackupJson;
  if (json.app !== 'travel-rundown') throw new Error('不是有效的备份文件');
  await db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.blobs, db.itemStates, db.settings], async () => {
    await db.trips.bulkPut(json.trips);
    await db.days.bulkPut(json.days);
    await db.items.bulkPut(json.items);
    await db.docs.bulkPut(json.docs);
    await db.itemStates.bulkPut(json.itemStates);
    for (const b of json.blobs) {
      const bytes = data[b.file];
      if (bytes) await db.blobs.put({ key: b.key, blob: new Blob([bytes], { type: b.type }) });
    }
    const cur = await db.settings.get('app');
    const incoming = json.settings.find((s) => s.id === 'app');
    if (!cur && incoming) await db.settings.put(incoming);
  });
  requestPersist();
  return json.trips.length;
}
