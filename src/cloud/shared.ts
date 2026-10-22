// 2026-10-23 同伴共同制作：行程项以外的共享内容（旅程资料、每天、证明资料、旅行亮点、美食册）
// 统一成「一样一样的内容」，给三方合并（同伴套用新版本时保留自己的修改）和建议（提交、审核）共用。纯函数。
import type { Item } from '../domain/types';
import { CATEGORY_LABEL } from '../domain/guide';
import { stable, foodCore, type SnapshotDoc, type SnapshotFood, type SnapshotGuide, type SnapshotHighlight, type TripSnapshot } from './snapshot';

export type SharedKind = 'trip' | 'day' | 'doc' | 'guide' | 'highlight' | 'food';

export const KIND_LABEL: Record<SharedKind, string> = {
  trip: '旅程资料',
  day: '每天',
  doc: '资料',
  guide: '亮点简介',
  highlight: '亮点',
  food: '美食',
};

/** 附件：按内容哈希存在云端 */
export interface SharedFile {
  hash: string;
  mime?: string;
}

/** 快照里的资料：itemKeys 换成行程项 id（同伴和主用户的 key 可能不同，id 一样） */
export type PortableDoc = Omit<SnapshotDoc, 'itemKeys'> & { itemKeys: string[]; itemIds: string[] };
export type PortableGuide = Omit<SnapshotGuide, 'highlights'>;
export interface PortableDay {
  index: number;
  city?: string;
  title?: string;
  note?: string;
}
export type PortableTrip = TripSnapshot['trip'];

export interface SharedEntity {
  kind: SharedKind;
  /** 旅程资料 = trip，亮点简介 = guide，每天 = day:<第几天>，其他 = 原来的 id */
  id: string;
  title: string;
  dayIndex?: number;
  /** 比较用（去掉顺序、时间这些不算改动的东西） */
  core: string;
  /** 改后的完整内容（建议里带给主用户） */
  data: PortableTrip | PortableDay | PortableDoc | PortableGuide | SnapshotHighlight | SnapshotFood;
  files: SharedFile[];
}

export const TRIP_SHARED_FIELDS = ['title', 'destination', 'startDate', 'budget', 'participants', 'departTime', 'translate', 'coverHash'] as const;
export const TRIP_SHARED_LABEL: Record<(typeof TRIP_SHARED_FIELDS)[number], string> = {
  title: '旅程名称', destination: '目的地', startDate: '出发日期', budget: '总预算', participants: '人数', departTime: '出发时间', translate: '翻译语言', coverHash: '封面',
};

const omit = <T extends object>(o: T, keys: string[]): Partial<T> => {
  const out = { ...o } as Record<string, unknown>;
  for (const k of keys) delete out[k];
  return out as Partial<T>;
};

function tripEntity(s: TripSnapshot): SharedEntity {
  const core = Object.fromEntries(TRIP_SHARED_FIELDS.map((k) => [k, (s.trip as Record<string, unknown>)[k]]));
  const files = s.trip.coverHash ? [{ hash: s.trip.coverHash, mime: s.trip.coverMime }] : [];
  return { kind: 'trip', id: 'trip', title: '旅程资料', core: stable(core), data: s.trip, files };
}

function dayEntities(s: TripSnapshot): SharedEntity[] {
  return [...s.days]
    .sort((a, b) => a.index - b.index)
    .map((d) => {
      const data: PortableDay = { index: d.index, ...(d.city ? { city: d.city } : {}), ...(d.title ? { title: d.title } : {}), ...(d.note ? { note: d.note } : {}) };
      return { kind: 'day' as const, id: `day:${d.index}`, title: `Day ${d.index}${d.title ? ` ${d.title}` : ''}`, dayIndex: d.index, core: stable(omit(data, ['index'])), data, files: [] };
    });
}

export function portableDoc(d: SnapshotDoc, items: Item[]): PortableDoc {
  const idOf = new Map(items.map((i) => [i.key, i.id]));
  const itemIds = [...new Set(d.itemKeys.map((k) => idOf.get(k)).filter((x): x is string => !!x))].sort();
  return { ...d, itemIds };
}

function docEntities(s: TripSnapshot): SharedEntity[] {
  return s.docs.map((d) => {
    const data = portableDoc(d, s.items);
    const core = omit(data, ['itemKeys', 'tripId', 'addedAt', 'updatedAt']);
    return { kind: 'doc' as const, id: d.id, title: d.title, core: stable(core), data, files: d.fileHash ? [{ hash: d.fileHash, mime: d.mime }] : [] };
  });
}

