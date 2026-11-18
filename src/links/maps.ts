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

const hasCjk = (s?: string): s is string => !!s && /[\u4e00-\u9fff]/.test(s);

/**
 * 从地址里读城市名（不带「市」）。认两种写法：
 * - 完整地址：「广西壮族自治区南宁市西乡塘区…」「北京市朝阳区…」→ 南宁 / 北京
 * - 简写：「南宁 · 中国」「南宁，中国」→ 南宁
 * 读不到返回 undefined。
 */
export function cityOfAddress(addr: string | undefined): string | undefined {
  const rest = (addr ?? '').trim().replace(/^.{2,9}?(省|自治区|特别行政区)/, '');
  return rest.match(/^([^市区县\s,，]{2,5})市/)?.[1] ?? rest.match(/^([^\s·,，、0-9]{2,5})\s*[·,，、]/)?.[1];
}

/** 高德里的店名一律是半角括号：把全角括号换掉，搜出来才是同一条 */
export const amapText = (t: string) => t.replace(/（/g, '(').replace(/）/g, ')').trim();

/**
 * 高德专用搜索词：用「城市 + 准确店名」。
 * 名字里有中文的取最长的那个（带分店名的最准，当地短名「甘家界柠檬鸭」会搜出全国所有分店）；
 * 城市从地址里读，店名里已经有就不重复；店名没有中文就退回原来的搜索词。
 */
export function amapPlaceQuery(p: Place): string {
  const shop = [p.name, p.localName].map((x) => x?.trim()).filter(hasCjk).sort((a, b) => b.length - a.length)[0];
  if (!shop) return placeQuery(p);
  const name = amapText(shop);
  const city = cityOfAddress(p.localAddress) ?? cityOfAddress(p.address);
  return city && !name.includes(city) ? `${city} ${name}` : name;
}

/** 按地图 App 选搜索词：高德用 amapPlaceQuery，其他沿用当地语言优先的 placeQuery */
export function placeQueryFor(app: NavApp, p: Place): string {
  return app === 'amap' ? amapPlaceQuery(p) : placeQuery(p);
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
    return directionsUrl(app, placeQueryFor(app, item.toPlace), item.place ? placeQueryFor(app, item.place) : undefined, 'transit');
  }
  const p = item.place ?? (item.type === 'spot' || item.type === 'lodging' ? { name: item.title } : undefined);
  if (p) return searchUrl(app, placeQueryFor(app, p));
  return item.navUrl;
}

/** 地点卡上的「在地图中打开」 */
export function placeLink(p: Place, tz: string, settings?: Settings): string {
  const app = appFor(tz, settings);
  return searchUrl(app, placeQueryFor(app, p));
}

export type MobileOs = 'android' | 'ios' | 'other';

export function mobileOs(ua: string, touchPoints = 0): MobileOs {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'ios';
  return 'other';
}

const AMAP_SRC = 'tongxing8';

/**
 * 把高德网页链接（uri.amap.com 的 search / marker）换成直接打开高德 App 的链接。
 * - Android：intent:// 链接，装了高德直接开 App；没装由浏览器自动打开网页版（browser_fallback_url）。
 * - iOS：iosamap:// 链接；没装的情况由调用方在超时后改开网页版。
 * - 其他（电脑）或不是高德链接：返回 undefined，照常开网页。
 */
export function amapAppUrl(webUrl: string, os: MobileOs): string | undefined {
  if (os === 'other') return undefined;
  let u: URL;
  try {
    u = new URL(webUrl);
  } catch {
    return undefined;
  }
  if (!u.hostname.endsWith('amap.com')) return undefined;
  const enc = encodeURIComponent;
  let path: string;
  if (u.pathname.startsWith('/search')) {
    const kw = u.searchParams.get('keyword') ?? '';
    if (!kw) return undefined;
    path = os === 'android'
      ? `poi?sourceApplication=${AMAP_SRC}&keywords=${enc(kw)}&dev=0`
      : `poi?sourceApplication=${AMAP_SRC}&name=${enc(kw)}`;
  } else if (u.pathname.startsWith('/marker')) {
    const [lon, lat] = (u.searchParams.get('position') ?? '').split(',');
    if (!lon || !lat) return undefined;
    const name = u.searchParams.get('name') ?? '';
    const dev = u.searchParams.get('coordinate') === 'wgs84' ? 1 : 0;
    path = `viewMap?sourceApplication=${AMAP_SRC}&poiname=${enc(name)}&lat=${lat}&lon=${lon}&dev=${dev}`;
  } else {
    return undefined;
  }
  if (os === 'ios') return `iosamap://${path}`;
  return `intent://${path}#Intent;scheme=androidamap;package=com.autonavi.minimap;S.browser_fallback_url=${enc(webUrl)};end`;
}
