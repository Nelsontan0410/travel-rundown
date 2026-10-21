// 2026-10-18 同步第一步：主用户开启同步、发布更新；同伴加入、预览、套用。
// 资料照常存在本机（离线可用）；云端只存主用户发布的版本和共享文件。
// 完成勾选、实际记账、穿搭打包、主题不上云。
import { db } from '../db/schema';
import { uuid } from '../db/uuid';
import { tripToMd } from '../importer/serialize';
import { DEFAULT_TRANSLATE, type Doc, type Item, type Trip } from '../domain/types';
import { isLinkDoc, LINK_MIME } from '../domain/bookings';
import { backend, type PublishSummary } from './backend';
import { buildSnapshot, diffSnapshots, type SnapshotDiff, type TripSnapshot } from './snapshot';
import { localEdits, mergeSnapshot, type Choice, type Conflict } from './merge';

const now = () => new Date().toISOString();

// ———————— 文件指纹 ————————

export async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 本机这些文件的 sha256（按 blobKey）；没有文件的跳过。
 * 审查修复 #3（2026-10-21）：每次都按文件内容重算，不再按「大小 + 类型」沿用旧指纹——
 * 换成同样大小、同样类型的文件时旧指纹会让同伴继续拿到旧文件。文件都不大，重算很快。
 */
async function hashesFor(keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const recs = keys.length ? await db.blobs.bulkGet(keys) : [];
  for (const r of recs) if (r) out.set(r.key, await sha256(r.blob));
  return out;
}

const filePath = (tripId: string, hash: string) => `${tripId}/${hash}`;
const cloudBlobKey = (hash: string) => `cloud:${hash}`;

// ———————— 本机当前的样子 ————————

async function loadLocal(tripId: string) {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error('旅程不存在');
  const [days, items, docs, guide, highlights] = await Promise.all([
    db.days.where('tripId').equals(tripId).toArray(),
    db.items.where('tripId').equals(tripId).toArray(),
    db.docs.where('tripId').equals(tripId).toArray(),
    db.guides.get(tripId),
    db.highlights.where('tripId').equals(tripId).toArray(),
  ]);
  days.sort((a, b) => a.index - b.index);
  return { trip, days, items, docs, guide, highlights };
}

/** 主用户：把本机这份旅程组成快照（共享资料 = 主用户自己的全部证明资料） */
export async function currentSnapshot(tripId: string): Promise<{ snapshot: TripSnapshot; files: Map<string, string> }> {
  const { trip, days, items, docs, guide, highlights } = await loadLocal(tripId);
  const photoKeys = [...highlights.flatMap((h) => (h.photoKey ? [h.photoKey] : [])), ...Object.values(guide?.days ?? {}).flatMap((d) => (d.photoKey ? [d.photoKey] : []))];
  const keys = [...docs.filter((d) => !isLinkDoc(d)).map((d) => d.blobKey), ...(trip.coverBlobKey ? [trip.coverBlobKey] : []), ...photoKeys];
  const files = await hashesFor(keys);
  const photoMime = new Map<string, string>();
  for (const r of photoKeys.length ? await db.blobs.bulkGet(photoKeys) : []) if (r) photoMime.set(r.key, r.blob.type);
  const snapshot = buildSnapshot(trip, days, items, docs, (k) => files.get(k), { guide, highlights, mimeOf: (k) => photoMime.get(k) });
  if (trip.coverBlobKey) {
    const b = await db.blobs.get(trip.coverBlobKey);
    if (b) snapshot.trip.coverMime = b.blob.type;
  }
  return { snapshot, files };
}

// ———————— 主用户 ————————

/** 开启同步：这台手机成为主用户。name：自己在同伴那边显示的名字 */
export async function enableSync(tripId: string, name: string): Promise<number> {
  const be = await backend();
  await be.ensureSession();
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error('旅程不存在');
  await be.createTrip(tripId, trip.title, name.trim());
  await db.trips.update(tripId, { cloud: { role: 'owner', version: 0, ownerName: name.trim() || undefined } });
  return publishUpdate(tripId, '第一版', false);
}

/** 还没发布的改动（和上次发布的版本比） */
export async function pendingChanges(tripId: string): Promise<SnapshotDiff> {
  const base = await db.cloudBases.get(tripId);
  const { snapshot } = await currentSnapshot(tripId);
  return diffSnapshots(base?.snapshot ?? { ...snapshot, days: [], items: [], docs: [] }, snapshot);
}

