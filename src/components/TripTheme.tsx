// 修订 2026-10 · ISSUE-005：打开某份旅程时套用它自己的外观主题；离开时回到 Classic。
// 只改 <html data-theme> 和浏览器顶栏颜色，不碰任何数据。
import { useEffect } from 'react';
import type { TripTheme } from '../domain/types';

const BAR: Record<TripTheme, string> = { classic: '#F5EEDF', spring: '#F6F8F2', summer: '#F7F6F0', autumn: '#F6F1EC', winter: '#F5F9FD' };

function apply(theme: TripTheme) {
  const root = document.documentElement;
  if (theme === 'classic') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
}

let active = 0;

export function TripThemeScope({ theme }: { theme?: TripTheme }) {
  useEffect(() => {
    active++;
    apply(theme ?? 'classic');
    return () => {
      active--;
      // 在两个同主题的旅程页之间切换时不闪回 Classic：等下一页挂载后再判断
      setTimeout(() => {
        if (active === 0) apply('classic');
      }, 0);
    };
  }, [theme]);
  return null;
}

export const THEME_LABEL: Record<TripTheme, string> = {
  classic: 'Classic 暖色',
  spring: 'Spring 春季',
  summer: 'Summer 夏季',
  autumn: 'Autumn 秋季',
  winter: 'Winter 冬季',
};
