// 2026-10-19 同步第二步：同伴把本机的修改「提交」成建议 → 主用户逐项接受 / 不采纳 → 主用户发布新版本。
// 同伴没提交的修改一直只在自己手机上。纯逻辑 + 数据库，不含界面。
import { db } from '../db/schema';
import { addItem, deleteItem, updateItem, type ItemPatch } from '../db/repo';
import type { Day, Item } from '../domain/types';
import { backend, type CloudSuggestion, type PublishSummary, type SuggestionChange } from './backend';
import { ITEM_FIELD_LABEL, sameItem, stable } from './snapshot';

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
  return out.sort((x, y) => (x.dayIndex ?? 0) - (y.dayIndex ?? 0));
}

const OP_LABEL = { add: '新增', change: '修改', remove: '删除' } as const;
export const changeLine = (c: SuggestionChange) => `${OP_LABEL[c.op]} · ${c.dayIndex ? `Day ${c.dayIndex} ` : ''}${c.title}`;

/** 同伴：把选中的修改提交给主用户 */
export async function submitSuggestion(tripId: string, note: string, itemIds: string[]): Promise<string> {
  const all = await myLocalChanges(tripId);
  const pick = all.filter((c) => itemIds.includes(c.itemId));
  if (!pick.length) throw new Error('请至少选一处修改');
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

/** 同伴：把一项恢复成主用户版本（放弃自己的修改） */
export async function revertLocal(tripId: string, itemId: string): Promise<void> {
  const base = await db.cloudBases.get(tripId);
  if (!base) return;
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
  /** 同伴提交之后主用户又改过（或删掉了）这一项 */
  ownerChanged: boolean;
  /** 在主用户这边找不到对应的那一天 */
  noDay: boolean;
}

export async function reviewRows(tripId: string, sg: CloudSuggestion): Promise<ReviewRow[]> {
  const [days, items] = await Promise.all([db.days.where('tripId').equals(tripId).toArray(), db.items.where('tripId').equals(tripId).toArray()]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const idx = new Set(days.map((d) => d.index));
  return sg.changes.map((change) => {
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
  for (const c of sg.changes) {
    if (decisions[c.itemId] !== 'accept') {
      rejected += 1;
      continue;
    }
    accepted += 1;
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
