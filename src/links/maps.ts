// v2：导航链接由 App 生成（地点名 + 当地语言名 + 地址），AI 写的链接只作备选。
import type { Item, NavApp, Place, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';

const CHINA_TZ = ['Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Harbin'];

export function isChinaTz(tz: string): boolean {
  return CHINA_TZ.includes(tz);
}

/** 搜索用文字：优先当地语言（给当地地图更准），没有就用显示名 + 地址 */
export function placeQuery(p: Place): string {
  const local = [p.localName, p.localAddress].filter(Boolean).join(' ');
  if (local) return local;
  return [p.name, p.address].filter(Boolean).join(' ');
}

export function searchUrl(app: NavApp, query: string): string {
  const q = encodeURIComponent(query);
  if (app === 'amap') return `https://uri.amap.com/search?keyword=${q}&callnative=1`;
  if (app === 'apple-maps') return `https://maps.apple.com/?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function directionsUrl(app: NavApp, to: string, from?: string, mode?: 'transit'): string {
  const d = encodeURIComponent(to);
  if (app === 'amap') return `https://uri.amap.com/search?keyword=${d}&callnative=1`;
  if (app === 'apple-maps') return `https://maps.apple.com/?daddr=${d}${from ? `&saddr=${encodeURIComponent(from)}` : ''}${mode ? '&dirflg=r' : ''}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${d}${from ? `&origin=${encodeURIComponent(from)}` : ''}${mode ? `&travelmode=${mode}` : ''}`;
}

export function appFor(tz: string, settings: Settings | undefined): NavApp {
  const s = settings ?? DEFAULT_SETTINGS;
  return isChinaTz(tz) ? s.navInChina : s.navElsewhere;
}

/**
 * 行程项的导航链接：
 * - 交通：导航到终点（有起点就带上，公共交通模式）
 * - 航班：导航到出发机场
 * - 景点、住宿：搜索地点；没有地点就按标题搜索；餐饮没写地点就不导航
 * - note 不导航；只有 AI 链接时才用 AI 链接
 */
export function navLink(item: Pick<Item, 'type' | 'title' | 'place' | 'toPlace' | 'navUrl'>, tz: string, settings?: Settings): string | undefined {
  const app = appFor(tz, settings);
  if (item.type === 'note') return item.navUrl;
  if (item.type === 'transit' && item.toPlace) {
    return directionsUrl(app, placeQuery(item.toPlace), item.place ? placeQuery(item.place) : undefined, 'transit');
  }
  const p = item.place ?? (item.type === 'spot' || item.type === 'lodging' ? { name: item.title } : undefined);
  if (p) return searchUrl(app, placeQuery(p));
  return item.navUrl;
}

/** 地点卡上的「在地图中打开」 */
export function placeLink(p: Place, tz: string, settings?: Settings): string {
  return searchUrl(appFor(tz, settings), placeQuery(p));
}
