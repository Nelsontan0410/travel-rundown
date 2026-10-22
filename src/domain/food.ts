// 2026-10-23 全新美食专区：全站共用的一本「美食册」，不属于任何旅程。
// Gallery（只看）和美食资料库（管理）共用这里的分类、字段规则和纯函数。
import type { Focus } from './guide';
import { DEFAULT_SETTINGS, type Settings } from './types';
import { directionsUrl, searchUrl } from '../links/maps';

export type FoodCategory = 'main' | 'snack' | 'drink' | 'supper';

/** 分类配置：Gallery 的分类标签和资料库的表单 / 筛选都用这一份 */
export const FOOD_CATEGORIES: { key: FoodCategory; label: string; en: string }[] = [
  { key: 'main', label: '主食类', en: 'Mains' },
  { key: 'snack', label: '小吃类', en: 'Snacks' },
  { key: 'drink', label: '饮料类', en: 'Drinks' },
  { key: 'supper', label: '宵夜类', en: 'Late night' },
];
export const FOOD_CATEGORY_LABEL = Object.fromEntries(FOOD_CATEGORIES.map((c) => [c.key, c.label])) as Record<FoodCategory, string>;
export const isFoodCategory = (v: unknown): v is FoodCategory => typeof v === 'string' && v in FOOD_CATEGORY_LABEL;

/** 常用币种（表单下拉）；也接受其他三位字母代码 */
export const FOOD_CURRENCIES = ['MYR', 'SGD', 'CNY', 'TWD', 'HKD', 'JPY', 'KRW', 'THB', 'USD', 'EUR'] as const;
export const CURRENCY_SIGN: Record<string, string> = { MYR: 'RM', SGD: 'S$', CNY: '¥', TWD: 'NT$', HKD: 'HK$', JPY: '¥', KRW: '₩', THB: '฿', USD: 'US$', EUR: '€' };

export interface FoodBudget {
  /** ISO 4217 三位字母，例如 MYR、SGD、CNY */
  currency: string;
  min?: number;
  max?: number;
}

