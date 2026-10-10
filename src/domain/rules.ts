// 展示规则（设计参考「页面规格」「状态与文案」）。全部是纯函数，便于测试。
import type { BookingStatus, Day, Doc, Item, ItemStatus } from './types';
import { fmtMonthDay, nowIn, RANGE, SEP } from './format';

export type RightSlot =
  | { kind: 'chip'; variant: 'success' | 'neutral' | 'info'; label: string }
  | { kind: 'nav' };

export function hasBooking(item: Item, docCount: number): boolean {
  return !!item.bookingRef || docCount > 0;
}

/** 01 右侧槽：从上到下命中一条就停 */
export function rightSlot(item: Item, status: ItemStatus, docCount: number): RightSlot {
  if (status === 'done') return { kind: 'chip', variant: 'success', label: '已完成' };
  if (status === 'skipped') return { kind: 'chip', variant: 'neutral', label: '已跳过' };
  if (hasBooking(item, docCount)) return { kind: 'chip', variant: 'info', label: '已预订' };
  if (item.navUrl) return { kind: 'nav' };
  return { kind: 'chip', variant: 'neutral', label: '待完成' };
}

/** 02 元信息行的状态芯片 */
export function statusChip(status: ItemStatus): { variant: 'success' | 'neutral'; label: string } {
  if (status === 'done') return { variant: 'success', label: '已完成' };
  if (status === 'skipped') return { variant: 'neutral', label: '已跳过' };
  return { variant: 'neutral', label: '待完成' };
}

/** 预订状态：md 写了就用它；没写时，有证明算已确认，没有证明算状态待确认 */
export function bookingStatusOf(item: Item, docCount: number): BookingStatus {
  if (item.bookingStatus) return item.bookingStatus;
  return docCount > 0 ? 'confirmed' : 'pending';
}

export function bookingChip(s: BookingStatus): { variant: 'info' | 'neutral'; label: string } {
  return s === 'confirmed' ? { variant: 'info', label: '已确认' } : { variant: 'neutral', label: '状态待确认' };
}

/** 选中的那一天是不是「今天」（按 Day.tz 算当地日期） */
export function isToday(day: Day, at: Date = new Date()): boolean {
  return nowIn(day.tz, at).date === day.date;
}

/** 默认选中：今天；今天不在行程期内就选第 1 天 */
export function defaultDay(days: Day[], at: Date = new Date()): Day | undefined {
  return days.find((d) => isToday(d, at)) ?? days[0];
}

/**
 * 当前项：只在选中「今天」时才有。开始时间不晚于现在的最后一项；
 * 现在还没到第一项时，当前项是第一个待完成项。
 */
export function currentItemId(
  day: Day,
  items: Item[],
  statusOf: (key: string) => ItemStatus,
  at: Date = new Date(),
): string | undefined {
  if (!isToday(day, at)) return undefined;
  const t = nowIn(day.tz, at).time;
  let cur: Item | undefined;
  for (const it of items) if (it.start && it.start <= t) cur = it;
  if (cur) return cur.id;
  return items.find((it) => statusOf(it.key) === 'todo')?.id;
}

/** 01 ItemCard 副标题 */
export function itemSubtitle(item: Item): string {
  if (item.type === 'transit' && item.toPlace?.name) return `交通${SEP}${item.toPlace.name}`;
  if (item.place?.localName) return item.place.localName;
  if (item.note) return `备注: ${item.note}`;
  return '';
}

export type IconName =
  | 'Plane'
  | 'Building2'
  | 'Car'
  | 'TrainFront'
  | 'Utensils'
  | 'MapPin'
  | 'StickyNote'
  | 'Ticket';

const RAIL_WORDS = ['地铁', '电车', 'JR', '铁路'];
const FOOD_WORDS = ['餐', '饭', '食', '咖啡', '酒吧', '居酒屋'];

/** 01 类型图标 */
export function itemIcon(item: Item): IconName {
  switch (item.type) {
    case 'flight':
      return 'Plane';
    case 'lodging':
      return 'Building2';
    case 'transit': {
      const line = item.meta?.['线路'] ?? '';
      return RAIL_WORDS.some((w) => line.includes(w)) ? 'TrainFront' : 'Car';
    }
    case 'spot':
      return FOOD_WORDS.some((w) => item.title.includes(w)) ? 'Utensils' : 'MapPin';
    default:
      return 'StickyNote';
  }
}

/** 03 / 02 BookingCard 的图标 */
export function bookingIcon(item: Item): IconName {
  if (item.type === 'flight') return 'Plane';
  if (item.type === 'lodging') return 'Building2';
  if (item.type === 'spot') return 'Ticket';
  return itemIcon(item);
}

export function bookingTitle(item: Item): string {
  const room = item.meta?.['房型'];
  return room ? `${item.title}${SEP}${room}` : item.title;
}

/** BookingCard 副标题 */
export function bookingSubtitle(item: Item, day: Day): string {
  const d = fmtMonthDay(day.date);
  if (item.type === 'flight') {
    if (item.end) return `${d}${SEP}${item.end} 到达`;
    return item.start ? `${d}${SEP}${item.start} 出发` : `${d}${SEP}出发`;
  }
  if (item.type === 'lodging') {
    const out = item.meta?.['退房日期'];
    return out && /^\d{4}-\d{2}-\d{2}$/.test(out) ? `${d}${RANGE}${fmtMonthDay(out)}` : d;
  }
  return `${d}${SEP}${item.start ?? '时间待定'}`;
}

/** 03 列表里出现哪些行程项：flight、lodging 全部；spot 只要有订单号或证明 */
export function inBookingList(item: Item, docCount: number): boolean {
  if (item.type === 'flight' || item.type === 'lodging') return true;
  if (item.type === 'spot') return hasBooking(item, docCount);
  return false;
}

export function docsForItem(docs: Doc[], key: string): Doc[] {
  return docs.filter((d) => d.itemKeys.includes(key));
}

/** 复制地点：localName + localAddress；没有就用 name + address */
export function placeCopyText(p: { name: string; localName?: string; address?: string; localAddress?: string }): string {
  if (p.localName || p.localAddress) return [p.localName, p.localAddress].filter(Boolean).join(' ');
  return [p.name, p.address].filter(Boolean).join(' ');
}

export const TYPE_LABEL: Record<Item['type'], string> = {
  flight: '航班',
  lodging: '住宿',
  spot: '景点',
  transit: '交通',
  note: '备注',
};
