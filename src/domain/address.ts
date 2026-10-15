// 2026-10 第一批 ③：给司机 / 店员看的当地语言地址卡。纯函数，只用行程里已有的地点资料，不翻译、不编造地址。
import type { Item, Place } from './types';

export interface AddressCardData {
  /** 要去的地方 */
  place: Place;
  /** 卡片上方的小标签：目的地 / 出发机场 / 住宿 … */
  role: string;
  /** 当地语言的大字名称（没有就用显示名） */
  bigName: string;
  /** 当地语言地址（没有就用显示地址） */
  bigAddress?: string;
  /** 显示语言的名称和地址（和大字不同时才有） */
  smallName?: string;
  smallAddress?: string;
  /** 有没有当地语言资料；没有时提醒在行程里补上 */
  hasLocal: boolean;
  phrase: Phrase;
}

export interface Phrase {
  /** 当地语言：「请带我去这里」 */
  local: string;
  zh: string;
  lang: string;
}

// 按目的地时区挑一句「请带我去这里」；只放有把握的语言，其他用英文
const PHRASES: { tz: RegExp; phrase: Phrase }[] = [
  { tz: /^Asia\/Tokyo$/, phrase: { local: 'ここまでお願いします。', zh: '请带我到这里', lang: 'ja' } },
  { tz: /^Asia\/Seoul$/, phrase: { local: '여기로 가 주세요.', zh: '请带我到这里', lang: 'ko' } },
  { tz: /^Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Taipei|Hong_Kong|Macau)$/, phrase: { local: '请带我到这里。', zh: '请带我到这里', lang: 'zh' } },
];
const EN: Phrase = { local: 'Please take me here.', zh: '请带我到这里', lang: 'en' };

export function phraseFor(tz: string): Phrase {
  return PHRASES.find((p) => p.tz.test(tz))?.phrase ?? EN;
}

/** 这一项要给司机看的是哪个地点：交通看终点，航班看出发机场，其他看地点；没有地点就没有地址卡 */
export function addressTarget(item: Pick<Item, 'type' | 'place' | 'toPlace'>): { place: Place; role: string } | undefined {
  if (item.type === 'transit' && item.toPlace) return { place: item.toPlace, role: '目的地' };
  if (item.type === 'flight' && item.place) return { place: item.place, role: '出发机场' };
  if (item.type === 'lodging' && item.place) return { place: item.place, role: '住宿' };
  if (item.place) return { place: item.place, role: '目的地' };
  return undefined;
}

export function addressCard(item: Pick<Item, 'type' | 'place' | 'toPlace'>, tz: string): AddressCardData | undefined {
  const t = addressTarget(item);
  if (!t) return undefined;
  const p = t.place;
  const bigName = p.localName || p.name;
  const bigAddress = p.localAddress || p.address;
  const hasLocal = !!(p.localName || p.localAddress);
  return {
    place: p,
    role: t.role,
    bigName,
    bigAddress,
    smallName: p.localName && p.localName !== p.name ? p.name : undefined,
    smallAddress: p.localAddress && p.address && p.address !== p.localAddress ? p.address : undefined,
    hasLocal,
    phrase: phraseFor(tz),
  };
}

/** 复制给别人用：当地名称 + 当地地址（各一行） */
export function addressCopyText(c: Pick<AddressCardData, 'bigName' | 'bigAddress'>): string {
  return [c.bigName, c.bigAddress].filter(Boolean).join('\n');
}
