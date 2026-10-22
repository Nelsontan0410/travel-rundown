// 2026-10-19 同步第二步：同伴把本机的修改「提交」成建议 → 主用户逐项接受 / 不采纳 → 主用户发布新版本。
// 同伴没提交的修改一直只在自己手机上。纯逻辑 + 数据库，不含界面。
// 2026-10-23 共同制作：除了行程项，旅程资料、每天、证明资料、旅行亮点、美食册都能提交；
// 文件和照片跟着建议上传，主用户接受时连文件一起写进本机。
import { db } from '../db/schema';
import { addItem, deleteItem, setBudget, setDepartTime, setParticipants, shiftTripStart, updateDay, updateItem, updateTripInfo, type ItemPatch } from '../db/repo';
import type { Day, Doc, Item } from '../domain/types';
import type { FoodEntry } from '../domain/food';
import type { Highlight } from '../domain/guide';
import { thumbKeyOf } from '../lib/photo';
import { LINK_MIME } from '../domain/bookings';
import { backend, type CloudSuggestion, type PublishSummary, type SuggestionChange } from './backend';
import { ITEM_FIELD_LABEL, sameItem, stable, type SnapshotFood, type SnapshotHighlight } from './snapshot';
import { cloudBlobKey, currentSnapshot, filePath, suggestFilePath } from './sync';
import {
  coreOfData,
  describeData,
  diffEntities,
  KIND_LABEL,
  sharedEntities,
  type EntityChange,
  type PortableDay,
  type PortableDoc,
  type PortableGuide,
  type PortableTrip,
  type SharedKind,
} from './shared';

const META = ['id', 'key', 'tripId', 'dayId', 'order', 'src'] as const;
/** 存进建议的样子：去掉本机才有意义的字段 */
const portable = (it: Item): Item => {
  const { src: _s, key: _k, ...rest } = it;
  void _s;
  void _k;
  return { ...rest, key: '' } as Item;
};

function fieldsChanged(a: Item, b: Item): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if ((META as readonly string[]).includes(k)) continue;
    if (stable((a as unknown as Record<string, unknown>)[k]) !== stable((b as unknown as Record<string, unknown>)[k])) out.push(ITEM_FIELD_LABEL[k] ?? k);
  }
  return out;
}

/** 同伴：本机相对上次套用的版本改了哪些项 */
export async function myLocalChanges(tripId: string): Promise<SuggestionChange[]> {
  const base = await db.cloudBases.get(tripId);
  if (!base) return [];
  const [days, items] = await Promise.all([db.days.where('tripId').equals(tripId).toArray(), db.items.where('tripId').equals(tripId).toArray()]);
  const dayIdx = new Map(days.map((d) => [d.id, d.index]));
  const baseDayIdx = new Map(base.snapshot.days.map((d) => [d.id, d.index]));
  const b = new Map(base.snapshot.items.map((i) => [i.id, i]));
  const out: SuggestionChange[] = [];
  for (const it of items) {
    const o = b.get(it.id);
    if (!o) out.push({ op: 'add', itemId: it.id, dayIndex: dayIdx.get(it.dayId), title: it.title, item: portable(it) });
    else if (!sameItem(o, it)) {
      const moved = dayIdx.get(it.dayId) !== baseDayIdx.get(o.dayId);
      const fields = fieldsChanged(o, it);
      if (moved) fields.unshift('日期');
      if (fields.length) out.push({ op: 'change', itemId: it.id, dayIndex: dayIdx.get(it.dayId), title: it.title, item: portable(it), base: portable(o), fields });
    }
  }
  const alive = new Set(items.map((i) => i.id));
  for (const o of base.snapshot.items) if (!alive.has(o.id)) out.push({ op: 'remove', itemId: o.id, dayIndex: baseDayIdx.get(o.dayId), title: o.title, base: portable(o) });
  out.sort((x, y) => (x.dayIndex ?? 0) - (y.dayIndex ?? 0));
  // 行程项以外的共享内容（只比较，不读文件内容）
  const { snapshot } = await currentSnapshot(tripId, 'fast');
  return [...out, ...diffEntities(base.snapshot, snapshot).map(toChange)];
}

const KIND_ORDER: SharedKind[] = ['trip', 'day', 'doc', 'guide', 'highlight', 'food'];
export const changeId = (kind: SharedKind, id: string) => `${kind}:${id}`;

