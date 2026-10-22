import Dexie, { type Table } from 'dexie';
import type { BlobRecord, Day, Doc, Expense, Garment, Item, ItemState, Outfit, PackCheck, PackItem, Settings, Trip } from '../domain/types';
import type { Guide, Highlight } from '../domain/guide';
import type { FoodEntry } from '../domain/food';
import { migrateItemV2 } from '../domain/migrate';
import type { TripSnapshot } from '../cloud/snapshot';

/** 2026-10-18 同步：本机上次发布（主用户）/ 套用（同伴）的那个版本，用来算「改了什么」和三方合并 */
export interface CloudBase {
  tripId: string;
  version: number;
  snapshot: TripSnapshot;
  savedAt: string;
}

export class RundownDB extends Dexie {
  trips!: Table<Trip, string>;
  days!: Table<Day, string>;
  items!: Table<Item, string>;
  docs!: Table<Doc, string>;
  blobs!: Table<BlobRecord, string>;
  itemStates!: Table<ItemState, [string, string]>;
  settings!: Table<Settings, string>;
  expenses!: Table<Expense, string>;
  garments!: Table<Garment, string>;
  outfits!: Table<Outfit, [string, number]>;
  packItems!: Table<PackItem, string>;
  packChecks!: Table<PackCheck, [string, string]>;
  cloudBases!: Table<CloudBase, string>;
  guides!: Table<Guide, string>;
  highlights!: Table<Highlight, string>;
  foodEntries!: Table<FoodEntry, string>;

  constructor() {
    super('travel-rundown');
    this.version(1).stores({
      trips: 'id',
      days: 'id, tripId, date',
      items: 'id, dayId, key, tripId',
      docs: 'id, tripId, *itemKeys',
      blobs: 'key', // 证明文件本体、封面图
      itemStates: '[tripId+itemKey], tripId',
      settings: 'id',
    });
    // v2：账本表；旧行程项的自定义字段（航班号、退房日期……）搬进类型专属字段
    this.version(2)
      .stores({ expenses: 'id, tripId, date' })
      .upgrade(async (tx) => {
        await tx
          .table('items')
          .toCollection()
          .modify((it: Item) => {
            Object.assign(it, migrateItemV2(it));
          });
      });
    // v3（2026-10）：衣橱（所有旅程共用）、每日穿搭、打包清单
    this.version(3).stores({
      garments: 'id',
      outfits: '[tripId+dayIndex], tripId',
      packItems: 'id, tripId',
      packChecks: '[tripId+ref], tripId',
    });
    // v4（2026-10-18）：同步用的基准版本
    this.version(4).stores({ cloudBases: 'tripId' });
    // v5（2026-10-20）：旅行亮点（展示资料，和行程原始数据分开；同伴端只读）
    this.version(5).stores({ guides: 'tripId', highlights: 'id, tripId' });
    // v6（2026-10-21）：美食专区（备选店铺）和个人标记（吃过 / 收藏）
    this.version(6).stores({ foods: 'id, tripId', foodMarks: '[tripId+foodId], tripId' });
    // v7（2026-10-23）：全新美食专区，全站共用一本美食册。旧版按旅程的美食专区整个移除（表和资料一起删）
    this.version(7).stores({ foods: null, foodMarks: null, foodEntries: 'id, category' });
  }
}

export const db = new RundownDB();
