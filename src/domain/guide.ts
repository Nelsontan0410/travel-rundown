// 旅行亮点（旅行指南）的数据与纯函数。展示资料和 Rundown 原始行程分开存放：
// 这里的内容只引用行程项的 id，从不改写、删除行程项。
import type { Day, Item } from './types';

export type HighlightCategory = 'spot' | 'food' | 'culture' | 'experience' | 'shopping' | 'lodging' | 'other';
export const CATEGORY_LABEL: Record<HighlightCategory, string> = {
  spot: '景点',
  food: '美食',
  culture: '文化',
  experience: '体验',
  shopping: '购物',
  lodging: '住宿',
  other: '其他',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as HighlightCategory[];
/** 阅读时每个类别的小标题（中文 + 手帐式英文副标） */
export const CATEGORY_TITLE: Record<HighlightCategory, [string, string]> = {
  spot: ['必去景点', 'Must visit'],
  food: ['必吃美食', 'Foodie list'],
  culture: ['文化', 'Culture'],
  experience: ['特别体验', 'Experiences'],
  shopping: ['购物与手信', 'Shopping'],
  lodging: ['住宿', 'Stay'],
  other: ['其他亮点', 'More'],
};

export type TipCategory = 'food' | 'shopping' | 'photo' | 'note' | 'other';
export const TIP_LABEL: Record<TipCategory, string> = { food: '必吃清单', shopping: '购物 / 手信', photo: '拍照建议', note: '个人备注', other: '其他贴士' };
export const TIP_CATEGORIES = Object.keys(TIP_LABEL) as TipCategory[];

/** 照片的显示位置：x、y 是焦点（0–1），zoom ≥ 1。不改动原图，只记录怎么摆 */
export interface Focus {
  x: number;
  y: number;
  zoom: number;
}
export const DEFAULT_FOCUS: Focus = { x: 0.5, y: 0.5, zoom: 1 };

export interface GuideTip {
  id: string;
  category: TipCategory;
  text: string;
}

/** 每日精选里某一天的展示设置（按 Day 的稳定 id 存；只影响旅行亮点，不改行程里的这一天） */
export interface GuideDay {
  /** 用户写的当天主题；空着就用行程里的主题或城市 */
  title?: string;
  /** 当天代表照片：自己上传的 gday:<dayId>，同步来的 cloud:<hash> */
  photoKey?: string;
  focus?: Focus;
  /** 不在每日精选里显示这一天（行程不受影响） */
  hidden?: boolean;
}

/** 每个旅程一份。封面照片沿用旅程自己的封面（Trip.coverBlobKey），这里只记封面怎么摆 */
export interface Guide {
  tripId: string;
  intro?: string;
  coverFocus?: Focus;
  tips: GuideTip[];
  /** 2026-10-20 阶段 3：每天的展示设置，键是 Day.id */
  days?: Record<string, GuideDay>;
  updatedAt: string;
}

export interface Highlight {
  id: string;
  tripId: string;
  category: HighlightCategory;
  title: string;
  desc?: string;
  /** 本机照片键（blobs 表）：自己上传的 hl:<id>，同步来的 cloud:<hash> */
  photoKey?: string;
  focus?: Focus;
  dayIndex?: number;
  /** 关联的 Rundown 行程项 id（可空）。只读引用，行程项改名、删除都不影响这条亮点 */
  itemId?: string;
  order: number;
  hidden: boolean;
  updatedAt: string;
}

export const LIMITS = { title: 40, desc: 140, intro: 120, tip: 120, tips: 30, dayTitle: 24 } as const;

export const clamp = (s: string, n: number) => Array.from(s).slice(0, n).join('');
export const clean = (s: string | undefined, n: number): string | undefined => {
  const t = clamp((s ?? '').trim(), n);
  return t || undefined;
};

export function clampFocus(f: Focus): Focus {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  return { x: c(f.x, 0, 1), y: c(f.y, 0, 1), zoom: c(f.zoom, 1, 3) };
}

/** CSS：把焦点和缩放变成 object-position / transform（照片放在 overflow:hidden 的容器里） */
export function focusStyle(f: Focus | undefined): { objectPosition: string; transform?: string; transformOrigin: string } {
  const { x, y, zoom } = clampFocus(f ?? DEFAULT_FOCUS);
  const pos = `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`;
  return { objectPosition: pos, transformOrigin: pos, ...(zoom > 1 ? { transform: `scale(${zoom})` } : {}) };
}

/** 行程项类型 → 亮点类别 */
export function categoryOfItem(it: Item): HighlightCategory {
  if (it.type === 'meal') return 'food';
  if (it.type === 'lodging') return 'lodging';
  if (it.type === 'spot') return 'spot';
  return 'other';
}

export interface Candidate {
  itemId: string;
  title: string;
  category: HighlightCategory;
  dayIndex: number;
  dayDate: string;
  place?: string;
  /** 已经被某条亮点关联 */
  used: boolean;
}

/** 可以拿来做亮点的 Rundown 项：景点、餐厅、住宿、其他有地点的项；航班和交通不列 */
export function candidatesFrom(days: Day[], items: Item[], highlights: Highlight[], query = ''): Candidate[] {
  const dayById = new Map(days.map((d) => [d.id, d]));
  const used = new Set(highlights.map((h) => h.itemId).filter(Boolean));
  const q = query.trim().toLowerCase();
  const out: Candidate[] = [];
  for (const it of items) {
    if (it.type === 'flight' || it.type === 'transit') continue;
    if (it.type === 'note' && !it.place) continue;
    const day = dayById.get(it.dayId);
    if (!day) continue;
    const c: Candidate = {
      itemId: it.id,
      title: it.title,
      category: categoryOfItem(it),
      dayIndex: day.index,
      dayDate: day.date,
      place: it.place?.name,
      used: used.has(it.id),
    };
    if (q && !`${c.title} ${c.place ?? ''}`.toLowerCase().includes(q)) continue;
    out.push(c);
  }
  out.sort((a, b) => a.dayIndex - b.dayIndex);
  return out;
}

/** 这条亮点关联的行程项现在还在不在 */
export function linkState(h: Highlight, items: Item[]): 'none' | 'ok' | 'missing' {
  if (!h.itemId) return 'none';
  return items.some((i) => i.id === h.itemId) ? 'ok' : 'missing';
}

/** 排序：显示顺序；只读阅读时隐藏的不出现 */
export const sortHighlights = (hs: Highlight[]) => [...hs].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export const visibleHighlights = (hs: Highlight[]) => sortHighlights(hs).filter((h) => !h.hidden);

/** 把 id 这一条在整份顺序里上移 / 下移一格（跳过隐藏项也按整份顺序算，所以拖动和按钮结果一致）。返回新的 id 顺序 */
export function moveId(order: string[], id: string, dir: -1 | 1): string[] {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
/** 拖动：把 id 放到 target 的位置 */
export function moveTo(order: string[], id: string, target: number): string[] {
  const i = order.indexOf(id);
  if (i < 0) return order;
  const next = order.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(next.length, target)), 0, id);
  return next;
}

