import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { db } from './schema';
import { uuid } from './uuid';
import type { TripTheme } from '../domain/types';
import type { ParseResult } from '../importer/parseMd';
import type { DiffOldItem } from '../importer/diff';
import { encryptBlob, decryptBlob } from '../lib/crypto';
import { addDays, daysBetween } from '../domain/format';
import { makeItemKey } from '../domain/itemKey';
import { migrateItemV2 } from '../domain/migrate';
import { isLinkDoc, LINK_MIME } from '../domain/bookings';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TRANSLATE,
  type BlobRecord,
  type Day,
  type Doc,
  type DocKind,
  type Expense,
  type ExpenseCategory,
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
  return db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.itemStates, db.settings, db.expenses], async () => {
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
      budget: result.trip.budget ?? existing?.budget,
      translate: existing?.translate ?? DEFAULT_TRANSLATE,
      // 修订 2026-10：人数以导入为准，没写就保留；主题和出发时刻是用户设置，重新导入不覆盖
      participants: result.trip.participants ?? existing?.participants,
      theme: existing?.theme,
      departTime: existing?.departTime,
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
      // 账本明细跟着改名；匹配不上的只解除关联，金额保留
      const exps = await db.expenses.where('tripId').equals(tripId).toArray();
      for (const e of exps) {
        if (!e.itemKey) continue;
        const k = renames[e.itemKey] ?? e.itemKey;
        if (k !== e.itemKey || !keys.has(k)) await db.expenses.update(e.id, { itemKey: keys.has(k) ? k : undefined, updatedAt: ts });
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
  const cur = await db.itemStates.get([tripId, itemKey]);
  await db.itemStates.put({ ...cur, tripId, itemKey, status, updatedAt: now() });
}

/** 必逛 / 必吃清单的勾选（存文字） */
export async function setItemChecked(tripId: string, itemKey: string, checked: string[]): Promise<void> {
  const cur = await db.itemStates.get([tripId, itemKey]);
  await db.itemStates.put({ status: 'todo', ...cur, tripId, itemKey, checked, updatedAt: now() });
}

export async function addDoc(input: {
  tripId: string;
  blob: Blob;
  title: string;
  kind: DocKind;
  itemKeys: string[];
  /** 有值时用这个密码加密后再保存 */
  password?: string;
  hint?: string;
  /** 2026-10：这是自己保存的二维码 / 票码图片 */
  codeKind?: 'static';
}): Promise<string> {
  const id = uuid();
  const blobKey = `doc:${id}`;
  const ts = now();
  const sealed = input.password ? await encryptBlob(input.blob, input.password, input.hint) : null;
  const doc: Doc = {
    id,
    tripId: input.tripId,
    title: input.title,
    kind: input.kind,
    mime: input.blob.type || 'application/octet-stream',
    blobKey,
    itemKeys: input.itemKeys,
    ...(sealed ? { lock: sealed.lock } : {}),
    ...(input.codeKind ? { codeKind: input.codeKind } : {}),
    addedAt: ts,
    updatedAt: ts,
  };
  await db.transaction('rw', db.docs, db.blobs, async () => {
    await db.blobs.put({ key: blobKey, blob: sealed ? sealed.blob : input.blob });
    await db.docs.put(doc);
  });
  requestPersist();
  return id;
}

/** 2026-10：只保存链接的资料（订单网页、动态票码）。本机没有文件，离线检查会标出来 */
export async function addLinkDoc(input: {
  tripId: string;
  title: string;
  kind: DocKind;
  url: string;
  itemKeys: string[];
  dynamic: boolean;
  app?: string;
}): Promise<string> {
  const id = uuid();
  const ts = now();
  const doc: Doc = {
    id,
    tripId: input.tripId,
    title: input.title,
    kind: input.kind,
    mime: LINK_MIME,
    blobKey: `link:${id}`,
    itemKeys: input.itemKeys,
    url: input.url.trim(),
    ...(input.dynamic ? { codeKind: 'dynamic' as const } : {}),
    ...(input.app?.trim() ? { app: input.app.trim() } : {}),
    addedAt: ts,
    updatedAt: ts,
  };
  await db.docs.put(doc);
  return id;
}

/** 2026-10：标记 / 取消「这是二维码 / 票码图片」 */
export async function setDocCodeKind(docId: string, codeKind: 'static' | undefined): Promise<void> {
  const doc = await db.docs.get(docId);
  if (!doc || isLinkDoc(doc)) return;
  const { codeKind: _old, ...rest } = doc;
  void _old;
  await db.docs.put({ ...rest, ...(codeKind ? { codeKind } : {}), updatedAt: now() });
}

/** 2026-10：删除一份资料（链接或文件） */
export async function deleteDoc(docId: string): Promise<void> {
  await db.transaction('rw', db.docs, db.blobs, async () => {
    const doc = await db.docs.get(docId);
    if (!doc) return;
    await db.blobs.delete(doc.blobKey);
    await db.docs.delete(docId);
  });
}

/** 文件缺失时重新上传：沿用原来的 Doc 和绑定，只换文件本体。传密码则重新加密 */
export async function replaceDocBlob(docId: string, blob: Blob, password?: string): Promise<void> {
  const doc = await db.docs.get(docId);
  if (!doc) return;
  const sealed = password ? await encryptBlob(blob, password, doc.lock?.hint) : null;
  await db.blobs.put({ key: doc.blobKey, blob: sealed ? sealed.blob : blob });
  await db.docs.update(docId, { mime: blob.type || doc.mime, lock: sealed?.lock, updatedAt: now() });
}

/** 给已有证明加密码 */
export async function lockDoc(docId: string, password: string, hint?: string): Promise<void> {
  const doc = await db.docs.get(docId);
  const rec = doc && (await db.blobs.get(doc.blobKey));
  if (!doc || !rec || doc.lock) return;
  const sealed = await encryptBlob(rec.blob, password, hint);
  await db.transaction('rw', db.docs, db.blobs, async () => {
    await db.blobs.put({ key: doc.blobKey, blob: sealed.blob });
    await db.docs.update(docId, { lock: sealed.lock, updatedAt: now() });
  });
}

/** 解开证明（密码错会抛 WrongPasswordError），不改数据库 */
export async function openLockedDoc(docId: string, password: string): Promise<Blob> {
  const doc = await db.docs.get(docId);
  const rec = doc && (await db.blobs.get(doc.blobKey));
  if (!doc || !rec) throw new Error('文件不存在');
  if (!doc.lock) return rec.blob;
  return decryptBlob(rec.blob, doc.lock, password, doc.mime);
}

/** 移除密码：验证密码后存回明文 */
export async function unlockDoc(docId: string, password: string): Promise<void> {
  const plain = await openLockedDoc(docId, password);
  const doc = (await db.docs.get(docId))!;
  await db.transaction('rw', db.docs, db.blobs, async () => {
    await db.blobs.put({ key: doc.blobKey, blob: plain });
    await db.docs.update(docId, { lock: undefined, updatedAt: now() });
  });
}

// ---------- 账本（目前只支持 MYR，金额单位「分」） ----------

export async function setBudget(tripId: string, sen: number | undefined): Promise<void> {
  await db.trips.update(tripId, { budget: sen, updatedAt: now() });
}

export async function addExpense(input: {
  tripId: string;
  date: string;
  amount: number;
  title: string;
  category: ExpenseCategory;
  itemKey?: string;
  note?: string;
}): Promise<string> {
  const ts = now();
  const id = uuid();
  await db.expenses.put({ ...input, id, createdAt: ts, updatedAt: ts });
  return id;
}

export async function updateExpense(id: string, patch: Partial<Omit<Expense, 'id' | 'tripId' | 'createdAt'>>): Promise<void> {
  await db.expenses.update(id, { ...patch, updatedAt: now() });
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id);
}