/** 发布时附在通知里的改动摘要（同伴不用打开就知道改了什么） */
export function summarize(diff: SnapshotDiff): PublishSummary {
  const n = (k: 'added' | 'changed' | 'removed') => diff.items.filter((c) => c.kind === k).length;
  const label = { added: '新增', changed: '修改', removed: '删除' } as const;
  const lines = [
    ...diff.items.map((c) => `${label[c.kind]} · ${c.dayIndex ? `Day ${c.dayIndex} ` : ''}${c.title}`),
    ...diff.docs.map((d) => `${label[d.kind]}资料 · ${d.title}`),
    ...diff.days.map((d) => `Day ${d.index} · ${d.fields.join('、')}`),
    ...diff.guide.map((g) => `旅行亮点 · ${g}`),
  ];
  return {
    added: n('added'),
    changed: n('changed'),
    removed: n('removed'),
    docs: diff.docs.length,
    ...(diff.trip.length ? { trip: diff.trip } : {}),
    lines: lines.slice(0, 6),
  };
}

export async function publishUpdate(tripId: string, note: string, important: boolean): Promise<number> {
  const be = await backend();
  const { snapshot, files } = await currentSnapshot(tripId);
  const base = await db.cloudBases.get(tripId);
  // 第一版不列清单（全部都是「新增」），只给数量
  const summary = base
    ? summarize(diffSnapshots(base.snapshot, snapshot))
    : { added: snapshot.items.length, docs: snapshot.docs.length, lines: [] };
  const trip = (await db.trips.get(tripId))!;
  // 先传文件（同样内容只传一次），再发版本，免得同伴拿到版本却下载不到文件
  for (const [blobKey, hash] of files) {
    const rec = await db.blobs.get(blobKey);
    if (rec) await be.upload(filePath(tripId, hash), rec.blob);
  }
  const version = await be.publish(tripId, note.trim() || '更新行程', important, snapshot, trip.title, summary);
  await db.transaction('rw', db.trips, db.cloudBases, async () => {
    await db.cloudBases.put({ tripId, version, snapshot, savedAt: now() });
    const t = await db.trips.get(tripId);
    await db.trips.update(tripId, { cloud: { ...(t?.cloud ?? { role: 'owner' }), role: 'owner', version, syncedAt: now() } });
  });
  return version;
}

// ———————— 同伴 ————————

export interface UpdatePreview {
  version: number;
  note?: string;
  important: boolean;
  createdAt: string;
  snapshot: TripSnapshot;
  /** 这个版本相对上次套用的版本改了什么 */
  diff: SnapshotDiff;
  conflicts: Conflict[];
  /** 自己在本机改过、这次会保留的项数 */
  keptMine: number;
  /** 本机有、还没提交的修改数 */
  localEdits: number;
}

export async function previewUpdate(tripId: string, version?: number): Promise<UpdatePreview | null> {
  const be = await backend();
  const v = await be.fetchVersion(tripId, version);
  if (!v) return null;
  const base = await db.cloudBases.get(tripId);
  const local = await db.trips.get(tripId) ? await loadLocal(tripId) : { days: [], items: [] };
  const merged = mergeSnapshot(base?.snapshot, local, v.snapshot);
  return {
    version: v.version,
    note: v.note,
    important: v.important,
    createdAt: v.createdAt,
    snapshot: v.snapshot,
    diff: diffSnapshots(base?.snapshot, v.snapshot),
    conflicts: merged.conflicts,
    keptMine: merged.keptMine.length,
    localEdits: localEdits(base?.snapshot, local).length,
  };
}