function toChange(e: EntityChange): SuggestionChange {
  return {
    op: e.op,
    kind: e.kind,
    itemId: changeId(e.kind, e.id),
    entityId: e.id,
    title: e.title,
    ...(e.dayIndex !== undefined ? { dayIndex: e.dayIndex } : {}),
    ...(e.after ? { data: e.after.data, files: e.after.files } : {}),
    ...(e.before ? { baseData: e.before.data } : {}),
    ...(e.fields?.length ? { fields: e.fields } : {}),
    text: e.op === 'remove' ? '' : describeData(e.kind, e.after?.data),
  };
}

/** 这一处是行程项以外的内容 */
export const isEntity = (c: SuggestionChange): c is SuggestionChange & { kind: SharedKind; entityId: string } => !!c.kind && c.kind !== 'item' && !!c.entityId;

/** 界面上的一句话：改后的样子 */
export function changeText(c: SuggestionChange): string {
  if (c.op === 'remove') return '';
  if (isEntity(c)) return c.text ?? describeData(c.kind, c.data);
  return '';
}


const OP_LABEL = { add: '新增', change: '修改', remove: '删除' } as const;
export const changeLine = (c: SuggestionChange) =>
  isEntity(c)
    ? c.kind === 'trip' || c.kind === 'day' || c.kind === 'guide'
      ? `修改${c.kind === 'day' ? '' : KIND_LABEL[c.kind]} · ${c.title}`
      : `${OP_LABEL[c.op]}${KIND_LABEL[c.kind]} · ${c.title}`
    : `${OP_LABEL[c.op]} · ${c.dayIndex ? `Day ${c.dayIndex} ` : ''}${c.title}`;

/** 同伴：把选中的修改提交给主用户 */
export async function submitSuggestion(tripId: string, note: string, itemIds: string[]): Promise<string> {
  const all = await myLocalChanges(tripId);
  let pick = all.filter((c) => itemIds.includes(c.itemId));
  if (!pick.length) throw new Error('请至少选一处修改');
  const be0 = await backend();
  if (pick.some(isEntity)) pick = await withRealFiles(tripId, pick, (await be0.ensureSession()).userId);
  const trip = await db.trips.get(tripId);
  const summary: PublishSummary = {
    added: pick.filter((c) => c.op === 'add').length,
    changed: pick.filter((c) => c.op === 'change').length,
    removed: pick.filter((c) => c.op === 'remove').length,
    lines: pick.slice(0, 6).map(changeLine),
  };
  const be = await backend();
  return be.submitSuggestion(tripId, trip?.cloud?.version ?? 0, note.trim(), pick, summary);
}

/**
 * 提交前：行程项以外的内容换成真正的内容哈希，并把主用户版本里没有的文件上传到 <旅程>/s/<自己>/<哈希>。
 * 主用户版本里已经有的文件不重复上传（主用户本来就读得到）。
 */
async function withRealFiles(tripId: string, pick: SuggestionChange[], userId: string): Promise<SuggestionChange[]> {
  const base = await db.cloudBases.get(tripId);
  const { snapshot, files } = await currentSnapshot(tripId, 'real');
  const ents = new Map(sharedEntities(snapshot).map((e) => [changeId(e.kind, e.id), e]));
  const keyOf = new Map<string, string>();
  for (const [k, h] of files) if (!keyOf.has(h)) keyOf.set(h, k);
  const known = new Set(sharedEntities(base?.snapshot).flatMap((e) => e.files.map((f) => f.hash)));
  const be = await backend();
  const out: SuggestionChange[] = [];
  for (const c of pick) {
    if (!isEntity(c) || c.op === 'remove') {
      out.push(c);
      continue;
    }
    const e = ents.get(c.itemId);
    if (!e) throw new Error(`「${c.title}」刚刚又改过了，请重新打开这一页再提交`);
    for (const f of e.files) {
      if (known.has(f.hash)) continue;
      const k = keyOf.get(f.hash);
      const rec = k ? await db.blobs.get(k) : undefined;
      if (!rec) throw new Error(`「${c.title}」的文件在这台手机上找不到，没法提交`);
      await be.upload(suggestFilePath(tripId, userId, f.hash), rec.blob);
    }
    out.push({ ...c, data: e.data, files: e.files, text: describeData(e.kind, e.data) });
  }
  return out;
}

/** 本机没有就从云端下载（先找建议附带的，再找版本里的），存成 cloud:<哈希> */
async function ensureFiles(tripId: string, files: { key: string; hash: string; mime?: string }[], authorId?: string): Promise<void> {
  const be = await backend();
  for (const f of files) {
    if (await db.blobs.get(f.key)) continue;
    let blob: Blob | undefined;
    if (authorId) blob = await be.download(suggestFilePath(tripId, authorId, f.hash)).catch(() => undefined);
    if (!blob) blob = await be.download(filePath(tripId, f.hash));
    await db.blobs.put({ key: f.key, blob: f.mime && !blob.type ? new Blob([blob], { type: f.mime }) : blob });
  }
}