function guideEntity(s: TripSnapshot): SharedEntity | undefined {
  const g = s.guide;
  if (!g) return undefined;
  const data: PortableGuide = omit(g, ['highlights']) as PortableGuide;
  const empty = !data.intro && !data.coverFocus && !data.tips.length && !(data.days ?? []).length;
  if (empty) return undefined;
  const core = { ...data, days: (data.days ?? []).map((d) => omit(d, ['photoMime'])) };
  const files = (data.days ?? []).flatMap((d) => (d.photoHash ? [{ hash: d.photoHash, mime: d.photoMime }] : []));
  return { kind: 'guide', id: 'guide', title: '亮点简介、贴士和每日精选', core: stable(core), data, files };
}

function highlightEntities(s: TripSnapshot): SharedEntity[] {
  return (s.guide?.highlights ?? []).map((h) => ({
    kind: 'highlight' as const,
    id: h.id,
    title: h.title,
    dayIndex: h.dayIndex,
    core: stable(omit(h, ['photoMime'])),
    data: h,
    files: h.photoHash ? [{ hash: h.photoHash, mime: h.photoMime }] : [],
  }));
}

function foodEntities(s: TripSnapshot): SharedEntity[] {
  return (s.food ?? []).map((f) => ({
    kind: 'food' as const,
    id: f.id,
    title: f.name,
    core: stable(foodCore(f)),
    data: f,
    files: [...(f.photoHash ? [{ hash: f.photoHash, mime: f.photoMime }] : []), ...(f.thumbHash ? [{ hash: f.thumbHash, mime: 'image/jpeg' }] : [])],
  }));
}

/** 一份快照里行程项以外的全部共享内容 */
export function sharedEntities(s: TripSnapshot | undefined, kinds?: SharedKind[]): SharedEntity[] {
  if (!s) return [];
  const all = [tripEntity(s), ...dayEntities(s), ...docEntities(s), ...[guideEntity(s)].filter((e): e is SharedEntity => !!e), ...highlightEntities(s), ...foodEntities(s)];
  return kinds ? all.filter((e) => kinds.includes(e.kind)) : all;
}

/** 旅程资料改了哪些字段 */
export function tripFieldsChanged(a: PortableTrip | undefined, b: PortableTrip | undefined): string[] {
  return TRIP_SHARED_FIELDS.filter((k) => stable((a as Record<string, unknown> | undefined)?.[k]) !== stable((b as Record<string, unknown> | undefined)?.[k])).map((k) => TRIP_SHARED_LABEL[k]);
}

export interface EntityChange {
  op: 'add' | 'change' | 'remove';
  kind: SharedKind;
  id: string;
  title: string;
  dayIndex?: number;
  /** 改后（新增、修改） */
  after?: SharedEntity;
  /** 改前（修改、删除） */
  before?: SharedEntity;
  fields?: string[];
}

/** base → next 改了哪些共享内容。旅程资料和每天不会「新增 / 删除」，只会修改 */
export function diffEntities(base: TripSnapshot | undefined, next: TripSnapshot): EntityChange[] {
  if (!base) return [];
  const b = new Map(sharedEntities(base).map((e) => [`${e.kind}|${e.id}`, e]));
  const n = new Map(sharedEntities(next).map((e) => [`${e.kind}|${e.id}`, e]));
  const out: EntityChange[] = [];
  for (const [k, e] of n) {
    const o = b.get(k);
    if (!o) {
      if (e.kind === 'day' || e.kind === 'trip') continue;
      // 亮点简介：之前没有、现在有 = 修改
      out.push({ op: e.kind === 'guide' ? 'change' : 'add', kind: e.kind, id: e.id, title: e.title, dayIndex: e.dayIndex, after: e });
    } else if (o.core !== e.core) {
      out.push({
        op: 'change',
        kind: e.kind,
        id: e.id,
        title: e.title,
        dayIndex: e.dayIndex,
        after: e,
        before: o,
        ...(e.kind === 'trip' ? { fields: tripFieldsChanged(o.data as PortableTrip, e.data as PortableTrip) } : {}),
      });
    }
  }
  for (const [k, o] of b) {
    if (n.has(k) || o.kind === 'day' || o.kind === 'trip') continue;
    out.push({ op: o.kind === 'guide' ? 'change' : 'remove', kind: o.kind, id: o.id, title: o.title, dayIndex: o.dayIndex, before: o, ...(o.kind === 'guide' ? { after: undefined } : {}) });
  }
  return out;
}

/**
 * 三方合并（按 id）：base = 上次套用的版本，local = 本机现在，incoming = 主用户新版本。
 * · 只有自己改了（含自己新增、自己删除）→ 用自己的
 * · 其他情况（只有主用户改了、两边都没改、两边都改了）→ 用主用户的
 * 返回最后留下的每一样来自哪边，顺序：主用户版本里的顺序在前，自己新增的接在后面。
 */
