// 2026-10-18 同步第一步：主用户开启同步、发布更新；同伴加入、预览、套用。
// 资料照常存在本机（离线可用）；云端只存主用户发布的版本和共享文件。
// 完成勾选、实际记账、穿搭打包、主题不上云。
import { db } from '../db/schema';
import { uuid } from '../db/uuid';
import { tripToMd } from '../importer/serialize';
import { DEFAULT_TRANSLATE, type Doc, type Item, type Trip } from '../domain/types';
import type { FoodEntry } from '../domain/food';
import type { Highlight } from '../domain/guide';
import { thumbKeyOf } from '../lib/photo';
import { keepMine, merge3, sharedEntities, TRIP_SHARED_FIELDS, type PortableDoc } from './shared';
import { isLinkDoc, LINK_MIME } from '../domain/bookings';
import { backend, type PublishSummary } from './backend';
import { buildSnapshot, diffSnapshots, stable, type SnapshotDiff, type TripSnapshot } from './snapshot';
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
async function hashesFor(keys: string[], mode: HashMode = 'real'): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (mode === 'fast') {
    // 只用来比较「有没有改」：同步来的文件键就是内容哈希；自己的文件用键代替（换了文件就换了键或内容字段）
    const present = keys.length ? ((await db.blobs.where('key').anyOf(keys).primaryKeys()) as string[]) : [];
    for (const k of present) out.set(k, k.startsWith('cloud:') && !k.includes('#') ? k.slice(6) : `local:${k}`);
    return out;
  }
  const recs = keys.length ? await db.blobs.bulkGet(keys) : [];
  for (const r of recs) if (r) out.set(r.key, await sha256(r.blob));
  return out;
}

/** real = 真正的内容哈希（发布、提交建议要上传文件时）；fast = 只比较有没有改，不读文件内容 */
export type HashMode = 'real' | 'fast';

export const filePath = (tripId: string, hash: string) => `${tripId}/${hash}`;
/** 同伴建议附带的文件：<旅程>/s/<作者>/<哈希>，只有作者和主用户能读 */
export const suggestFilePath = (tripId: string, userId: string, hash: string) => `${tripId}/s/${userId}/${hash}`;
export const cloudBlobKey = (hash: string) => `cloud:${hash}`;

// ———————— 本机当前的样子 ————————

async function loadLocal(tripId: string) {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error('旅程不存在');
  const [days, items, docs, guide, highlights, food] = await Promise.all([
    db.days.where('tripId').equals(tripId).toArray(),
    db.items.where('tripId').equals(tripId).toArray(),
    db.docs.where('tripId').equals(tripId).toArray(),
    db.guides.get(tripId),
    db.highlights.where('tripId').equals(tripId).toArray(),
    db.foodEntries.where('tripId').equals(tripId).toArray(),
  ]);
  days.sort((a, b) => a.index - b.index);
  return { trip, days, items, docs, guide, highlights, food };
}

/**
 * 把本机这份旅程组成快照（主用户发布用；同伴用来算「自己改了什么」）。
 * 2026-10-23：美食册也在里面。files = 本机文件键 → 内容哈希（mode = fast 时是代替用的标记，不能拿来上传）
 */