/**
 * 修改出发日期：整份行程平移。Day 日期、住宿入住/退房日期跟着移动；
 * Item.key 含日期，所以完成状态、证明绑定、账本关联一起迁移到新 key。账本日期不动。
 */
export async function shiftTripStart(tripId: string, newStart: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.itemStates, db.expenses], async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) return;
    const delta = daysBetween(trip.startDate, newStart);
    if (!delta) return;
    const ts = now();
    const days = (await db.days.where('tripId').equals(tripId).toArray()).sort((a, b) => a.index - b.index);
    const items = await db.items.where('tripId').equals(tripId).toArray();
    const dayOrder = new Map(days.map((d, i) => [d.id, i]));
    items.sort((a, b) => (dayOrder.get(a.dayId) ?? 0) - (dayOrder.get(b.dayId) ?? 0) || a.order - b.order);
    const newDate = new Map(days.map((d) => [d.id, addDays(d.date, delta)]));
    const used = new Set<string>();
    const map: Record<string, string> = {};
    const nextItems: Item[] = items.map((it) => {
      const key = makeItemKey(newDate.get(it.dayId)!, it.type, it.title, used);
      map[it.key] = key;
      const lodging = it.lodging && {
        ...it.lodging,
        checkIn: it.lodging.checkIn && addDays(it.lodging.checkIn, delta),
        checkOut: it.lodging.checkOut && addDays(it.lodging.checkOut, delta),
      };
      return { ...it, key, ...(lodging ? { lodging } : {}) };
    });
    await db.days.bulkPut(days.map((d) => ({ ...d, date: newDate.get(d.id)! })));
    await db.items.bulkPut(nextItems);
    const states = await db.itemStates.where('tripId').equals(tripId).toArray();
    await db.itemStates.bulkDelete(states.map((s) => [tripId, s.itemKey] as [string, string]));
    await db.itemStates.bulkPut(states.filter((s) => map[s.itemKey]).map((s) => ({ ...s, itemKey: map[s.itemKey], updatedAt: ts })));
    for (const d of await db.docs.where('tripId').equals(tripId).toArray()) {
      await db.docs.update(d.id, { itemKeys: d.itemKeys.map((k) => map[k]).filter(Boolean), updatedAt: ts });
    }
    for (const e of await db.expenses.where('tripId').equals(tripId).toArray()) {
      if (e.itemKey) await db.expenses.update(e.id, { itemKey: map[e.itemKey], updatedAt: ts });
    }
    await db.trips.update(tripId, { startDate: addDays(trip.startDate, delta), endDate: addDays(trip.endDate, delta), updatedAt: ts });
  });
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