export function merge3<T>(
  base: T[] | undefined,
  local: T[],
  incoming: T[],
  idOf: (x: T) => string,
  coreOf: (x: T) => string,
): { id: string; from: 'local' | 'incoming'; value: T }[] {
  const b = new Map((base ?? []).map((x) => [idOf(x), x]));
  const l = new Map(local.map((x) => [idOf(x), x]));
  const n = new Map(incoming.map((x) => [idOf(x), x]));
  const take = new Map<string, 'local' | 'incoming' | 'none'>();
  for (const id of new Set([...b.keys(), ...l.keys(), ...n.keys()])) {
    const bx = b.get(id);
    const lx = l.get(id);
    const nx = n.get(id);
    if (!bx) {
      take.set(id, nx ? 'incoming' : lx ? 'local' : 'none');
      continue;
    }
    const mine = !lx || coreOf(lx) !== coreOf(bx);
    const theirs = !nx || coreOf(nx) !== coreOf(bx);
    const from = mine && !theirs ? 'local' : 'incoming';
    take.set(id, from === 'local' ? (lx ? 'local' : 'none') : nx ? 'incoming' : 'none');
  }
  const out: { id: string; from: 'local' | 'incoming'; value: T }[] = [];
  const seen = new Set<string>();
  for (const x of incoming) {
    const id = idOf(x);
    const t = take.get(id);
    if (t === 'incoming') out.push({ id, from: 'incoming', value: x });
    else if (t === 'local') out.push({ id, from: 'local', value: l.get(id)! });
    seen.add(id);
  }
  for (const x of local) {
    const id = idOf(x);
    if (seen.has(id) || take.get(id) !== 'local') continue;
    out.push({ id, from: 'local', value: x });
  }
  return out;
}

/** 单一一份内容（旅程资料、亮点简介）的三方合并：只有自己改了才用自己的 */
export function keepMine<T>(base: T | undefined, local: T | undefined, incoming: T | undefined, coreOf: (x: T | undefined) => string): boolean {
  return coreOf(local) !== coreOf(base) && coreOf(incoming) === coreOf(base);
}

/** 某一样内容的比较值（和 sharedEntities 里的 core 一致），给审核时比较「主用户现在」和「同伴提交时」用 */
export function coreOfData(kind: SharedKind, data: unknown): string {
  if (data === undefined || data === null) return '';
  const d = data as Record<string, unknown>;
  switch (kind) {
    case 'trip':
      return stable(Object.fromEntries(TRIP_SHARED_FIELDS.map((k) => [k, d[k]])));
    case 'day':
      return stable(omit(d, ['index']));
    case 'doc':
      return stable(omit(d, ['itemKeys', 'tripId', 'addedAt', 'updatedAt']));
    case 'guide': {
      const g = d as unknown as PortableGuide;
      return stable({ ...g, days: (g.days ?? []).map((x) => omit(x, ['photoMime'])) });
    }
    case 'highlight':
      return stable(omit(d, ['photoMime']));
    case 'food':
      return stable(foodCore(d as unknown as SnapshotFood));
  }
}


/** 一句话说明这样内容现在的样子（建议列表、审核页显示） */
export function describeData(kind: SharedKind, data: unknown): string {
  if (data === undefined || data === null) return '（没有）';
  const d = data as Record<string, unknown>;
  const join = (xs: unknown[]) => xs.filter((x) => typeof x === 'string' && x.trim()).join(' · ');
  switch (kind) {
    case 'trip': {
      const t = d as unknown as PortableTrip;
      return join([t.title, t.destination, t.startDate, t.budget !== undefined ? `预算 RM ${(t.budget / 100).toLocaleString('en-US')}` : '', t.participants ? `${t.participants} 人` : '', t.coverHash ? '有封面' : '']);
    }
    case 'day':
      return join([d.city, d.title, d.note]) || '（没有主题、城市和备注）';
    case 'doc': {
      const x = d as unknown as PortableDoc;
      return join([x.title, x.url ? `链接 ${x.url}` : x.fileHash ? '附文件' : '', x.lock ? '有密码' : '', x.itemIds.length ? `关联 ${x.itemIds.length} 项` : '']);
    }
    case 'guide': {
      const g = d as unknown as PortableGuide;
      return join([g.intro, g.tips.length ? `${g.tips.length} 条贴士` : '', (g.days ?? []).length ? `${(g.days ?? []).length} 天精选` : '']) || '（空）';
    }
    case 'highlight': {
      const h = d as unknown as SnapshotHighlight;
      return join([CATEGORY_LABEL[h.category] ?? h.category, h.title, h.desc, h.photoHash ? '附照片' : '', h.hidden ? '已隐藏' : '']);
    }
    case 'food': {
      const f = d as unknown as SnapshotFood;
      return join([f.name, f.restaurantName, f.address, f.photoHash ? '附照片' : '']);
    }
  }
}
