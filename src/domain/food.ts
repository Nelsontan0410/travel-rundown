// 2026-10-21 美食专区：一份旅程的「美食备选库」。
// 和行程原始数据分开存放：这里从不改写行程项；只有用户点「改去这家」时才通过 repo.updateItem 改那一餐。
import type { Day, Item, MealKind, Place } from './types';

export type FoodKind = 'meal' | 'snack' | 'dessert' | 'cafe' | 'bar' | 'market';
export const FOOD_KIND_LABEL: Record<FoodKind, string> = {
  meal: '正餐',
  snack: '小吃',
  dessert: '甜品',
  cafe: '咖啡 / 茶',
  bar: '酒馆',
  market: '市场 / 美食街',
};
export const FOOD_KINDS = Object.keys(FOOD_KIND_LABEL) as FoodKind[];

export const MEAL_LABEL: Record<MealKind, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '点心' };
export const MEALS = Object.keys(MEAL_LABEL) as MealKind[];

/** 美食专区里的一家店 / 一个摊位 */
export interface FoodSpot {
  id: string;
  tripId: string;
  name: string;
  /** 地点：name 同店名；有当地名称、地址时导航更准 */
  place?: Place;
  /** 所在城市 / 区域，用来和每天的城市匹配，例如「札幌」「小樽」 */
  city?: string;
  kind: FoodKind;
  /** 菜系，例如「拉面」「寿司」「汤咖喱」 */
  cuisine?: string;
  /** 适合哪几餐；空着表示都可以 */
  meals?: MealKind[];
  /** 必吃 */
  mustTry?: string[];
  /** 价位，原样文字，例如「¥1,500/人」 */
  price?: string;
  /** 营业时间 / 定休日，原样文字 */
  hours?: string;
  /** 需要预约 */
  reserve?: boolean;
  /** 参考链接（Tabelog、小红书、Google 地图……） */
  url?: string;
  note?: string;
  /** 打算在第几天附近吃（Day.index，和行程 Day N 一样从 1 开始）；空着表示不限 */
  dayIndexes?: number[];
  source: 'manual' | 'import' | 'itinerary';
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** 新增 / 导入时传入的内容 */
export type FoodInput = Omit<FoodSpot, 'id' | 'tripId' | 'order' | 'createdAt' | 'updatedAt' | 'source'> & { source?: FoodSpot['source'] };

/** 个人标记，只存本机：吃过 / 收藏 */
export interface FoodMark {
  tripId: string;
  foodId: string;
  ate?: boolean;
  fav?: boolean;
  updatedAt: string;
}

export const FOOD_LIMITS = { name: 80, text: 300, note: 1000, mustTry: 20, spots: 300 };

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[\s,，、·・()（）\-–—]/g, '');

/** 用来判断「同一家店」：店名 + 城市（忽略空格、大小写、标点） */
export function foodIdentity(f: { name: string; city?: string }): string {
  return `${norm(f.name)}|${norm(f.city)}`;
}