export interface FoodEntry {
  id: string;
  /** 美食名称，例如「南宁老友粉」 */
  name: string;
  category: FoodCategory;
  /** 照片在 blobs 表里的键：food:<id>:<随机>；缩略图 = 键 + '#thumb'。不把图片本体存进记录 */
  photoKey?: string;
  /** 照片在正方形格子里怎么摆（焦点 + 缩放），原图不裁 */
  photoFocus?: Focus;
  restaurantName: string;
  /** 完整地址文本（中英文、数字、符号都原样保存） */
  address: string;
  /** 电话：字符串，保留 + 号、国际区号和开头的 0 */
  phone?: string;
  lat?: number;
  lng?: number;
  budget?: FoodBudget;
  /** 美食形容 / 研究资料，多行文字 */
  description?: string;
  /** 排列顺序：新加的排在最前 */
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** 表单提交的内容（不含 id、时间、顺序、照片） */
export type FoodDraft = Pick<FoodEntry, 'name' | 'category' | 'restaurantName' | 'address' | 'phone' | 'lat' | 'lng' | 'budget' | 'description' | 'photoFocus'>;

export const FOOD_LIMITS = { name: 60, restaurant: 80, address: 300, phone: 40, description: 3000, entries: 2000 } as const;

export const foodPhotoKeyPrefix = (id: string) => `food:${id}:`;

const trimTo = (s: string | undefined, n: number) => {
  const t = (s ?? '').trim();
  return t ? Array.from(t).slice(0, n).join('') : undefined;
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** 校验表单；返回字段 → 错误文字。空对象表示可以保存 */
export function validateFood(d: Partial<FoodDraft>): Partial<Record<'name' | 'category' | 'restaurantName' | 'address' | 'phone' | 'budget' | 'coords', string>> {
  const e: ReturnType<typeof validateFood> = {};
  if (!d.name?.trim()) e.name = '请填写美食名称';
  if (!isFoodCategory(d.category)) e.category = '请选择分类';
  if (!d.restaurantName?.trim()) e.restaurantName = '请填写店名';
  if (!d.address?.trim()) e.address = '请填写地址';
  if (d.phone && !/^[+\d][\d\s\-()+#*.,/]*$/.test(d.phone.trim())) e.phone = '电话只能包含数字、+、空格、- 和括号';
  const b = d.budget;
  if (b) {
    if (b.min !== undefined && (!Number.isFinite(b.min) || b.min < 0)) e.budget = '预算要填不小于 0 的数字';
    else if (b.max !== undefined && (!Number.isFinite(b.max) || b.max < 0)) e.budget = '预算要填不小于 0 的数字';
    else if (b.min !== undefined && b.max !== undefined && b.min > b.max) e.budget = '最低预算不能高于最高预算';
    else if ((b.min !== undefined || b.max !== undefined) && !/^[A-Z]{3}$/.test(b.currency)) e.budget = '请选择币种';
  }
  const hasLat = d.lat !== undefined;
  const hasLng = d.lng !== undefined;
  if (hasLat !== hasLng) e.coords = '纬度和经度要一起填';
  else if (hasLat && (!Number.isFinite(d.lat!) || Math.abs(d.lat!) > 90 || !Number.isFinite(d.lng!) || Math.abs(d.lng!) > 180)) e.coords = '坐标超出范围';
  return e;
}

/** 清理：去空白、截断、去掉空字段。不做校验（先 validateFood） */
export function cleanFoodDraft(d: Partial<FoodDraft>): Partial<FoodDraft> {
  const out: Partial<FoodDraft> = {
    name: trimTo(d.name, FOOD_LIMITS.name),
    category: d.category,
    restaurantName: trimTo(d.restaurantName, FOOD_LIMITS.restaurant),
    address: trimTo(d.address, FOOD_LIMITS.address),
    phone: trimTo(d.phone, FOOD_LIMITS.phone),
    description: (d.description ?? '').replace(/\r\n?/g, '\n').trim().slice(0, FOOD_LIMITS.description) || undefined,
    lat: num(d.lat),
    lng: num(d.lng),
    photoFocus: d.photoFocus,
  };
  if (d.budget && (num(d.budget.min) !== undefined || num(d.budget.max) !== undefined)) {
    out.budget = { currency: d.budget.currency.trim().toUpperCase() };
    if (num(d.budget.min) !== undefined) out.budget.min = d.budget.min;
    if (num(d.budget.max) !== undefined) out.budget.max = d.budget.max;
  }
  for (const k of Object.keys(out) as (keyof FoodDraft)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** 预算显示：「RM 10–20」「S$ 8 起」「¥ 30 以内」 */
export function fmtBudget(b: FoodBudget | undefined): string {
  if (!b || (b.min === undefined && b.max === undefined)) return '';
  const sign = CURRENCY_SIGN[b.currency] ?? b.currency;
  const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (b.min !== undefined && b.max !== undefined) return b.min === b.max ? `${sign} ${n(b.min)}` : `${sign} ${n(b.min)}–${n(b.max)}`;
  if (b.min !== undefined) return `${sign} ${n(b.min)} 起`;
  return `${sign} ${n(b.max!)} 以内`;
}

/** 地址缩短给列表用：取第一个逗号前，最多 24 字 */
export function shortAddress(a: string): string {
  const first = a.split(/[,，]/)[0].trim();
  const chars = Array.from(first);
  return chars.length > 24 ? `${chars.slice(0, 24).join('')}…` : first;
}

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/\s+/g, '');

/** 搜索：美食名称、分类、店名、地址 */
export function matchFood(f: FoodEntry, q: string): boolean {
  const k = norm(q);
  if (!k) return true;
  return [f.name, FOOD_CATEGORY_LABEL[f.category], f.restaurantName, f.address].some((s) => norm(s).includes(k));
}

export function filterFoods(list: FoodEntry[], category: FoodCategory | 'all', q = ''): FoodEntry[] {
  return sortFoods(list).filter((f) => (category === 'all' || f.category === category) && matchFood(f, q));
}

/** 新加的在前；同一顺序按建立时间 */
export const sortFoods = (list: FoodEntry[]) => [...list].sort((a, b) => b.order - a.order || b.createdAt.localeCompare(a.createdAt));

const NOT_MAINLAND = /香港|澳門|澳门|台湾|台灣|臺灣|Hong\s?Kong|Macau|Macao|Taiwan/i;
const MAINLAND = new RegExp([
  '中国', '中國', 'China', 'PRC',
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
  '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '内蒙古', '广西', '西藏', '宁夏', '新疆',
  '南宁', '桂林', '柳州', '北海', '广州', '深圳', '珠海', '佛山', '东莞', '汕头', '潮州', '厦门', '福州', '泉州', '杭州', '苏州', '南京', '无锡',
  '宁波', '成都', '昆明', '大理', '丽江', '贵阳', '长沙', '武汉', '西安', '郑州', '济南', '青岛', '沈阳', '大连', '哈尔滨', '长春', '石家庄',
  '太原', '呼和浩特', '兰州', '西宁', '银川', '乌鲁木齐', '拉萨', '海口', '三亚', '南昌', '合肥', '湛江', '顺德',
].join('|'));

const validCoord = (lat?: number, lng?: number) =>
  num(lat) !== undefined && num(lng) !== undefined && Math.abs(lat!) <= 90 && Math.abs(lng!) <= 180 && !(lat === 0 && lng === 0);

/** 坐标粗判是否在中国大陆（排除港澳台、朝韩、日本、越老缅边境以南） */
function coordInMainland(lat: number, lng: number): boolean {
  if (lat < 20.5 || lat > 53.6 || lng < 97 || lng > 123.5) return lng >= 123.5 && lng <= 135 && lat >= 40.5 && lat <= 53.6 && !(lat < 42.5 && lng > 126.5);
  if (lat >= 22.1 && lat <= 22.6 && lng >= 113.5 && lng <= 114.45) return false; // 港澳
  if (lat >= 21.8 && lat <= 25.4 && lng >= 119.3 && lng <= 122.1) return false; // 台湾
  if (lat < 22.4 && lng < 108) return false; // 越南、老挝北部
  if (lat < 27 && lng < 98.7) return false; // 缅甸北部
  if (lat > 42.6 && lng < 119.5) return false; // 蒙古
  return true;
}

/** 这家店在不在中国大陆：先看地址文字，再看坐标 */
export function foodInMainland(f: Pick<FoodEntry, 'restaurantName' | 'address' | 'lat' | 'lng'>): boolean {
  const text = `${f.address ?? ''} ${f.restaurantName ?? ''}`;
  if (NOT_MAINLAND.test(text)) return false;
  if (MAINLAND.test(text)) return true;
  return validCoord(f.lat, f.lng) ? coordInMainland(f.lat!, f.lng!) : false;
}

/**
 * 导航链接：按「店在哪里」选地图（中国大陆用设置里的中国导航，默认高德；其他地方用另一项），与用户人在哪、当前哪个行程无关。
 * 高德一律只用「地址」搜索（加店名会让高德搜不准；也避免 WGS-84 / GCJ-02 坐标偏移）。手机上由 openExternal 直接拉起高德 App。
 * Google 有有效坐标用坐标，否则用「店名 + 地址」。地址和坐标都没有就返回 undefined，界面据此禁用导航。
 */
export function foodNavUrl(f: Pick<FoodEntry, 'restaurantName' | 'address' | 'lat' | 'lng'>, settings?: Settings): string | undefined {
  const s = settings ?? DEFAULT_SETTINGS;
  const app = foodInMainland(f) ? s.navInChina : s.navElsewhere;
  const okCoord = validCoord(f.lat, f.lng);
  const addr = f.address?.trim();
  const q = [f.restaurantName?.trim(), addr].filter(Boolean).join(' ');
  if (app === 'amap') {
    if (addr) return searchUrl('amap', addr);
    if (okCoord) return `https://uri.amap.com/marker?position=${f.lng},${f.lat}&name=${encodeURIComponent(f.restaurantName?.trim() || '')}&coordinate=wgs84&callnative=1`;
    return undefined;
  }
  if (okCoord) {
    if (app === 'apple-maps') return `https://maps.apple.com/?daddr=${f.lat},${f.lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`;
  }
  if (!addr) return undefined;
  return directionsUrl(app, q);
}