/** 修订 2026-10：人数（正整数；undefined = 未设置） */
export async function setParticipants(tripId: string, n: number | undefined): Promise<void> {
  await db.trips.update(tripId, { participants: n && Number.isInteger(n) && n > 0 ? n : undefined, updatedAt: now() });
}

/** 修订 2026-10：出发时刻 HH:mm（出发地时区）；undefined = 按 00:00 */
export async function setDepartTime(tripId: string, time: string | undefined): Promise<void> {
  await db.trips.update(tripId, { departTime: time && /^\d{2}:\d{2}$/.test(time) ? time : undefined, updatedAt: now() });
}

/** 修订 2026-10：这份旅程的外观主题 */
export async function setTripTheme(tripId: string, theme: TripTheme): Promise<void> {
  await db.trips.update(tripId, { theme, updatedAt: now() });
}

export async function deleteTrip(tripId: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.blobs, db.itemStates, db.settings, db.expenses], async () => {
    const trip = await db.trips.get(tripId);
    await db.expenses.where('tripId').equals(tripId).delete();
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

// ---------- 备份：一个 zip，含行程、完成状态、账本，可选附件（证明文件、封面） ----------

interface BackupJson {
  app: 'travel-rundown';
  version: 1 | 2;
  exportedAt: string;
  /** 2026-10：all = 本机全部旅程；trip = 单个旅行包。旧备份没有这个字段，按 all 处理 */
  scope?: 'all' | 'trip';
  /** 2026-10：是否包含附件文件；false 时 blobs 为空，docs 只有资料没有文件 */
  attachments?: boolean;
  /** 2026-10：没打包进来的附件数量（attachments=false 时） */
  omittedFiles?: number;
  expenses?: Expense[];
  trips: Trip[];
  days: Day[];
  items: Item[];
  docs: Doc[];
  itemStates: ItemState[];
  settings: Settings[];
  blobs: { key: string; type: string; file: string }[];
}

type BackupData = Omit<BackupJson, 'app' | 'version' | 'exportedAt' | 'blobs'>;

async function zipBackup(data: BackupData, blobs: BlobRecord[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const blobMeta: BackupJson['blobs'] = [];
  for (let i = 0; i < blobs.length; i++) {
    const name = `files/${i}`;
    files[name] = new Uint8Array(await blobs[i].blob.arrayBuffer());
    blobMeta.push({ key: blobs[i].key, type: blobs[i].blob.type, file: name });
  }
  const json: BackupJson = { app: 'travel-rundown', version: 2, exportedAt: now(), ...data, blobs: blobMeta };
  files['backup.json'] = strToU8(JSON.stringify(json));
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped], { type: 'application/zip' });
}

