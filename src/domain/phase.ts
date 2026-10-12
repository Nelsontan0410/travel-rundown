import type { Day } from './types';
import { nowIn } from './format';

export type TripPhase = { kind: 'before'; daysToGo: number } | { kind: 'during' } | { kind: 'after' };

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * 旅行阶段：只用日期判断。
 * 「出发前」按第 1 天当地的今天，「已结束」按最后一天当地的今天；
 * 不单凭时钟推断已抵达或已完成，状态只看用户手动标记。
 */
export function tripPhase(days: Pick<Day, 'date' | 'tz' | 'index'>[], at: Date = new Date()): TripPhase {
  if (!days.length) return { kind: 'during' };
  const sorted = [...days].sort((a, b) => a.index - b.index);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const today1 = nowIn(first.tz, at).date;
  if (today1 < first.date) return { kind: 'before', daysToGo: diffDays(today1, first.date) };
  const today2 = nowIn(last.tz, at).date;
  if (today2 > last.date) return { kind: 'after' };
  return { kind: 'during' };
}
