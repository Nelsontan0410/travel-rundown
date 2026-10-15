// 2026-10 第一批 ②：预订资料离线准备检查。纯函数：只看行程项、证明资料和本机已保存的文件。
// 区分四种资料：本机文件（可离线）、自己保存的二维码 / 票码图片（可离线出示）、
// 外部链接（要联网）、动态票码（必须现场打开官方 App，截图无效）。
import type { Doc, Item } from './types';

/** 只有链接、没有文件的资料（外部订单页、动态票码） */
export const LINK_MIME = 'text/uri-list';
export const isLinkDoc = (d: Pick<Doc, 'mime'>): boolean => d.mime === LINK_MIME;

export type BookingGroup = 'lodging' | 'transport' | 'ticket';

export const GROUP_LABEL: Record<BookingGroup, string> = { lodging: '酒店', transport: '交通', ticket: '门票' };

export function bookingGroup(it: Pick<Item, 'type'>): BookingGroup {
  if (it.type === 'lodging') return 'lodging';
  if (it.type === 'flight' || it.type === 'transit') return 'transport';
  return 'ticket';
}

/**
 * ok        本机有文件，可离线出示
 * dynamic   有动态票码：现场要联网打开 App（就算也有其他文件，也要提醒）
 * link      只有外部链接，离线打不开
 * ref       只有预订编号，没有任何凭证
 * unsaved   有资料但文件不在本机（例如恢复了不含附件的旅行包）
 * missing   什么都没有
 */
export type OfflineLevel = 'ok' | 'dynamic' | 'link' | 'ref' | 'unsaved' | 'missing';

export interface OfflineState {
  level: OfflineLevel;
  /** 本机已保存的文件（含二维码图片） */
  saved: number;
  /** 其中自己保存的二维码 / 票码图片 */
  codes: number;
  links: number;
  dynamic: number;
  unsaved: number;
  hasRef: boolean;
}

export function offlineState(it: Pick<Item, 'bookingRef'>, docs: Doc[], savedBlobs: Set<string>): OfflineState {
  const files = docs.filter((d) => !isLinkDoc(d));
  const linkDocs = docs.filter(isLinkDoc);
  const saved = files.filter((d) => savedBlobs.has(d.blobKey));
  const st = {
    saved: saved.length,
    codes: saved.filter((d) => d.codeKind === 'static').length,
    links: linkDocs.filter((d) => d.codeKind !== 'dynamic').length,
    dynamic: docs.filter((d) => d.codeKind === 'dynamic').length,
    unsaved: files.length - saved.length,
    hasRef: !!it.bookingRef,
  };
  const level: OfflineLevel =
    st.dynamic > 0 ? 'dynamic'
    : st.saved > 0 ? 'ok'
    : st.unsaved > 0 ? 'unsaved'
    : st.links > 0 ? 'link'
    : st.hasRef ? 'ref'
    : 'missing';
  return { level, ...st };
}

export const OFFLINE_LABEL: Record<OfflineLevel, { variant: 'success' | 'warning' | 'neutral'; label: string; detail: string }> = {
  ok: { variant: 'success', label: '可离线出示', detail: '凭证文件已保存在本机' },
  dynamic: { variant: 'warning', label: '现场需联网', detail: '动态票码要在官方 App 里现场打开，截图无效' },
  link: { variant: 'warning', label: '只有链接', detail: '只保存了网页链接，没网时打不开' },
  ref: { variant: 'neutral', label: '只有编号', detail: '预订编号可离线查看，但没有凭证文件' },
  unsaved: { variant: 'warning', label: '文件不在本机', detail: '资料在，但文件没有保存到这台手机' },
  missing: { variant: 'warning', label: '缺资料', detail: '还没有预订编号或凭证' },
};

export interface OfflineReport {
  rows: { item: Item; state: OfflineState }[];
  counts: Record<OfflineLevel, number>;
  /** 需要处理的（除 ok 外） */
  todo: number;
}

/** 预订列表里每一项的离线状态汇总；只看 inBookingList 选出来的项 */
export function offlineReport(items: Item[], docsOf: (key: string) => Doc[], savedBlobs: Set<string>): OfflineReport {
  const counts: Record<OfflineLevel, number> = { ok: 0, dynamic: 0, link: 0, ref: 0, unsaved: 0, missing: 0 };
  const rows = items.map((item) => {
    const state = offlineState(item, docsOf(item.key), savedBlobs);
    counts[state.level]++;
    return { item, state };
  });
  return { rows, counts, todo: rows.length - counts.ok };
}

/** 网址是否像链接（添加链接时校验） */
export function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/|[a-z][a-z0-9+.-]*:\/\/)\S+$/i.test(s.trim());
}