/** 本机全部旅程，含全部附件 */
export async function exportBackup(): Promise<Blob> {
  const [trips, days, items, docs, itemStates, settings, blobs, expenses] = await Promise.all([
    db.trips.toArray(),
    db.days.toArray(),
    db.items.toArray(),
    db.docs.toArray(),
    db.itemStates.toArray(),
    db.settings.toArray(),
    db.blobs.toArray(),
    db.expenses.toArray(),
  ]);
  return zipBackup({ scope: 'all', attachments: true, trips, days, items, docs, itemStates, settings, expenses }, blobs);
}

/** 一份旅程的附件：证明文件 + 封面。返回 blob 键（本机已保存的才算） */
async function tripBlobKeys(tripId: string): Promise<{ keys: string[]; missing: number }> {
  const trip = await db.trips.get(tripId);
  const docs = await db.docs.where('tripId').equals(tripId).toArray();
  const wanted = [...docs.filter((d) => !isLinkDoc(d)).map((d) => d.blobKey), ...(trip?.coverBlobKey ? [trip.coverBlobKey] : [])];
  const present = wanted.length ? ((await db.blobs.where('key').anyOf(wanted).primaryKeys()) as string[]) : [];
  return { keys: present, missing: wanted.length - present.length };
}

export interface PackageInfo {
  /** 附件文件数（本机已保存的） */
  files: number;
  bytes: number;
}

/** 旅行包里附件的数量和大小，用来在导出前告诉用户 */
export async function tripPackageInfo(tripId: string): Promise<PackageInfo> {
  const { keys } = await tripBlobKeys(tripId);
  const blobs = keys.length ? await db.blobs.bulkGet(keys) : [];
  return { files: keys.length, bytes: blobs.reduce((n, b) => n + (b?.blob.size ?? 0), 0) };
}

/** 单个旅行包：这份旅程的行程、完成状态、证明资料、账本；attachments=true 时连附件文件一起 */
export async function exportTripPackage(tripId: string, opts: { attachments: boolean }): Promise<Blob> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error('旅程不存在');
  const [days, items, docs, itemStates, expenses] = await Promise.all([
    db.days.where('tripId').equals(tripId).toArray(),
    db.items.where('tripId').equals(tripId).toArray(),
    db.docs.where('tripId').equals(tripId).toArray(),
    db.itemStates.where('tripId').equals(tripId).toArray(),
    db.expenses.where('tripId').equals(tripId).toArray(),
  ]);
  const { keys } = await tripBlobKeys(tripId);
  const blobs = opts.attachments && keys.length ? ((await db.blobs.bulkGet(keys)).filter(Boolean) as BlobRecord[]) : [];
  return zipBackup(
    {
      scope: 'trip',
      attachments: opts.attachments,
      omittedFiles: opts.attachments ? 0 : keys.length,
      trips: [trip],
      days,
      items,
      docs,
      itemStates,
      settings: [],
      expenses,
    },
    blobs,
  );
}

export interface RestoreResult {
  trips: number;
  scope: 'all' | 'trip';
  attachments: boolean;
  /** 恢复后本机仍缺文件的证明资料数（不含附件的旅行包恢复到新设备时会有） */
  missingFiles: number;
}

export async function restoreBackupDetailed(file: Blob): Promise<RestoreResult> {
  const data = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const raw = data['backup.json'];
  if (!raw) throw new Error('不是有效的备份文件');
  const json = JSON.parse(strFromU8(raw)) as BackupJson;
  if (json.app !== 'travel-rundown') throw new Error('不是有效的备份文件');
  await db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.blobs, db.itemStates, db.settings, db.expenses], async () => {
    await db.trips.bulkPut(json.trips);
    if (json.expenses?.length) await db.expenses.bulkPut(json.expenses);
    await db.days.bulkPut(json.days);
    await db.items.bulkPut(json.version === 1 ? json.items.map(migrateItemV2) : json.items);
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
  const keys = json.docs.filter((d) => !isLinkDoc(d)).map((d) => d.blobKey);
  const present = keys.length ? ((await db.blobs.where('key').anyOf(keys).primaryKeys()) as string[]) : [];
  return {
    trips: json.trips.length,
    scope: json.scope ?? 'all',
    attachments: json.attachments ?? true,
    missingFiles: keys.length - new Set(present).size,
  };
}

/** 旧接口：只返回恢复的旅程数 */
export async function restoreBackup(file: Blob): Promise<number> {
  return (await restoreBackupDetailed(file)).trips;
}
