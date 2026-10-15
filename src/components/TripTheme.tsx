// 修订 2026-10 · ISSUE-005：打开某份旅程时套用它自己的外观主题。
// 2026-10-15：主题只有春夏秋冬；夏季就是原来的暖色（没有 data-theme）。
// 不在某份旅程里的页面（旅程列表、导入、照片来源、证明查看等）跟随「最近打开的那份旅程」的主题。
// 只改 <html data-theme> 和浏览器顶栏颜色，不碰任何数据。
import { useEffect } from 'react';
import type { TripTheme } from '../domain/types';
import { seasonOf, type Season } from '../domain/theme';

const BAR: Record<Season, string> = { spring: '#F6F8F2', summer: '#F5EEDF', autumn: '#F6F1EC', winter: '#F5F9FD' };

function apply(season: Season) {
  const root = document.documentElement;
  if (season === 'summer') delete root.dataset.theme;
  else root.dataset.theme = season;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[season]);
}

let active = 0;
/** 没有旅程页挂载时用的主题：最近打开的那份旅程 */
let base: Season = 'summer';

/** 挂在应用最外层：公共页面跟随最近打开的旅程 */
export function AppThemeBase({ theme }: { theme?: TripTheme }) {
  useEffect(() => {
    base = seasonOf(theme);
    if (active === 0) apply(base);
  }, [theme]);
  return null;
}

export function TripThemeScope({ theme }: { theme?: TripTheme }) {
  useEffect(() => {
    active++;
    apply(seasonOf(theme));
    return () => {
      active--;
      // 在两个同主题的旅程页之间切换时不闪：等下一页挂载后再判断
      setTimeout(() => {
        if (active === 0) apply(base);
      }, 0);
    };
  }, [theme]);
  return null;
}

export const THEME_LABEL: Record<Season, string> = {
  spring: 'Spring 春季',
  summer: 'Summer 夏季',
  autumn: 'Autumn 秋季',
  winter: 'Winter 冬季',
};