/** 一样内容要用到的文件：键（本机存放位置）+ 哈希 */
function filesFor(kind: SharedKind, data: unknown): { key: string; hash: string; mime?: string }[] {
  const out: { key: string; hash: string; mime?: string }[] = [];
  const d = data as Record<string, unknown>;
  if (!d) return out;
  if (kind === 'trip' && d.coverHash) out.push({ key: cloudBlobKey(d.coverHash as string), hash: d.coverHash as string, mime: d.coverMime as string | undefined });
  if (kind === 'doc' && d.fileHash) out.push({ key: cloudBlobKey(d.fileHash as string), hash: d.fileHash as string, mime: d.mime as string | undefined });
  if (kind === 'highlight' && d.photoHash) out.push({ key: cloudBlobKey(d.photoHash as string), hash: d.photoHash as string, mime: d.photoMime as string | undefined });
  if (kind === 'guide') for (const x of (d as unknown as PortableGuide).days ?? []) if (x.photoHash) out.push({ key: cloudBlobKey(x.photoHash), hash: x.photoHash, mime: x.photoMime });
  if (kind === 'food') {
    const f = d as unknown as SnapshotFood;
    if (f.photoHash) {
      out.push({ key: cloudBlobKey(f.photoHash), hash: f.photoHash, mime: f.photoMime });
      if (f.thumbHash) out.push({ key: thumbKeyOf(cloudBlobKey(f.photoHash)), hash: f.thumbHash, mime: 'image/jpeg' });
    }
  }
  return out;
}

/**
 * 把一样内容写成 data 的样子（同伴「恢复成主用户版本」和主用户「接受」共用）。
 * data = undefined 表示删除。只改这一样，不碰别的。
 */
