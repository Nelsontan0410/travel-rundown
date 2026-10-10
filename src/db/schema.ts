import Dexie, { type Table } from 'dexie';
import type { BlobRecord, Day, Doc, Item, ItemState, Settings, Trip } from '../domain/types';

export class RundownDB extends Dexie {
  trips!: Table<Trip, string>;
  days!: Table<Day, string>;
  items!: Table<Item, string>;
  docs!: Table<Doc, string>;
  blobs!: Table<BlobRecord, string>;
  itemStates!: Table<ItemState, [string, string]>;
  settings!: Table<Settings, string>;

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
  }
}

export const db = new RundownDB();
