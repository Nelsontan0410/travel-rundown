// 2026-10-18 同步：主用户发布的「版本」就是整份旅程的一份快照。纯函数，不碰数据库和网络。
// 只放大家共用的内容：旅程资料（含预算）、每天、每一项、共享的证明资料和封面。
// 完成勾选、实际记账、穿搭打包、主题都是各自的，不进快照。
import type { Day, Doc, Item, Trip } from '../domain/types';
import { sortHighlights, type Focus, type Guide, type GuideTip, type Highlight, type HighlightCategory } from '../domain/guide';

export interface SnapshotDoc extends Omit<Doc, 'blobKey' | 'fromCloud'> {
  /** 文件内容的 sha256（链接资料没有） */
  fileHash?: string;
}

/** 2026-10-20：旅行亮点跟着版本一起发布。照片按内容哈希放云端（和封面、证明文件同一套） */
export interface SnapshotHighlight {
  id: string;
  category: HighlightCategory;
  title: string;
  desc?: string;
  photoHash?: string;
  photoMime?: string;
  focus?: Focus;
  dayIndex?: number;
  /** 关联的行程项 id（同伴那边的行程项 id 和主用户一致） */
  itemId?: string;
  hidden: boolean;
}
export interface SnapshotGuideDay {
  dayId: string;
  title?: string;
  photoHash?: string;
  photoMime?: string;
  focus?: Focus;
  hidden?: boolean;
}
export interface SnapshotGuide {
  intro?: string;
  coverFocus?: Focus;
  tips: GuideTip[];
  /** 阶段 3：每天的展示设置（旧版本没有） */
  days?: SnapshotGuideDay[];
  /** 已按显示顺序排好 */
  highlights: SnapshotHighlight[];
}

export interface TripSnapshot {
  schema: 1;
  trip: Pick<Trip, 'title' | 'startDate' | 'endDate' | 'homeTz' | 'destination' | 'budget' | 'participants' | 'departTime' | 'translate'> & {
    coverHash?: string;
    coverMime?: string;
  };
  days: Day[];
  items: Item[];
  docs: SnapshotDoc[];
  /** 旧版本（2026-10-20 之前）没有这一项；没写任何亮点内容时也不带 */
  guide?: SnapshotGuide;
}

/** 比较内容时忽略：原文行号、显示顺序（别的项插进来会重新编号）、key（按规则从内容算出）、所属旅程 */
function itemCore(it: Item) {
  const { src: _s, order: _o, key: _k, tripId: _t, ...rest } = it;
  void _s; void _o; void _k; void _t;
  return rest;
}

/** 稳定的 JSON：键按字母排序，undefined 去掉 */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

export const sameItem = (a: Item | undefined, b: Item | undefined): boolean =>
  !!a && !!b ? stable(itemCore(a)) === stable(itemCore(b)) : a === b;

const DAY_FIELDS = ['index', 'date', 'tz', 'city', 'title', 'note'] as const;
export const sameDay = (a: Day | undefined, b: Day | undefined): boolean =>
  !!a && !!b ? DAY_FIELDS.every((k) => (a[k] ?? '') === (b[k] ?? '')) : a === b;

const DOC_FIELDS = ['title', 'kind', 'mime', 'itemKeys', 'lock', 'codeKind', 'url', 'app', 'fileHash'] as const;
export const sameDoc = (a: SnapshotDoc | undefined, b: SnapshotDoc | undefined): boolean =>
  !!a && !!b ? DOC_FIELDS.every((k) => stable(a[k]) === stable(b[k])) : a === b;