async function writeEntity(tripId: string, kind: SharedKind, id: string, data: unknown, base?: unknown): Promise<void> {
  const ts = new Date().toISOString();
  const dropOwn = async (k?: string) => {
    if (k && !k.startsWith('cloud:') && !k.startsWith('link:')) await db.blobs.bulkDelete([k, thumbKeyOf(k)]);
  };
  switch (kind) {
    case 'trip': {
      const t = data as PortableTrip;
      const b = (base ?? {}) as Partial<PortableTrip>;
      const cur = await db.trips.get(tripId);
      if (!cur || !t) return;
      // 只改对方改过的字段，其他字段保留这台手机现在的
      const changed = (k: keyof PortableTrip) => stable(t[k]) !== stable(b[k]) || base === undefined;
      if (changed('title') || changed('destination')) await updateTripInfo(tripId, { ...(changed('title') ? { title: t.title } : {}), ...(changed('destination') ? { destination: t.destination ?? '' } : {}) });
      if (changed('budget')) await setBudget(tripId, t.budget);
      if (changed('participants')) await setParticipants(tripId, t.participants);
      if (changed('departTime')) await setDepartTime(tripId, t.departTime);
      if (changed('translate') && t.translate) await db.trips.update(tripId, { translate: t.translate, updatedAt: ts });
      if (changed('coverHash')) {
        if (t.coverHash) await db.trips.update(tripId, { coverBlobKey: cloudBlobKey(t.coverHash), updatedAt: ts });
        else if (cur.coverBlobKey) {
          await db.trips.update(tripId, { coverBlobKey: undefined, updatedAt: ts });
          await dropOwn(cur.coverBlobKey);
        }
      }
      if (changed('startDate') && t.startDate && t.startDate !== cur.startDate) await shiftTripStart(tripId, t.startDate);
      return;
    }
    case 'day': {
      const d = data as PortableDay;
      const idx = Number(id.replace(/^day:/, ''));
      const day = (await db.days.where('tripId').equals(tripId).toArray()).find((x) => x.index === idx);
      if (!day || !d) return;
      await updateDay(day.id, { title: d.title ?? '', note: d.note ?? '', ...(d.city ? { city: d.city } : {}) });
      return;
    }
    case 'doc': {
      const cur = await db.docs.get(id);
      if (!data) {
        if (cur) {
          await db.docs.delete(id);
          await dropOwn(cur.blobKey);
        }
        return;
      }
      const d = data as PortableDoc;
      const items = await db.items.where('tripId').equals(tripId).toArray();
      const keyOfId = new Map(items.map((i) => [i.id, i.key]));
      const role = (await db.trips.get(tripId))?.cloud?.role;
      const { fileHash, itemIds, itemKeys: _k, ...rest } = d;
      void _k;
      const doc: Doc = {
        ...rest,
        id,
        tripId,
        blobKey: fileHash ? cloudBlobKey(fileHash) : `link:${id}`,
        mime: fileHash ? d.mime : d.url ? LINK_MIME : d.mime,
        itemKeys: itemIds.map((x) => keyOfId.get(x)).filter((k): k is string => !!k),
        ...(role === 'member' ? { fromCloud: true } : {}),
        addedAt: cur?.addedAt ?? d.addedAt ?? ts,
        updatedAt: ts,
      };
      await db.docs.put(doc);
      if (cur && cur.blobKey !== doc.blobKey) await dropOwn(cur.blobKey);
      return;
    }
    case 'guide': {
      const old = await db.guides.get(tripId);
      const g = data as PortableGuide | undefined;
      const days = Object.fromEntries((g?.days ?? []).map((d) => [d.dayId, { title: d.title, hidden: d.hidden, focus: d.focus, photoKey: d.photoHash ? cloudBlobKey(d.photoHash) : undefined }]));
      const keep = new Set(Object.values(days).map((d) => d.photoKey));
      for (const d of Object.values(old?.days ?? {})) if (d.photoKey && !keep.has(d.photoKey)) await dropOwn(d.photoKey);
      await db.guides.put({ tripId, intro: g?.intro, coverFocus: g?.coverFocus, tips: g?.tips ?? [], ...(g?.days?.length ? { days } : {}), updatedAt: ts });
      return;
    }
    case 'highlight': {
      const cur = await db.highlights.get(id);
      if (!data) {
        if (cur) {
          await db.highlights.delete(id);
          await dropOwn(cur.photoKey);
        }
        return;
      }
      const { photoHash, photoMime: _m, ...rest } = data as SnapshotHighlight;
      void _m;
      const all = await db.highlights.where('tripId').equals(tripId).toArray();
      const h: Highlight = { ...rest, tripId, order: cur?.order ?? all.reduce((m, x) => Math.max(m, x.order), -1) + 1, photoKey: photoHash ? cloudBlobKey(photoHash) : undefined, updatedAt: ts };
      await db.highlights.put(h);
      if (cur?.photoKey && cur.photoKey !== h.photoKey) await dropOwn(cur.photoKey);
      return;
    }
    case 'food': {
      const cur = await db.foodEntries.get(id);
      if (!data) {
        if (cur) {
          await db.foodEntries.delete(id);
          await dropOwn(cur.photoKey);
        }
        return;
      }
      const { photoHash, photoMime: _m, thumbHash: _t, ...rest } = data as SnapshotFood;
      void _m;
      void _t;
      const f: FoodEntry = { ...rest, id, tripId, ...(photoHash ? { photoKey: cloudBlobKey(photoHash) } : {}), updatedAt: ts };
      await db.foodEntries.put(f);
      if (cur?.photoKey && cur.photoKey !== f.photoKey) await dropOwn(cur.photoKey);
      return;
    }
  }
}

/** 同伴：把一项恢复成主用户版本（放弃自己的修改）。itemId 是行程项 id，或「类型:id」 */
export async function revertLocal(tripId: string, itemId: string): Promise<void> {
  const base = await db.cloudBases.get(tripId);
  if (!base) return;
  const ent = sharedEntities(base.snapshot).find((e) => changeId(e.kind, e.id) === itemId);
  const kind = (KIND_ORDER as string[]).find((k) => itemId.startsWith(`${k}:`)) as SharedKind | undefined;
  if (kind) {
    const id = itemId.slice(kind.length + 1);
    if (ent) await ensureFiles(tripId, filesFor(kind, ent.data));
    await writeEntity(tripId, kind, id, ent?.data);
    return;
  }
  const o = base.snapshot.items.find((i) => i.id === itemId);
  const cur = await db.items.get(itemId);
  if (!o) {
    if (cur) await deleteItem(itemId);
    return;
  }
  const days = await db.days.where('tripId').equals(tripId).toArray();
  const idx = base.snapshot.days.find((d) => d.id === o.dayId)?.index;
  const day = days.find((d) => d.index === idx) ?? days[0];
  if (!day) return;
  if (cur) await updateItem(itemId, patchFrom(cur, o, day.id));
  else await addItem(tripId, day.id, toDraft(o), { id: o.id });
}

// ———————— 主用户 ————————

