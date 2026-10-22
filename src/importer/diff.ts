import type { Item, ItemType } from '../domain/types';
import { ITEM_FIELD_LABEL, stable } from '../cloud/snapshot';

/**
 * 审查修复 #6（2026-10-21）：重新导入时整项覆盖写入的「内容」= 行程项去掉 id、所属旅程 / 天、顺序、原文行号。
 * 预览比较和确认导入都以它为准（单一来源），以后行程项加了新字段，预览自动会比较，不会再漏报。
 */
const NOT_CONTENT = ['id', 'tripId', 'dayId', 'order', 'src'] as const;
export type ImportContent = Omit<Item, (typeof NOT_CONTENT)[number]>;
export function importContent<T extends Partial<Item>>(it: T): Omit<T, (typeof NOT_CONTENT)[number]> {
  const out = { ...it } as Record<string, unknown>;
  for (const k of NOT_CONTENT) delete out[k];
  return out as Omit<T, (typeof NOT_CONTENT)[number]>;
}

/** 重新导入差异：纯函数，不碰数据库。 */
export interface DiffOldItem extends ImportContent {
  date: string;
  placeName?: string;
  /** 这一项是否带有用户数据（完成状态或已关联证明） */
  hasUserData: boolean;
}
export interface DiffNewItem extends ImportContent {
  date: string;
  placeName?: string;
}

export interface Rename {
  oldKey: string;
  newKey: string;
  oldTitle: string;
  newTitle: string;
  reason: 'same-start' | 'similar-title';
}
export interface Changed {
  key: string;
  title: string;
  fields: string[];
}
export interface ImportDiff {
  added: DiffNewItem[];
  removed: DiffOldItem[];
  changed: Changed[];
  renamed: Rename[];
  unchanged: number;
  /** 被删除但带有状态或证明的项 */
  removedWithData: DiffOldItem[];
}

/** 预览里的字段名：原来就有的几项保持原文案，其余沿用同步改动里的叫法 */
const FIELD_LABEL: Record<string, string> = {
  ...ITEM_FIELD_LABEL,
  title: '标题',
  start: '开始时间',
  end: '结束时间',
  place: '地点',
  navUrl: '导航',
  bookingRef: '订单',
  note: '备注',
};
/** 显示顺序：原来的几项在前，其余按同步改动的顺序，认不出的字段放最后 */
const FIELD_ORDER = [...new Set(['title', 'start', 'end', 'place', 'navUrl', 'bookingRef', 'note', ...Object.keys(ITEM_FIELD_LABEL)])];
/** 不是内容、或者不在这里比较的：key 和日期决定是不是同一项；placeName 只是 place.name 的简写 */
const SKIP = new Set<string>(['key', 'date', 'placeName', 'hasUserData', ...NOT_CONTENT]);
/** 空字符串、空数组、空对象和没写一样 */
const norm = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v) && !v.length) return '';
  if (typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some((x) => norm(x) !== '')) return '';
  return stable(v);
};

function bigrams(s: string): string[] {
  const t = s.toLowerCase().replace(/[\s\p{P}]+/gu, '');
  if (t.length < 2) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Dice 系数，0~1 */
export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const m = new Map<string, number>();
  for (const g of x) m.set(g, (m.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of y) {
    const c = m.get(g) ?? 0;
    if (c > 0) {
      hit++;
      m.set(g, c - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

export const SIMILAR_THRESHOLD = 0.6;

function diffFields(a: DiffOldItem, b: DiffNewItem): string[] {
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].filter((k) => !SKIP.has(k));
  const rank = (k: string) => (FIELD_ORDER.includes(k) ? FIELD_ORDER.indexOf(k) : FIELD_ORDER.length);
  keys.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
  const out: string[] = [];
  for (const k of keys) {
    // 预算：新导入没写就沿用原来的（saveImport 会保留），不算改动
    if (k === 'budget' && rb[k] === undefined) continue;
    if (norm(ra[k]) === norm(rb[k])) continue;
    const label = FIELD_LABEL[k] ?? k;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

export function diffImport(oldItems: DiffOldItem[], newItems: DiffNewItem[]): ImportDiff {
  const newByKey = new Map(newItems.map((i) => [i.key, i]));
  const oldByKey = new Map(oldItems.map((i) => [i.key, i]));

  const changed: Changed[] = [];
  let unchanged = 0;
  const oldLeft: DiffOldItem[] = [];
  for (const o of oldItems) {
    const n = newByKey.get(o.key);
    if (!n) {
      oldLeft.push(o);
      continue;
    }
    const fields = diffFields(o, n);
    if (fields.length) changed.push({ key: o.key, title: n.title, fields });
    else unchanged++;
  }
  const newLeft = newItems.filter((n) => !oldByKey.has(n.key));

  // 疑似改名：同一天、同 type，开始时间相同或标题高度相似，且双方都只有唯一候选
  type Cand = { n: DiffNewItem; reason: Rename['reason'] };
  const cands = new Map<string, Cand[]>();
  for (const o of oldLeft) {
    const list: Cand[] = [];
    for (const n of newLeft) {
      if (n.date !== o.date || n.type !== (o.type as ItemType)) continue;
      if (o.start && n.start && o.start === n.start) list.push({ n, reason: 'same-start' });
      else if (similarity(o.title, n.title) >= SIMILAR_THRESHOLD) list.push({ n, reason: 'similar-title' });
    }
    cands.set(o.key, list);
  }
  const claims = new Map<string, number>();
  for (const list of cands.values()) for (const c of list) claims.set(c.n.key, (claims.get(c.n.key) ?? 0) + 1);

  const renamed: Rename[] = [];
  const usedOld = new Set<string>();
  const usedNew = new Set<string>();
  for (const o of oldLeft) {
    const list = cands.get(o.key) ?? [];
    if (list.length !== 1) continue;
    const { n, reason } = list[0];
    if (claims.get(n.key) !== 1) continue;
    renamed.push({ oldKey: o.key, newKey: n.key, oldTitle: o.title, newTitle: n.title, reason });
    usedOld.add(o.key);
    usedNew.add(n.key);
    const fields = diffFields(o, n);
    if (fields.length) changed.push({ key: n.key, title: n.title, fields });
  }

  const removed = oldLeft.filter((o) => !usedOld.has(o.key));
  const added = newLeft.filter((n) => !usedNew.has(n.key));
  return { added, removed, changed, renamed, unchanged, removedWithData: removed.filter((o) => o.hasUserData) };
}

/** 把解析结果摊平成 diff 的输入 */
export function flattenParsed(days: { date: string; items: Omit<Item, 'id' | 'tripId' | 'dayId'>[] }[]): DiffNewItem[] {
  return days.flatMap((d) => d.items.map((i) => ({ ...importContent(i), placeName: i.place?.name, date: d.date })));
}
