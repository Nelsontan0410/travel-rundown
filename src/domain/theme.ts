// 2026-10-15：主题只有春夏秋冬四季。旧资料里的 classic（暖色复古拟物化）就是夏季，不需要迁移数据。
import type { TripTheme } from './types';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** 旅程保存的主题 → 四季之一；没设置或旧的 classic 都算夏季 */
export function seasonOf(theme: TripTheme | undefined): Season {
  return theme === 'spring' || theme === 'autumn' || theme === 'winter' ? theme : 'summer';
}