/** 用本机资料组成一份快照。fileHashOf：本机文件 blobKey → sha256（主用户发布前先算好） */
export function buildSnapshot(
  trip: Trip,
  days: Day[],
  items: Item[],
  docs: Doc[],
  fileHashOf: (blobKey: string) => string | undefined,
  guideData?: { guide?: Guide; highlights: Highlight[]; mimeOf?: (blobKey: string) => string | undefined },
): TripSnapshot {
  const coverHash = trip.coverBlobKey ? fileHashOf(trip.coverBlobKey) : undefined;
  const guide = guideData ? buildGuide(guideData.guide, guideData.highlights, fileHashOf, guideData.mimeOf) : undefined;
  return {
    schema: 1,
    trip: {
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      homeTz: trip.homeTz,
      destination: trip.destination,
      budget: trip.budget,
      participants: trip.participants,
      departTime: trip.departTime,
      translate: trip.translate,
      ...(coverHash ? { coverHash } : {}),
    },
    days: [...days].sort((a, b) => a.index - b.index).map((d) => ({ ...d, tripId: trip.id })),
    items: [...items].map((it) => ({ ...it, tripId: trip.id })),
    docs: docs.map(({ blobKey, fromCloud: _f, ...d }) => {
      void _f;
      const fileHash = fileHashOf(blobKey);
      return { ...d, tripId: trip.id, ...(fileHash ? { fileHash } : {}) };
    }),
    ...(guide ? { guide } : {}),
  };
}

/** 本机的亮点资料 → 快照里的样子；什么内容都没有就返回 undefined */
export function buildGuide(
  g: Guide | undefined,
  hs: Highlight[],
  fileHashOf: (blobKey: string) => string | undefined,
  mimeOf?: (blobKey: string) => string | undefined,
): SnapshotGuide | undefined {
  const dayEntries = Object.entries(g?.days ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!g?.intro && !g?.coverFocus && !g?.tips.length && !hs.length && !dayEntries.length) return undefined;
  const highlights = sortHighlights(hs).map((h): SnapshotHighlight => {
    const photoHash = h.photoKey ? fileHashOf(h.photoKey) : undefined;
    return {
      id: h.id,
      category: h.category,
      title: h.title,
      ...(h.desc ? { desc: h.desc } : {}),
      ...(photoHash ? { photoHash, ...(mimeOf?.(h.photoKey!) ? { photoMime: mimeOf(h.photoKey!) } : {}) } : {}),
      ...(h.focus ? { focus: h.focus } : {}),
      ...(h.dayIndex !== undefined ? { dayIndex: h.dayIndex } : {}),
      ...(h.itemId ? { itemId: h.itemId } : {}),
      hidden: h.hidden,
    };
  });
  const days = dayEntries.map(([dayId, d]): SnapshotGuideDay => {
    const photoHash = d.photoKey ? fileHashOf(d.photoKey) : undefined;
    return {
      dayId,
      ...(d.title ? { title: d.title } : {}),
      ...(photoHash ? { photoHash, ...(mimeOf?.(d.photoKey!) ? { photoMime: mimeOf(d.photoKey!) } : {}) } : {}),
      ...(photoHash && d.focus ? { focus: d.focus } : {}),
      ...(d.hidden ? { hidden: true } : {}),
    };
  });
  return {
    ...(g?.intro ? { intro: g.intro } : {}),
    ...(g?.coverFocus ? { coverFocus: g.coverFocus } : {}),
    tips: g?.tips ?? [],
    ...(days.length ? { days } : {}),
    highlights,
  };
}

