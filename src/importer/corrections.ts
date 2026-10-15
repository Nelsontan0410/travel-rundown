// 导入预览里的「Layer 3 · 人工确认」：用户修正低可信字段后，在草稿上做的纯函数修改。
// 每个函数都返回新的 ParseResult，确认导入之前不会写进数据库。
import type { ItemType, MealKind } from '../domain/types';
import { computeErrors, rekey, type DayDraft, type ItemDraft, type ParseResult } from './parseMd';

function clone(r: ParseResult): ParseResult {
  return structuredClone(r);
}

function refresh(r: ParseResult): ParseResult {
  const ds = r.days.map((d) => d.date).filter(Boolean).sort();
  if (ds.length) {
    if (!r.trip.startDate || r.trip.startDate > ds[0]) r.trip.startDate = ds[0];
    if (!r.trip.endDate || r.trip.endDate < ds[ds.length - 1]) r.trip.endDate = ds[ds.length - 1];
  }
  rekey(r.days);
  const untyped = (r.mapping?.flags ?? []).filter((f) => f.kind === 'type').length;
  r.errors = computeErrors(r.trip, r.days, untyped, r.itemCount);
  return r;
}

const drop = (r: ParseResult, id: string) => {
  if (r.mapping) r.mapping.flags = r.mapping.flags.filter((f) => f.id !== id);
};

export function setTripTitle(r0: ParseResult, title: string): ParseResult {
  const r = clone(r0);
  r.trip.title = title.trim() || '未命名旅程';
  const segs = r.trip.title.split(/\s*[，,]\s*/).filter(Boolean);
  if (segs.length > 1) r.trip.destination = segs[segs.length - 1];
  if (title.trim()) drop(r, 'title');
  return refresh(r);
}

/** 补上或修改某一天的日期（YYYY-MM-DD） */
export function setDayDate(r0: ParseResult, dayIdx: number, iso: string, flagId?: string): ParseResult {
  const r = clone(r0);
  const d = r.days[dayIdx];
  if (!d || !iso) return r0;
  d.date = iso;
  for (const it of d.items) if (it.type === 'lodging' && it.lodging && !it.lodging.checkIn) it.lodging.checkIn = iso;
  if (flagId) drop(r, flagId);
  else if (r.mapping) r.mapping.flags = r.mapping.flags.filter((f) => !((f.kind === 'date' || f.kind === 'ambiguous-date') && f.dayIdx === dayIdx));
  // 出发 / 结束日期按所有天重新算
  const ds = r.days.map((x) => x.date).filter(Boolean).sort();
  r.trip.startDate = ds[0] ?? '';
  r.trip.endDate = ds[ds.length - 1] ?? '';
  return refresh(r);
}

/** 有歧义的日期确认无误：只去掉提醒 */
export function confirmFlag(r0: ParseResult, flagId: string): ParseResult {
  const r = clone(r0);
  drop(r, flagId);
  return refresh(r);
}

export function setItemType(r0: ParseResult, dayIdx: number, itemIdx: number, type: ItemType, flagId?: string): ParseResult {
  const r = clone(r0);
  const d: DayDraft | undefined = r.days[dayIdx];
  const it: ItemDraft | undefined = d?.items[itemIdx];
  if (!d || !it) return r0;
  it.type = type;
  if (type === 'meal' && !it.meal) {
    const t = it.start;
    const mk: MealKind | undefined = t ? (t < '10:30' ? 'breakfast' : t < '15:00' ? 'lunch' : t >= '17:00' ? 'dinner' : 'snack') : undefined;
    if (mk) it.meal = mk;
  }
  if (type !== 'meal') delete it.meal;
  if (type === 'lodging') it.lodging = { checkIn: d.date, ...it.lodging };
  else delete it.lodging;
  if (type !== 'flight') delete it.flight;
  if (type !== 'transit') delete it.transit;
  if ((type === 'spot' || type === 'lodging') && !it.place) it.place = { name: it.title };
  if (flagId) drop(r, flagId);
  return refresh(r);
}

export type UnmappedTarget = 'note' | 'timeNote' | 'place' | 'address' | 'keep';

/** 认不出的字段改映射到某个字段；keep = 保留在「其他信息」（默认） */
export function mapUnmapped(r0: ParseResult, id: string, target: UnmappedTarget): ParseResult {
  const r = clone(r0);
  const u = r.mapping?.unmapped.find((x) => x.id === id);
  if (!u || target === 'keep') return r0;
  if (u.level === 'item' && u.dayIdx != null && u.itemIdx != null) {
    const it = r.days[u.dayIdx]?.items[u.itemIdx];
    if (!it) return r0;
    if (it.meta) {
      delete it.meta[u.field];
      if (!Object.keys(it.meta).length) delete it.meta;
    }
    if (target === 'note') it.note = it.note ? `${it.note}；${u.value}` : u.value;
    if (target === 'timeNote') it.timeNote = u.value;
    if (target === 'place') it.place = { ...(it.place ?? { name: '' }), name: u.value };
    if (target === 'address') it.place = { ...(it.place ?? { name: it.title }), address: u.value };
  } else if (u.level === 'day' && u.dayIdx != null) {
    // 当天的未知字段默认已经在当天备注里，这里只把「字段名：」去掉
    const d = r.days[u.dayIdx];
    if (target === 'note' && d?.note) d.note = d.note.replace(`${u.field}：${u.value}`, u.value);
    else return r0;
  } else return r0;
  r.mapping!.unmapped = r.mapping!.unmapped.filter((x) => x.id !== id);
  return refresh(r);
}
