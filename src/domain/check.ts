import type { BookingStatus, ItemType, Place } from './types';

/** 准备检查：纯函数规则，只提醒，不阻止导入。 */
export interface CheckItem {
  key: string;
  id?: string; // 已保存的行程项才有，用于跳转
  type: ItemType;
  title: string;
  date: string;
  dayIndex: number;
  start?: string;
  fixed?: boolean;
  place?: Place;
  navUrl?: string;
  bookingStatus?: BookingStatus;
  /** 已关联的证明数量；undefined 表示还没有保存（导入预览），此时不检查证明 */
  docCount?: number;
}

export type RuleId =
  | 'missing-proof'
  | 'missing-time'
  | 'missing-local-address'
  | 'missing-nav'
  | 'time-order'
  | 'pending-booking';

export interface Issue {
  rule: RuleId;
  itemKey: string;
  itemId?: string;
  dayIndex: number;
  title: string;
  message: string;
}

const TIME_REQUIRED: ItemType[] = ['flight', 'lodging'];

export function checkTrip(items: CheckItem[]): Issue[] {
  const out: Issue[] = [];
  const push = (it: CheckItem, rule: RuleId, message: string) =>
    out.push({ rule, itemKey: it.key, itemId: it.id, dayIndex: it.dayIndex, title: it.title, message });

  const lastStart = new Map<number, { time: string; title: string }>();
  for (const it of items) {
    const needProof = it.type === 'flight' || it.type === 'lodging';
    if (needProof && it.docCount !== undefined && it.docCount === 0) push(it, 'missing-proof', '还没有关联预订证明');
    if ((TIME_REQUIRED.includes(it.type) || it.fixed) && !it.start) push(it, 'missing-time', '缺少开始时间');
    if (it.type === 'lodging' && !it.place?.localAddress) push(it, 'missing-local-address', '缺少当地语言地址（给司机看）');
    if (it.type !== 'note' && !it.navUrl) push(it, 'missing-nav', '没有导航链接');
    if (it.bookingStatus === 'pending') push(it, 'pending-booking', '预订状态待确认');
    if (it.start) {
      const prev = lastStart.get(it.dayIndex);
      if (prev && it.start < prev.time) push(it, 'time-order', `开始时间早于上一项「${prev.title}」`);
      lastStart.set(it.dayIndex, { time: it.start, title: it.title });
    }
  }
  return out;
}

export const RULE_LABEL: Record<RuleId, string> = {
  'missing-proof': '缺少预订证明',
  'missing-time': '缺少开始时间',
  'missing-local-address': '缺少当地语言地址',
  'missing-nav': '缺少导航链接',
  'time-order': '开始时间顺序不对',
  'pending-booking': '预订待确认',
};