export interface DayPick {
  day: Day;
  /** 显示用的主题：用户写的 → 行程里的当天主题 → 城市 */
  title: string;
  /** 用户自己写过主题 */
  custom: boolean;
  /** 当天代表照片：用户为这一天选的 → 当天第一个有照片的亮点 */
  photoKey?: string;
  focus?: Focus;
  hidden: boolean;
  /** 当天的两至三个主要亮点：先用户精选的，不够再补当天的景点和餐厅（只用行程里真有的名字） */
  picks: { id: string; title: string; photoKey?: string; focus?: Focus; fromHighlight: boolean }[];
}

/** 每日精选：只读已有数据，不编文字 */
export function dayPicks(days: Day[], items: Item[], highlights: Highlight[], guideDays: Record<string, GuideDay> = {}): DayPick[] {
  const vis = visibleHighlights(highlights);
  const dayOfItem = new Map(items.map((i) => [i.id, i.dayId]));
  return days.map((day) => {
    const mine = vis.filter((h) => (h.itemId && dayOfItem.get(h.itemId) === day.id) || (h.dayIndex === day.index && !(h.itemId && dayOfItem.has(h.itemId))));
    const uniq = [...new Map(mine.map((h) => [h.id, h])).values()];
    const picks: DayPick['picks'] = uniq.slice(0, 3).map((h) => ({ id: h.id, title: h.title, photoKey: h.photoKey, focus: h.focus, fromHighlight: true }));
    if (picks.length < 2) {
      const linked = new Set(uniq.map((h) => h.itemId));
      for (const it of items) {
        if (picks.length >= 3) break;
        if (it.dayId !== day.id || linked.has(it.id) || (it.type !== 'spot' && it.type !== 'meal')) continue;
        picks.push({ id: it.id, title: it.title, fromHighlight: false });
      }
    }
    const gd = guideDays[day.id] ?? {};
    const firstPhoto = uniq.find((h) => h.photoKey);
    return {
      day,
      title: gd.title || day.title || day.city,
      custom: !!gd.title,
      photoKey: gd.photoKey ?? firstPhoto?.photoKey,
      focus: gd.photoKey ? gd.focus : firstPhoto?.focus,
      hidden: !!gd.hidden,
      picks,
    };
  });
}