/** 套用一个版本：三方合并后写进本机；勾选、证明、账本按 key 迁移；共享文件下载到本机 */
export async function applyUpdate(
  tripId: string,
  v: { version: number; snapshot: TripSnapshot },
  choices: Record<string, Choice> = {},
  meta: { ownerName?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<void> {
  const be = await backend();
  const inc = v.snapshot;
  // 1. 先把缺的共享文件下载好（下载失败就整个不套用，保持原样）
  const hashes = [...new Set([...inc.docs.map((d) => d.fileHash), inc.trip.coverHash, ...(inc.guide?.highlights ?? []).map((h) => h.photoHash), ...(inc.guide?.days ?? []).map((d) => d.photoHash)].filter((h): h is string => !!h))];
  const have = new Set((await db.blobs.where('key').anyOf(hashes.map(cloudBlobKey)).primaryKeys()) as string[]);
  const fetched: { key: string; blob: Blob }[] = [];
  const need = hashes.filter((h) => !have.has(cloudBlobKey(h)));
  meta.onProgress?.(0, need.length);
  for (const h of need) {
    const blob = await be.download(filePath(tripId, h));
    const mime = inc.docs.find((d) => d.fileHash === h)?.mime ?? (h === inc.trip.coverHash ? inc.trip.coverMime : undefined) ?? inc.guide?.highlights.find((x) => x.photoHash === h)?.photoMime ?? inc.guide?.days?.find((x) => x.photoHash === h)?.photoMime;
    fetched.push({ key: cloudBlobKey(h), blob: mime && !blob.type ? new Blob([blob], { type: mime }) : blob });
    meta.onProgress?.(fetched.length, need.length);
  }

  await db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.blobs, db.itemStates, db.expenses, db.cloudBases, db.guides, db.highlights], async () => {
    const ts = now();
    const existing = await db.trips.get(tripId);
    const base = await db.cloudBases.get(tripId);
    const local = existing
      ? {
          days: await db.days.where('tripId').equals(tripId).toArray(),
          items: await db.items.where('tripId').equals(tripId).toArray(),
        }
      : { days: [], items: [] };
    const m = mergeSnapshot(base?.snapshot, local, inc, choices);

    // 旅程资料：一律跟主用户（含预算）；主题、出发时刻提醒等个人设置保留
    const t = inc.trip;
    const trip: Trip = {
      ...(existing ?? { id: tripId, translate: t.translate ?? DEFAULT_TRANSLATE, importedAt: ts, sourceMd: '' }),
      id: tripId,
      title: t.title,
      startDate: t.startDate,
      endDate: t.endDate,
      homeTz: t.homeTz,
      destination: t.destination,
      budget: t.budget,
      participants: t.participants,
      departTime: t.departTime,
      translate: t.translate ?? existing?.translate ?? DEFAULT_TRANSLATE,
      coverBlobKey: t.coverHash ? cloudBlobKey(t.coverHash) : existing?.coverBlobKey?.startsWith('cloud:') ? undefined : existing?.coverBlobKey,
      cloud: { role: 'member', version: v.version, ownerName: meta.ownerName ?? existing?.cloud?.ownerName, syncedAt: ts },
      updatedAt: ts,
    } as Trip;
    if (!trip.coverBlobKey) delete trip.coverBlobKey;

    for (const f of fetched) await db.blobs.put(f);

    // 每天、每一项整份换成合并结果
    await db.days.bulkDelete(local.days.map((d) => d.id));
    await db.items.bulkDelete(local.items.map((i) => i.id));
    await db.days.bulkPut(m.days.map((d) => ({ ...d, tripId })));

    // 共享资料：主用户的 key → 合并后的 key（按 id 对应）
    const finalKeyById = new Map(m.items.map((i) => [i.id, i.key]));
    const incKeyMap = new Map<string, string>();
    for (const it of inc.items) {
      const k = finalKeyById.get(it.id);
      if (k) incKeyMap.set(it.key, k);
    }
    const remapLocal = (k: string) => m.keyMap[k] ?? k;
    const alive = new Set(m.items.map((i) => i.key));

    // 完成勾选跟着 key 走
    const states = await db.itemStates.where('tripId').equals(tripId).toArray();
    const moved = states.filter((s) => m.keyMap[s.itemKey]);
    await db.itemStates.bulkDelete(moved.map((s) => [tripId, s.itemKey] as [string, string]));
    await db.itemStates.bulkPut(moved.map((s) => ({ ...s, itemKey: m.keyMap[s.itemKey], updatedAt: ts })));
    for (const e of await db.expenses.where('tripId').equals(tripId).toArray()) {
      if (e.itemKey && m.keyMap[e.itemKey]) await db.expenses.update(e.id, { itemKey: m.keyMap[e.itemKey], updatedAt: ts });
    }

    // 证明资料：自己的保留并迁移 key；主用户的按版本增删改
    const localDocs = await db.docs.where('tripId').equals(tripId).toArray();
    for (const d of localDocs) {
      if (d.fromCloud) continue;
      const keys = d.itemKeys.map(remapLocal).filter((k) => alive.has(k));
      if (keys.join('|') !== d.itemKeys.join('|')) await db.docs.update(d.id, { itemKeys: keys, updatedAt: ts });
    }
    const incIds = new Set(inc.docs.map((d) => d.id));
    for (const d of localDocs) if (d.fromCloud && !incIds.has(d.id)) await db.docs.delete(d.id);
    const docs: Doc[] = inc.docs.map(({ fileHash, ...d }) => ({
      ...d,
      tripId,
      blobKey: fileHash ? cloudBlobKey(fileHash) : `link:${d.id}`,
      mime: fileHash ? d.mime : d.url ? LINK_MIME : d.mime,
      itemKeys: d.itemKeys.map((k) => incKeyMap.get(k)).filter((k): k is string => !!k),
      fromCloud: true,
    }));
    await db.docs.bulkPut(docs);

    // 旅行亮点：同伴这边只读，整份跟主用户（照片是 cloud:<hash>，已在上面下载好）
    {
      const oldHs = await db.highlights.where('tripId').equals(tripId).toArray();
      const oldG = await db.guides.get(tripId);
      await db.blobs.bulkDelete([...oldHs.flatMap((h) => (h.photoKey?.startsWith('hl:') ? [h.photoKey] : [])), ...Object.values(oldG?.days ?? {}).flatMap((d) => (d.photoKey?.startsWith('gday:') ? [d.photoKey] : []))]);
      await db.highlights.bulkDelete(oldHs.map((h) => h.id));
      await db.guides.delete(tripId);
      const g = inc.guide;
      if (g) {
        const days = Object.fromEntries(
          (g.days ?? []).map((d) => [d.dayId, { title: d.title, hidden: d.hidden, focus: d.focus, photoKey: d.photoHash ? cloudBlobKey(d.photoHash) : undefined }]),
        );
        await db.guides.put({ tripId, intro: g.intro, coverFocus: g.coverFocus, tips: g.tips, ...(g.days?.length ? { days } : {}), updatedAt: ts });
        await db.highlights.bulkPut(
          g.highlights.map((h, i) => {
            const { photoHash, photoMime: _m, ...rest } = h;
            void _m;
            return { ...rest, tripId, order: i, photoKey: photoHash ? cloudBlobKey(photoHash) : undefined, updatedAt: ts };
          }),
        );
      }
    }

    // 原文写回（含自己保留的修改），每项的原文行号跟着更新
    const { md, src } = tripToMd(trip, m.days, m.items);
    trip.sourceMd = md;
    await db.items.bulkPut(m.items.map((it: Item) => ({ ...it, tripId, src: src.get(it.id) ?? it.src })));
    await db.trips.put(trip);
    await db.cloudBases.put({ tripId, version: v.version, snapshot: inc, savedAt: ts });
  });
}