export async function currentSnapshot(tripId: string, mode: HashMode = 'real'): Promise<{ snapshot: TripSnapshot; files: Map<string, string> }> {
  const { trip, days, items, docs, guide, highlights, food } = await loadLocal(tripId);
  const foodKeys = food.flatMap((f) => (f.photoKey ? [f.photoKey, thumbKeyOf(f.photoKey)] : []));
  const photoKeys = [...highlights.flatMap((h) => (h.photoKey ? [h.photoKey] : [])), ...Object.values(guide?.days ?? {}).flatMap((d) => (d.photoKey ? [d.photoKey] : [])), ...foodKeys];
  const keys = [...docs.filter((d) => !isLinkDoc(d)).map((d) => d.blobKey), ...(trip.coverBlobKey ? [trip.coverBlobKey] : []), ...photoKeys];
  const files = await hashesFor(keys, mode);
  const photoMime = new Map<string, string>();
  for (const r of photoKeys.length ? await db.blobs.bulkGet(photoKeys) : []) if (r) photoMime.set(r.key, r.blob.type);
  const snapshot = buildSnapshot(trip, days, items, docs, (k) => files.get(k), { guide, highlights, mimeOf: (k) => photoMime.get(k) }, food);
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
    ...diff.food,
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

/**
 * 套用一个版本：三方合并后写进本机；勾选、证明、账本按 key 迁移；共享文件下载到本机。
 * 2026-10-23 共同制作：证明资料、旅行亮点、美食册、旅程资料也按「只有自己改了才保留自己的」合并，
 * 同伴还没提交（或主用户还没处理）的修改不会被新版本冲掉。
 */
export async function applyUpdate(
  tripId: string,
  v: { version: number; snapshot: TripSnapshot },
  choices: Record<string, Choice> = {},
  meta: { ownerName?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<void> {
  const be = await backend();
  const inc = v.snapshot;
  // 0. 本机现在的样子（快照形态，只比较不上传）。没有基准版本（第一次加入）就没有要保留的
  const hadBase = !!(await db.cloudBases.get(tripId)) && !!(await db.trips.get(tripId));
  const localSnap = hadBase ? (await currentSnapshot(tripId, 'fast')).snapshot : undefined;

  // 1. 先把缺的共享文件下载好（下载失败就整个不套用，保持原样）
  const wanted = new Map<string, { hash: string; mime?: string }>();
  const want = (key: string, hash: string | undefined, mime?: string) => {
    if (hash && !wanted.has(key)) wanted.set(key, { hash, mime });
  };
  for (const d of inc.docs) if (d.fileHash) want(cloudBlobKey(d.fileHash), d.fileHash, d.mime);
  if (inc.trip.coverHash) want(cloudBlobKey(inc.trip.coverHash), inc.trip.coverHash, inc.trip.coverMime);
  for (const h of inc.guide?.highlights ?? []) if (h.photoHash) want(cloudBlobKey(h.photoHash), h.photoHash, h.photoMime);
  for (const d of inc.guide?.days ?? []) if (d.photoHash) want(cloudBlobKey(d.photoHash), d.photoHash, d.photoMime);
  for (const f of inc.food ?? []) {
    if (!f.photoHash) continue;
    want(cloudBlobKey(f.photoHash), f.photoHash, f.photoMime);
    // 缩略图放在「照片键#thumb」，美食页面按这个规则找
    if (f.thumbHash) want(thumbKeyOf(cloudBlobKey(f.photoHash)), f.thumbHash, 'image/jpeg');
  }
  const keys = [...wanted.keys()];
  const have = new Set((keys.length ? await db.blobs.where('key').anyOf(keys).primaryKeys() : []) as string[]);
  const fetched: { key: string; blob: Blob }[] = [];
  const need = keys.filter((k) => !have.has(k));
  meta.onProgress?.(0, need.length);
  for (const k of need) {
    const { hash, mime } = wanted.get(k)!;
    const blob = await be.download(filePath(tripId, hash));
    fetched.push({ key: k, blob: mime && !blob.type ? new Blob([blob], { type: mime }) : blob });
    meta.onProgress?.(fetched.length, need.length);
  }

  await db.transaction('rw', [db.trips, db.days, db.items, db.docs, db.blobs, db.itemStates, db.expenses, db.cloudBases, db.guides, db.highlights, db.foodEntries], async () => {
    const ts = now();
    const existing = await db.trips.get(tripId);
    const base = await db.cloudBases.get(tripId);
    const bs = base?.snapshot;
    const local = existing
      ? {
          days: await db.days.where('tripId').equals(tripId).toArray(),
          items: await db.items.where('tripId').equals(tripId).toArray(),
        }
      : { days: [], items: [] };
    const m = mergeSnapshot(bs, local, inc, choices);
    /** 自己的文件（不是同步来的）不再用时删掉；同步来的按内容存，可能别处也在用，留着 */
    const dropOwn = (k?: string) => (k && !k.startsWith('cloud:') && !k.startsWith('link:') ? db.blobs.bulkDelete([k, thumbKeyOf(k)]) : undefined);

    // 旅程资料：日期、时区跟主用户；其他字段只有自己改了、主用户没改才保留自己的
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
    if (bs && localSnap && existing) {
      for (const k of TRIP_SHARED_FIELDS) {
        if (k === 'startDate') continue;
        const pick = <T,>(o: T) => (o as Record<string, unknown>)[k];
        if (!keepMine(pick(bs.trip), pick(localSnap.trip), pick(t), (x) => stable(x))) continue;
        if (k === 'coverHash') trip.coverBlobKey = existing.coverBlobKey;
        else (trip as unknown as Record<string, unknown>)[k] = (existing as unknown as Record<string, unknown>)[k];
      }
    }
    if (!trip.coverBlobKey) delete trip.coverBlobKey;

    for (const f of fetched) await db.blobs.put(f);

    // 每天、每一项整份换成合并结果
    await db.days.bulkDelete(local.days.map((d) => d.id));
    await db.items.bulkDelete(local.items.map((i) => i.id));
    await db.days.bulkPut(m.days.map((d) => ({ ...d, tripId })));

    // 共享资料：主用户的 key → 合并后的 key（按 id 对应）
    const finalKeyById = new Map(m.items.map((i) => [i.id, i.key]));
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

    // 证明资料：按 id 三方合并。没有基准版本时：自己的保留，同步来的整份跟主用户
    const localDocs = await db.docs.where('tripId').equals(tripId).toArray();
    const docPick = localSnap
      ? merge3(sharedEntities(bs, ['doc']), sharedEntities(localSnap, ['doc']), sharedEntities(inc, ['doc']), (e) => e.id, (e) => e.core)
      : [
          ...inc.docs.map((d) => ({ id: d.id, from: 'incoming' as const })),
          ...localDocs.filter((d) => !d.fromCloud && !inc.docs.some((x) => x.id === d.id)).map((d) => ({ id: d.id, from: 'local' as const })),
        ];
    const docFrom = new Map(docPick.map((r) => [r.id, r.from]));
    for (const d of localDocs) {
      const from = docFrom.get(d.id);
      if (from === 'local') {
        const keys = d.itemKeys.map(remapLocal).filter((k) => alive.has(k));
        if (keys.join('|') !== d.itemKeys.join('|')) await db.docs.update(d.id, { itemKeys: keys, updatedAt: ts });
      } else if (from !== 'incoming') {
        await db.docs.delete(d.id);
        await dropOwn(d.blobKey);
      } else if (!d.fromCloud) await dropOwn(d.blobKey);
    }
    const incDocIds = new Map(sharedEntities(inc, ['doc']).map((e) => [e.id, (e.data as PortableDoc).itemIds]));
    const docs: Doc[] = inc.docs
      .filter((d) => docFrom.get(d.id) === 'incoming')
      .map((sd) => {
        const { fileHash, ...d } = sd;
        const ids = incDocIds.get(d.id) ?? [];
        return {
          ...d,
          tripId,
          blobKey: fileHash ? cloudBlobKey(fileHash) : `link:${d.id}`,
          mime: fileHash ? d.mime : d.url ? LINK_MIME : d.mime,
          itemKeys: ids.map((id) => finalKeyById.get(id)).filter((k): k is string => !!k),
          fromCloud: true,
        };
      });
    await db.docs.bulkPut(docs);

    // 旅行亮点：每一条按 id 三方合并；简介、贴士、每日精选整份三方合并
    {
      const oldHs = await db.highlights.where('tripId').equals(tripId).toArray();
      const oldById = new Map(oldHs.map((h) => [h.id, h]));
      const pick = localSnap
        ? merge3(sharedEntities(bs, ['highlight']), sharedEntities(localSnap, ['highlight']), sharedEntities(inc, ['highlight']), (e) => e.id, (e) => e.core)
        : (inc.guide?.highlights ?? []).map((h) => ({ id: h.id, from: 'incoming' as const }));
      const incH = new Map((inc.guide?.highlights ?? []).map((h) => [h.id, h]));
      const next: Highlight[] = [];
      pick.forEach((r, i) => {
        if (r.from === 'local') {
          const h = oldById.get(r.id);
          if (h) next.push({ ...h, order: i });
          return;
        }
        const h = incH.get(r.id)!;
        const { photoHash, photoMime: _m, ...rest } = h;
        void _m;
        next.push({ ...rest, tripId, order: i, photoKey: photoHash ? cloudBlobKey(photoHash) : undefined, updatedAt: ts });
      });
      const keep = new Map(next.map((h) => [h.id, h.photoKey]));
      for (const h of oldHs) if (h.photoKey && keep.get(h.id) !== h.photoKey) await dropOwn(h.photoKey);
      await db.highlights.bulkDelete(oldHs.map((h) => h.id));
      await db.highlights.bulkPut(next);

      const oldG = await db.guides.get(tripId);
      const ge = (s?: TripSnapshot) => sharedEntities(s, ['guide'])[0];
      const mineGuide = !!localSnap && keepMine(ge(bs), ge(localSnap), ge(inc), (e) => e?.core ?? '');
      if (!mineGuide) {
        const g = inc.guide;
        const days = Object.fromEntries((g?.days ?? []).map((d) => [d.dayId, { title: d.title, hidden: d.hidden, focus: d.focus, photoKey: d.photoHash ? cloudBlobKey(d.photoHash) : undefined }]));
        const nextKeys = new Set(Object.values(days).map((d) => d.photoKey));
        for (const d of Object.values(oldG?.days ?? {})) if (d.photoKey && !nextKeys.has(d.photoKey)) await dropOwn(d.photoKey);
        if (g) await db.guides.put({ tripId, intro: g.intro, coverFocus: g.coverFocus, tips: g.tips, ...(g.days?.length ? { days } : {}), updatedAt: ts });
        else await db.guides.delete(tripId);
      }
    }

    // 美食册：按 id 三方合并
    {
      const oldF = await db.foodEntries.where('tripId').equals(tripId).toArray();
      const oldById = new Map(oldF.map((f) => [f.id, f]));
      const pick = localSnap
        ? merge3(sharedEntities(bs, ['food']), sharedEntities(localSnap, ['food']), sharedEntities(inc, ['food']), (e) => e.id, (e) => e.core)
        : [
            ...(inc.food ?? []).map((f) => ({ id: f.id, from: 'incoming' as const })),
            // 加入前自己手机上同一份旅程已经有的美食（极少见）保留
            ...oldF.filter((f) => !(inc.food ?? []).some((x) => x.id === f.id)).map((f) => ({ id: f.id, from: 'local' as const })),
          ];
      const incF = new Map((inc.food ?? []).map((f) => [f.id, f]));
      const next: FoodEntry[] = [];
      for (const r of pick) {
        if (r.from === 'local') {
          const f = oldById.get(r.id);
          if (f) next.push(f);
          continue;
        }
        const { photoHash, photoMime: _m, thumbHash: _t, ...rest } = incF.get(r.id)!;
        void _m;
        void _t;
        next.push({ ...rest, tripId, ...(photoHash ? { photoKey: cloudBlobKey(photoHash) } : {}), updatedAt: ts });
      }
      const keep = new Map(next.map((f) => [f.id, f.photoKey]));
      for (const f of oldF) if (f.photoKey && keep.get(f.id) !== f.photoKey) await dropOwn(f.photoKey);
      await db.foodEntries.bulkDelete(oldF.map((f) => f.id));
      await db.foodEntries.bulkPut(next);
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
