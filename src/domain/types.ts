// 数据结构以 PRD「数据结构」为准；带「设计新增」的是设计参考「数据绑定」要求的字段。
export type ItemType = 'flight' | 'lodging' | 'spot' | 'transit' | 'note';
export type ItemStatus = 'todo' | 'done' | 'skipped';
export type BookingStatus = 'confirmed' | 'pending';
export type TranslateLang = 'zh-CN' | 'en' | 'ja' | 'ko';
export type NavApp = 'amap' | 'google-maps' | 'apple-maps';

export interface TripTranslate {
  app: 'google-translate';
  from: 'auto';
  to: TranslateLang;
}

export interface Trip {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  homeTz: string;
  destination?: string; // 设计新增
  coverBlobKey?: string; // 设计新增
  translate: TripTranslate; // 设计新增
  sourceMd: string;
  importedAt: string;
  updatedAt: string;
}

export interface Day {
  id: string;
  tripId: string;
  index: number;
  date: string;
  tz: string;
  city: string;
  title?: string; // 设计新增：Day 主题
  note?: string;
}

export interface Place {
  name: string;
  localName?: string;
  address?: string;
  localAddress?: string;
}

export interface Item {
  id: string;
  key: string;
  tripId: string;
  dayId: string;
  order: number;
  type: ItemType;
  title: string;
  start?: string;
  end?: string;
  endDayOffset?: number;
  place?: Place;
  toPlace?: Place;
  navUrl?: string;
  bookingRef?: string;
  bookingStatus?: BookingStatus; // 设计新增
  note?: string;
  meta?: Record<string, string>;
  src?: SourceRange; // 在导入 md 里的起止行号（含）
  alt?: string; // 备选方案（如天气不好时）
  fixed?: boolean; // 固定时间（航班、预约等）
  timeNote?: string; // 没有精确时间时的说明，例如「早上」
}

export interface SourceRange {
  from: number;
  to: number;
}

export type DocKind = 'flight' | 'lodging' | 'ticket' | 'insurance' | 'other';

export interface Doc {
  id: string;
  tripId: string;
  title: string;
  kind: DocKind;
  mime: string;
  blobKey: string;
  itemKeys: string[];
  addedAt: string;
  updatedAt: string;
}

export interface ItemState {
  tripId: string;
  itemKey: string;
  status: ItemStatus;
  updatedAt: string;
}

export interface BlobRecord {
  key: string;
  blob: Blob;
}

export interface Settings {
  id: 'app';
  navInChina: NavApp;
  navElsewhere: NavApp;
  lastTripId?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  navInChina: 'amap',
  navElsewhere: 'google-maps',
};

export const DEFAULT_TRANSLATE: TripTranslate = { app: 'google-translate', from: 'auto', to: 'zh-CN' };