/** 城市是否相同：一边包含另一边就算（「札幌」和「札幌市」「北海道札幌」） */
export function sameCity(a?: string, b?: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/** 一家店的地点（没有单独地点时按店名 + 城市搜） */
export function foodPlace(f: FoodSpot): Place {
  if (f.place?.address || f.place?.localName || f.place?.localAddress) return { ...f.place, name: f.place.name || f.name };
  return { ...f.place, name: f.name, address: f.place?.address ?? f.city };
}

export interface Alternative {
  food: FoodSpot;
  score: number;
  /** 推荐理由，例如「同城」「这天」「适合晚餐」「收藏」 */
  reasons: string[];
  /** 同城或指定了这一天 = 附近可去；否则只是「其他城市」 */
  nearby: boolean;
}

/**
 * 原定的这一餐吃不成时，从美食专区里挑备选。
 * 排除：吃过的、和原定同一家的。排序：附近（同城 / 指定这天）> 适合这一餐 > 收藏 > 原顺序。
 */
export function foodAlternatives(
  meal: Pick<Item, 'title' | 'meal'> & { place?: Place },
  day: Pick<Day, 'index' | 'city'> | undefined,
  foods: FoodSpot[],
  marks: Map<string, FoodMark>,
): Alternative[] {
  const self = norm(meal.place?.name ?? meal.title);
  const out: Alternative[] = [];
  for (const f of foods) {
    const m = marks.get(f.id);
    if (m?.ate) continue;
    if (self && (norm(f.name) === self || norm(f.place?.name) === self)) continue;
    const reasons: string[] = [];
    let score = 0;
    const city = !!day && sameCity(f.city, day.city);
    const onDay = !!day && !!f.dayIndexes?.includes(day.index);
    if (city) {
      score += 4;
      reasons.push('同城');
    }
    if (onDay) {
      score += 3;
      reasons.push('这天');
    }
    if (meal.meal) {
      if (f.meals?.includes(meal.meal)) {
        score += 2;
        reasons.push(`适合${MEAL_LABEL[meal.meal]}`);
      } else if (f.meals?.length) {
        score -= 2;
      } else if (kindFits(f.kind, meal.meal)) {
        score += 1;
      }
    }
    if (m?.fav) {
      score += 1;
      reasons.push('收藏');
    }
    out.push({ food: f, score, reasons, nearby: city || onDay });
  }
  return out.sort((a, b) => Number(b.nearby) - Number(a.nearby) || b.score - a.score || a.food.order - b.food.order);
}

function kindFits(kind: FoodKind, meal: MealKind): boolean {
  if (meal === 'snack') return kind !== 'meal';
  if (meal === 'breakfast') return kind === 'meal' || kind === 'cafe' || kind === 'market';
  return kind === 'meal' || kind === 'market' || kind === 'bar';
}

/** 城市筛选：按行程每天出现的顺序，再接上只在美食里出现的城市 */
export function foodCities(foods: FoodSpot[], days: Pick<Day, 'city'>[]): string[] {
  const out: string[] = [];
  const add = (c?: string) => {
    const t = c?.trim();
    if (t && !out.some((x) => norm(x) === norm(t))) out.push(t);
  };
  for (const d of days) if (foods.some((f) => sameCity(f.city, d.city))) add(d.city);
  for (const f of foods) if (!out.some((x) => sameCity(x, f.city))) add(f.city);
  return out;
}

export interface FoodFilter {
  city?: string;
  meal?: MealKind;
  kind?: FoodKind;
  /** 隐藏吃过的 */
  hideAte?: boolean;
  favOnly?: boolean;
  q?: string;
}

export function filterFoods(foods: FoodSpot[], marks: Map<string, FoodMark>, f: FoodFilter): FoodSpot[] {
  const q = norm(f.q);
  return foods
    .filter((x) => !f.city || sameCity(x.city, f.city))
    .filter((x) => !f.meal || !x.meals?.length || x.meals.includes(f.meal))
    .filter((x) => !f.kind || x.kind === f.kind)
    .filter((x) => !f.hideAte || !marks.get(x.id)?.ate)
    .filter((x) => !f.favOnly || !!marks.get(x.id)?.fav)
    .filter((x) => !q || [x.name, x.place?.localName, x.cuisine, x.city, x.note, ...(x.mustTry ?? [])].some((s) => norm(s).includes(q)))
    .sort((a, b) => a.order - b.order);
}

/** 行程里已经安排好的餐（给美食专区顶部「行程里的餐」用） */
export function plannedMeals(items: Item[], days: Day[]): { item: Item; day?: Day }[] {
  const byId = new Map(days.map((d) => [d.id, d]));
  return items.filter((i) => i.type === 'meal').map((item) => ({ item, day: byId.get(item.dayId) }));
}

/**
 * 把「改去这家」要写进那一餐的内容算出来。原计划（含订单号）写进备选方案，什么都不丢；
 * 原来的 AI 导航链接、订单号、预订状态属于原来那家，一并清掉。
 */
export function swapPatch(
  item: Pick<Item, 'title' | 'alt' | 'place' | 'bookingRef'>,
  food: FoodSpot,
): { title: string; place: Place; mustDo: string[] | undefined; alt: string; note: string | undefined; navUrl: undefined; bookingRef: undefined; bookingStatus: undefined } {
  const was = `原计划：${item.title}${item.bookingRef ? `（订单 ${item.bookingRef}）` : ''}`;
  const alt = item.alt?.includes(`原计划：${item.title}`) ? item.alt : [was, item.alt].filter(Boolean).join('；');
  const note = [food.cuisine, food.price, food.hours, food.reserve ? '需要预约' : '', food.note].filter(Boolean).join(' · ') || undefined;
  return { title: food.name, place: foodPlace(food), mustDo: food.mustTry?.length ? food.mustTry : undefined, alt, note, navUrl: undefined, bookingRef: undefined, bookingStatus: undefined };
}

/** 清理用户输入：去空白、截断、去掉空字段 */
export function cleanFood<T extends Partial<FoodSpot>>(f: T): T {
  const t = (s: string | undefined, n: number) => {
    const v = s?.trim().slice(0, n);
    return v || undefined;
  };
  const place = f.place
    ? {
        name: t(f.place.name, FOOD_LIMITS.name) ?? t(f.name, FOOD_LIMITS.name) ?? '',
        localName: t(f.place.localName, FOOD_LIMITS.name),
        address: t(f.place.address, FOOD_LIMITS.text),
        localAddress: t(f.place.localAddress, FOOD_LIMITS.text),
      }
    : undefined;
  const hasPlace = !!(place && (place.localName || place.address || place.localAddress));
  const mustTry = f.mustTry?.map((s) => s.trim().slice(0, FOOD_LIMITS.name)).filter(Boolean).slice(0, FOOD_LIMITS.mustTry);
  const out = {
    ...f,
    name: t(f.name, FOOD_LIMITS.name),
    city: t(f.city, FOOD_LIMITS.name),
    cuisine: t(f.cuisine, FOOD_LIMITS.name),
    price: t(f.price, FOOD_LIMITS.name),
    hours: t(f.hours, FOOD_LIMITS.text),
    url: t(f.url, FOOD_LIMITS.text),
    note: t(f.note, FOOD_LIMITS.note),
    place: hasPlace ? place : undefined,
    mustTry: mustTry?.length ? mustTry : undefined,
    meals: f.meals?.length ? [...new Set(f.meals)].filter((m) => m in MEAL_LABEL) : undefined,
    dayIndexes: f.dayIndexes?.length ? [...new Set(f.dayIndexes)].filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b) : undefined,
    reserve: f.reserve || undefined,
  };
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined) delete out[k];
  return out as T;
}
