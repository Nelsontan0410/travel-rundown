// 修订 2026-10 · ISSUE-003：每日行程打卡。
// 未完成的按原始顺序（Item.order）排在前面；完成的移到当天底部，也按原始顺序。
// 排序只依据 order 字段和完成状态，不依据界面上的当前顺序，所以取消完成后会回到原位。
import type { Item, ItemStatus } from './types';

export function checklistOrder<T extends Pick<Item, 'key' | 'order'>>(items: T[], statusOf: (key: string) => ItemStatus): { open: T[]; done: T[] } {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  return {
    open: sorted.filter((i) => statusOf(i.key) !== 'done'),
    done: sorted.filter((i) => statusOf(i.key) === 'done'),
  };
}
