// 2026-10 第一批 ④：衣橱、每日穿搭、打包清单（纯函数）。
// 打包清单的衣物部分从每日穿搭自动汇总：同一件外套穿好几天，清单里只出现一次。
import type { Day, Garment, GarmentCategory, Outfit, PackGroup, PackItem } from './types';

export const GARMENT_LABEL: Record<GarmentCategory, string> = {
  outer: '外套',
  top: '上衣',
  bottom: '裤 / 裙',
  dress: '连身',
  shoes: '鞋',
  accessory: '配件',
  other: '其他',
};
export const GARMENT_ORDER: GarmentCategory[] = ['outer', 'top', 'bottom', 'dress', 'shoes', 'accessory', 'other'];

export const PACK_GROUP_LABEL: Record<PackGroup, string> = {
  docs: '证件与钱',
  electronics: '电子产品',
  toiletries: '洗漱',
  health: '药品与护理',
  weather: '天气相关',
  other: '其他',
};
export const PACK_GROUP_ORDER: PackGroup[] = ['docs', 'electronics', 'toiletries', 'health', 'weather', 'other'];

/** 两组常用物品，由用户自己选择加入，不按目的地猜 */
export const PACK_PRESETS: Record<'basic' | 'cold', { label: string; rows: { name: string; group: PackGroup }[] }> = {
  basic: {
    label: '常用物品',
    rows: [
      { name: '护照', group: 'docs' },
      { name: '信用卡 / 现金', group: 'docs' },
      { name: '旅游保险单', group: 'docs' },
      { name: '手机充电器', group: 'electronics' },
      { name: '充电宝', group: 'electronics' },
      { name: '转换插头', group: 'electronics' },
      { name: '牙刷牙膏', group: 'toiletries' },
      { name: '护肤品', group: 'toiletries' },
      { name: '常用药', group: 'health' },
    ],
  },
  cold: {
    label: '冬季保暖',
    rows: [
      { name: '暖宝宝', group: 'weather' },
      { name: '防滑鞋套', group: 'weather' },
      { name: '手套', group: 'weather' },
      { name: '围巾', group: 'weather' },
      { name: '润唇膏', group: 'health' },
      { name: '护手霜', group: 'health' },
    ],
  },
};

const catRank = (c: GarmentCategory) => GARMENT_ORDER.indexOf(c);

/** 某一天的穿搭单品（按类别排好） */
export function outfitGarments(o: Outfit | undefined, garments: Map<string, Garment>): Garment[] {
  return (o?.garmentIds ?? [])
    .map((id) => garments.get(id))
    .filter((g): g is Garment => !!g)
    .sort((a, b) => catRank(a.category) - catRank(b.category));
}

export interface PackClothesRow {
  garment: Garment;
  /** 穿这件的是第几天（Day.index），升序 */
  days: number[];
  packed: boolean;
}

export interface PackingList {
  clothes: PackClothesRow[];
  groups: { group: PackGroup; rows: { item: PackItem; packed: boolean }[] }[];
  packed: number;
  total: number;
  /** 还没安排穿搭的天（Day.index） */
  unplanned: number[];
}

export function packingList(
  days: Pick<Day, 'index'>[],
  outfits: Outfit[],
  garments: Map<string, Garment>,
  items: PackItem[],
  packedRefs: Set<string>,
): PackingList {
  const valid = new Set(days.map((d) => d.index));
  const byGarment = new Map<string, Set<number>>();
  for (const o of outfits) {
    if (!valid.has(o.dayIndex)) continue;
    for (const id of o.garmentIds) {
      if (!garments.has(id)) continue;
      if (!byGarment.has(id)) byGarment.set(id, new Set());
      byGarment.get(id)!.add(o.dayIndex);
    }
  }
  const clothes = [...byGarment.entries()]
    .map(([id, ds]) => ({ garment: garments.get(id)!, days: [...ds].sort((a, b) => a - b), packed: packedRefs.has(`garment:${id}`) }))
    .sort((a, b) => catRank(a.garment.category) - catRank(b.garment.category) || a.days[0] - b.days[0] || a.garment.name.localeCompare(b.garment.name));
  const groups = PACK_GROUP_ORDER.map((group) => ({
    group,
    rows: items
      .filter((i) => i.group === group)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((item) => ({ item, packed: packedRefs.has(`item:${item.id}`) })),
  })).filter((g) => g.rows.length);
  const all = [...clothes.map((c) => c.packed), ...groups.flatMap((g) => g.rows.map((r) => r.packed))];
  const planned = new Set(outfits.filter((o) => o.garmentIds.some((id) => garments.has(id))).map((o) => o.dayIndex));
  return {
    clothes,
    groups,
    packed: all.filter(Boolean).length,
    total: all.length,
    unplanned: days.map((d) => d.index).filter((i) => !planned.has(i)),
  };
}

/** 「Day 1、3、5」这样的短写法 */
export function dayList(days: number[]): string {
  return days.length ? `Day ${days.join('、')}` : '';
}
