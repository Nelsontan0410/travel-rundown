import Dexie, { type Table } from 'dexie';
import type { BlobRecord, Day, Doc, Expense, Garment, Item, ItemState, Outfit, PackCheck, PackItem, Settings, Trip } from '../domain/types';
import { migrateItemV2 } from '../domain/migrate';

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
  }
}

export const db = new RundownDB();
