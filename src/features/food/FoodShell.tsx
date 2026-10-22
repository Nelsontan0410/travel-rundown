// 美食专区的外壳：电脑（≥1024）保留全站侧栏；手机和平板不显示底栏，页面占满全屏。
import type { ReactNode } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { TabBar } from '../../components/Layout';
import { useBreakpoint } from '../../hooks/layout';

export function FoodShell({ children }: { children: ReactNode }) {
  const bp = useBreakpoint();
  return (
    <>
      {children}
      {bp === 'desktop' && <TabBar active="food" />}
    </>
  );
}

/** 离开美食专区：有上一页就回上一页，否则回首页 */
export function leaveFood(nav: NavigateFunction): void {
  if (window.history.state && window.history.state.idx > 0) nav(-1);
  else nav('/');
}