/** 旅行亮点这一块相对上次版本改了什么（一条一句话） */
export function diffGuide(base: SnapshotGuide | undefined, next: SnapshotGuide | undefined): string[] {
  const a = base ?? { tips: [], highlights: [] };
  const b = next ?? { tips: [], highlights: [] };
  const out: string[] = [];
  if ((a.intro ?? '') !== (b.intro ?? '')) out.push('旅行简介');
  if (stable(a.coverFocus) !== stable(b.coverFocus)) out.push('封面位置');
  if (stable(a.tips) !== stable(b.tips)) out.push('实用贴士');
  if (stable(a.days ?? []) !== stable(b.days ?? [])) out.push('每日精选');
  const am = new Map(a.highlights.map((h) => [h.id, h]));
  const bm = new Map(b.highlights.map((h) => [h.id, h]));
  for (const h of b.highlights) {
    const o = am.get(h.id);
    if (!o) out.push(`新增亮点 · ${h.title}`);
    else if (stable(o) !== stable(h)) out.push(`修改亮点 · ${h.title}`);
  }
  for (const h of a.highlights) if (!bm.has(h.id)) out.push(`删除亮点 · ${h.title}`);
  // 只是换了顺序
  const ids = (x: SnapshotGuide) => x.highlights.map((h) => h.id).filter((id) => am.has(id) && bm.has(id));
  if (!out.some((l) => l.includes('亮点')) && stable(a.highlights.map((h) => h.id)) !== stable(b.highlights.map((h) => h.id)) && ids(a).join() !== ids(b).join()) out.push('亮点顺序');
  return out;
}


// ———————— 差异（主用户「还没发布的改动」、同伴「这个版本改了什么」都用它） ————————

export const ITEM_FIELD_LABEL: Record<string, string> = {
  type: '类型', title: '标题', dayId: '日期', start: '开始时间', end: '结束时间', endDayOffset: '跨日', timeNote: '时间说明',
  place: '地点', toPlace: '终点', bookingRef: '预订编号', bookingStatus: '预订状态', note: '备注', alt: '备选方案', fixed: '固定时间',
  flight: '航班信息', lodging: '住宿信息', transit: '交通信息', meal: '餐别', mustDo: '必逛 / 必吃', navUrl: '导航链接', meta: '其他信息', order: '顺序', budget: '预算',
};
const TRIP_FIELD_LABEL: Record<string, string> = {
  title: '旅程名称', startDate: '出发日期', endDate: '结束日期', homeTz: '出发地时区', destination: '目的地', budget: '预算',
  participants: '人数', departTime: '出发时间', translate: '翻译语言', coverHash: '封面',
};

export interface ItemChange {
  id: string;
  kind: 'added' | 'removed' | 'changed';
  title: string;
  /** 所在的第几天（变更后；删除的用变更前） */
  dayIndex?: number;
  fields: string[];
}

export interface SnapshotDiff {
  trip: string[];
  days: { index: number; fields: string[] }[];
  items: ItemChange[];
  docs: { id: string; kind: 'added' | 'removed' | 'changed'; title: string }[];
  /** 旅行亮点的改动，一条一句话 */
  guide: string[];
  /** 改动总数（给「有 N 处改动」用） */
  count: number;
}

function itemFields(a: Item, b: Item): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (k === 'src' || k === 'key' || k === 'id' || k === 'tripId') continue;
    if (stable((a as unknown as Record<string, unknown>)[k]) !== stable((b as unknown as Record<string, unknown>)[k])) out.push(ITEM_FIELD_LABEL[k] ?? k);
  }
  return out;
}

/**
 * 审查修复 #4（2026-10-21）：哪几天（第几天）的项目顺序被调整过。
 * 只比较两边都在、而且还在同一天的那些项的 id 先后，所以别的项插进来或删掉导致的重新编号不算。
 */
export function reorderedDays(
  base: { days: Day[]; items: Item[] } | undefined,
  next: { days: Day[]; items: Item[] },
): Set<number> {
  const out = new Set<number>();
  if (!base) return out;
  const seqs = (s: { days: Day[]; items: Item[] }) => {
    const idx = new Map(s.days.map((d) => [d.id, d.index]));
    const byDay = new Map<number, Item[]>();
    for (const it of s.items) {
      const i = idx.get(it.dayId);
      if (i === undefined) continue;
      byDay.set(i, [...(byDay.get(i) ?? []), it]);
    }
    const dayOf = new Map<string, number>();
    const seq = new Map<number, string[]>();
    for (const [i, its] of byDay) {
      seq.set(i, [...its].sort((a, b) => a.order - b.order).map((it) => it.id));
      for (const it of its) dayOf.set(it.id, i);
    }
    return { seq, dayOf };
  };
  const a = seqs(base);
  const b = seqs(next);
  for (const [i, ids] of b.seq) {
    const both = (id: string) => a.dayOf.get(id) === i && b.dayOf.get(id) === i;
    const x = (a.seq.get(i) ?? []).filter(both);
    const y = ids.filter(both);
    if (x.join('\n') !== y.join('\n')) out.add(i);
  }
  return out;
}

