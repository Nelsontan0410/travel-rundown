// 数据结构以 PRD「数据结构」为准；带「设计新增」的是设计参考「数据绑定」要求的字段。
export type ItemType = 'flight' | 'lodging' | 'spot' | 'transit' | 'meal' | 'note';
export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ItemStatus = 'todo' | 'done' | 'skipped';
export type BookingStatus = 'confirmed' | 'pending';
export type TranslateLang = 'zh-CN' | 'en' | 'ja' | 'ko';
export type NavApp = 'amap' | 'google-maps' | 'apple-maps';
export type TripTheme = 'classic' | 'spring' | 'summer' | 'autumn' | 'winter';

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
  /** v2：旅行预算，单位「分」（MYR × 100）。导入只带预算，实际花费由用户在账本里记 */
  budget?: number;
  translate: TripTranslate; // 设计新增
  /** 修订 2026-10：参与人数（导入里写了「人数」或在旅程设置里填） */
  participants?: number;
  /** 修订 2026-10：这份旅程的外观主题，缺省为 classic */
  theme?: TripTheme;
  /** 修订 2026-10：出发时刻 HH:mm（出发地时区 homeTz），缺省按出发日 00:00 倒数 */
  departTime?: string;
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
  // ---- v2：按类型的专属字段（只有对应类型才会有） ----
  flight?: FlightInfo;
  lodging?: LodgingInfo;
  transit?: TransitInfo;
  meal?: MealKind;
  /** 景点「必逛 / 必体验」、餐饮「必吃」清单；用户勾选状态存在 ItemState.checked */
  mustDo?: string[];
}

export interface FlightInfo {
  number?: string; // 航班号
  airline?: string;
  terminal?: string;
  seat?: string;
}

export interface LodgingInfo {
  checkIn?: string; // YYYY-MM-DD，默认就是所在那天
  checkOut?: string; // YYYY-MM-DD
  roomType?: string;
}

export interface TransitInfo {
  mode?: string; // 地铁、巴士、JR、出租车、租车、步行……
  line?: string;
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
  mime: string; // 原文件类型；加密后 blob 本体是密文，但这里仍记原类型
  blobKey: string;
  itemKeys: string[];
  /** v2：有值表示文件已用密码加密（AES-GCM，密钥由 PBKDF2 从密码导出），密码不保存 */
  lock?: DocLock;
  addedAt: string;
  updatedAt: string;
}

export interface DocLock {
  salt: string; // base64
  iv: string; // base64
  iter: number;
  hint?: string;
}

export interface ItemState {
  tripId: string;
  itemKey: string;
  status: ItemStatus;
  /** v2：已勾选的必逛 / 必吃项（存文字，重新导入后文字不变就还在） */
  checked?: string[];
  updatedAt: string;
}

export type ExpenseCategory = 'flight' | 'lodging' | 'transit' | 'meal' | 'ticket' | 'shopping' | 'other';

/** v2：账本明细。金额单位「分」，目前只支持 MYR */
export interface Expense {
  id: string;
  tripId: string;
  date: string; // YYYY-MM-DD
  amount: number; // 分
  title: string;
  category: ExpenseCategory;
  itemKey?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export const CURRENCY = 'MYR';

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