/** 用邀请码加入：加入后下载最新版本建成本机旅程。返回旅程 id */
export async function joinWithCode(code: string, name: string, onProgress?: (done: number, total: number) => void): Promise<string> {
  const be = await backend();
  await be.ensureSession();
  const peek = await be.peekInvite(code);
  const tripId = await be.joinWithCode(code, name.trim());
  const v = await be.fetchVersion(tripId);
  if (!v) throw new Error('主用户还没有发布任何版本');
  await applyUpdate(tripId, v, {}, { ownerName: peek?.inviterName, onProgress });
  return tripId;
}

/** 邀请码统一成大写、去掉空格和横线 */
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[\s-]/g, '');
/** 显示用：ABCDE-FGHJK */
export const prettyCode = (c: string) => (c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);

/** 同伴：哪些旅程有新版本 */
export async function checkUpdates(): Promise<Record<string, { version: number; note?: string; important: boolean }>> {
  const be = await backend();
  if (!(await be.getSession())) return {};
  const trips = (await db.trips.toArray()).filter((t) => t.cloud?.role === 'member');
  if (!trips.length) return {};
  const info = await be.latest(trips.map((t) => t.id));
  const out: Record<string, { version: number; note?: string; important: boolean }> = {};
  for (const i of info) {
    const t = trips.find((x) => x.id === i.id);
    if (t && i.version > (t.cloud?.version ?? 0)) out[i.id] = { version: i.version, note: i.note, important: i.important };
  }
  return out;
}

/** 同伴退出 / 被移除后：本机这份旅程变回普通旅程（资料保留） */
export async function detachLocal(tripId: string): Promise<void> {
  await db.transaction('rw', db.trips, db.cloudBases, db.docs, async () => {
    const t = await db.trips.get(tripId);
    if (!t) return;
    const { cloud: _c, ...rest } = t;
    void _c;
    await db.trips.put({ ...rest, updatedAt: now() });
    await db.cloudBases.delete(tripId);
    for (const d of await db.docs.where('tripId').equals(tripId).toArray()) {
      if (d.fromCloud) await db.docs.update(d.id, { fromCloud: undefined });
    }
  });
}

export const newTripId = () => uuid();