export function diffSnapshots(base: TripSnapshot | undefined, next: TripSnapshot): SnapshotDiff {
  const trip: string[] = [];
  if (base) {
    for (const k of Object.keys(TRIP_FIELD_LABEL)) {
      const a = (base.trip as Record<string, unknown>)[k];
      const b = (next.trip as Record<string, unknown>)[k];
      if (stable(a) !== stable(b)) trip.push(TRIP_FIELD_LABEL[k]);
    }
  }
  const dayIdx = (s: TripSnapshot) => new Map(s.days.map((d) => [d.id, d.index]));
  const nDay = dayIdx(next);
  const bDay = base ? dayIdx(base) : new Map<string, number>();
  const days: SnapshotDiff['days'] = [];
  const bDays = new Map((base?.days ?? []).map((d) => [d.index, d]));
  for (const d of next.days) {
    const o = bDays.get(d.index);
    if (!base) continue;
    if (!o) days.push({ index: d.index, fields: ['新增这一天'] });
    else {
      const f = DAY_FIELDS.filter((k) => k !== 'index' && (o[k] ?? '') !== (d[k] ?? '')).map((k) => ({ date: '日期', tz: '时区', city: '城市', title: '当天主题', note: '当天备注' })[k as string] ?? k);
      if (f.length) days.push({ index: d.index, fields: f });
    }
  }
  for (const d of base?.days ?? []) if (!next.days.some((x) => x.index === d.index)) days.push({ index: d.index, fields: ['删除这一天'] });
  // 只调整了顺序也是一次改动（主用户才能发布、同伴预览看得到）
  for (const index of reorderedDays(base, next)) {
    const e = days.find((d) => d.index === index);
    if (e) e.fields.push('项目顺序');
    else days.push({ index, fields: ['项目顺序'] });
  }

  const items: ItemChange[] = [];
  const bItems = new Map((base?.items ?? []).map((i) => [i.id, i]));
  const nItems = new Map(next.items.map((i) => [i.id, i]));
  if (base) {
    for (const it of next.items) {
      const o = bItems.get(it.id);
      if (!o) items.push({ id: it.id, kind: 'added', title: it.title, dayIndex: nDay.get(it.dayId), fields: [] });
      else if (!sameItem(o, it)) {
        const fields = itemFields(o, it).filter((f) => f !== '顺序');
        // 只是顺序变了（别的项插进来导致重新编号）不算改动
        if (fields.length) items.push({ id: it.id, kind: 'changed', title: it.title, dayIndex: nDay.get(it.dayId), fields });
      }
    }
    for (const it of base.items) if (!nItems.has(it.id)) items.push({ id: it.id, kind: 'removed', title: it.title, dayIndex: bDay.get(it.dayId), fields: [] });
  }
  const docs: SnapshotDiff['docs'] = [];
  const bDocs = new Map((base?.docs ?? []).map((d) => [d.id, d]));
  if (base) {
    for (const d of next.docs) {
      const o = bDocs.get(d.id);
      if (!o) docs.push({ id: d.id, kind: 'added', title: d.title });
      else if (!sameDoc(o, d)) docs.push({ id: d.id, kind: 'changed', title: d.title });
    }
    for (const d of base.docs) if (!next.docs.some((x) => x.id === d.id)) docs.push({ id: d.id, kind: 'removed', title: d.title });
  }
  items.sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
  const guide = base ? diffGuide(base.guide, next.guide) : [];
  return { trip, days, items, docs, guide, count: trip.length + days.length + items.length + docs.length + guide.length };
}