/** 改后的样子 → updateItem 的补丁（原来有、现在没有的字段设成 undefined） */
function patchFrom(cur: Item, next: Item, dayId: string): ItemPatch {
  const patch: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(cur), ...Object.keys(next)]);
  for (const k of keys) {
    if ((META as readonly string[]).includes(k)) continue;
    patch[k] = (next as unknown as Record<string, unknown>)[k];
  }
  if (dayId !== cur.dayId) patch.dayId = dayId;
  return patch as ItemPatch;
}
function toDraft(it: Item): ItemPatch & { type: Item['type']; title: string } {
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(it)) if (!(META as readonly string[]).includes(k)) d[k] = v;
  return d as ItemPatch & { type: Item['type']; title: string };
}

export interface ReviewRow {
  change: SuggestionChange;
  /** 主用户手机上现在的这一项 */
  current?: Item;
  /** 行程项以外：主用户现在的样子（一句话；没有就是 undefined） */
  currentText?: string;
  /** 同伴提交之后主用户又改过（或删掉了）这一项 */
  ownerChanged: boolean;
  /** 在主用户这边找不到对应的那一天 */
  noDay: boolean;
}

export async function reviewRows(tripId: string, sg: CloudSuggestion): Promise<ReviewRow[]> {
  const [days, items] = await Promise.all([db.days.where('tripId').equals(tripId).toArray(), db.items.where('tripId').equals(tripId).toArray()]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const idx = new Set(days.map((d) => d.index));
  let mine: Map<string, { kind: SharedKind; data: unknown }> | null = null;
  if (sg.changes.some(isEntity)) {
    const { snapshot } = await currentSnapshot(tripId, 'real');
    mine = new Map(sharedEntities(snapshot).map((e) => [changeId(e.kind, e.id), { kind: e.kind, data: e.data }]));
  }
  return sg.changes.map((change) => {
    if (isEntity(change)) {
      const cur = mine?.get(change.itemId);
      const ownerChanged =
        change.op === 'add' ? !!cur : change.kind === 'guide' && !change.baseData ? !!cur : !cur || coreOfData(change.kind, cur.data) !== coreOfData(change.kind, change.baseData);
      return { change, currentText: cur ? describeData(change.kind, cur.data) : undefined, ownerChanged, noDay: false };
    }
    const current = byId.get(change.itemId);
    const ownerChanged = change.op === 'add' ? !!current : !current || (!!change.base && !sameItem(current, change.base));
    return { change, current, ownerChanged, noDay: change.op !== 'remove' && change.dayIndex !== undefined && !idx.has(change.dayIndex) };
  });
}

/** 主用户：把接受的修改写进本机，然后在云端记下决定（之后再发布新版本，大家才收到） */
export async function decide(tripId: string, sg: CloudSuggestion, decisions: Record<string, 'accept' | 'reject'>): Promise<{ accepted: number; rejected: number }> {
  const days: Day[] = await db.days.where('tripId').equals(tripId).toArray();
  const dayFor = (i?: number) => days.find((d) => d.index === i) ?? days[days.length - 1];
  let accepted = 0;
  let rejected = 0;
  // 先把接受的那些附带的文件都下载好（下载失败就整个不处理，保持原样）
  const accept = sg.changes.filter((c) => decisions[c.itemId] === 'accept');
  for (const c of accept) if (isEntity(c) && c.op !== 'remove') await ensureFiles(tripId, filesFor(c.kind, c.data), sg.authorId);
  // 旅程资料（可能改出发日期，会重算 key）先处理，再处理每一项、资料、亮点、美食
  const ordered = [...sg.changes].sort((a, b) => (isEntity(a) && a.kind === 'trip' ? -1 : 0) - (isEntity(b) && b.kind === 'trip' ? -1 : 0));
  for (const c of ordered) {
    if (decisions[c.itemId] !== 'accept') {
      rejected += 1;
      continue;
    }
    accepted += 1;
    if (isEntity(c)) {
      await writeEntity(tripId, c.kind, c.entityId, c.op === 'remove' ? undefined : c.data, c.baseData);
      continue;
    }
    const cur = await db.items.get(c.itemId);
    if (c.op === 'remove') {
      if (cur) await deleteItem(c.itemId);
      continue;
    }
    const day = dayFor(c.dayIndex);
    if (!day || !c.item) continue;
    if (cur) await updateItem(c.itemId, patchFrom(cur, c.item, day.id));
    else await addItem(tripId, day.id, toDraft(c.item), { id: c.itemId });
  }
  const be = await backend();
  await be.decideSuggestion(sg.id, decisions, accepted, rejected);
  return { accepted, rejected };
}
