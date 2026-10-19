// 2026-10-18 同步：这台手机的同步身份、待处理的更新（界面状态，不存数据）
import { create } from 'zustand';
import type { CloudEvent, CloudSession } from '../cloud/backend';

export interface PendingUpdate {
  version: number;
  note?: string;
  important: boolean;
}

interface CloudState {
  /** undefined = 还没检查；null = 这台手机还没用过同步 */
  session: CloudSession | null | undefined;
  updates: Record<string, PendingUpdate>;
  /** 最近一次检查失败的原因（离线等），不打扰用户，只在同步区块里显示 */
  lastError?: string;
  /** 2026-10-19 通知：本机同步中的旅程发生的事（旧的在前） */
  events: CloudEvent[];
  /** 看过的最新一条通知 id（存在这台手机上） */
  seenId: number;
}

export const useCloud = create<CloudState>(() => ({
  session: undefined,
  updates: {},
  events: [],
  seenId: readSeen(),
}));

function readSeen(): number {
  try {
    return Number(localStorage.getItem('trip-notify-seen') || 0);
  } catch {
    return 0;
  }
}

/** 未读通知（别人做的、比看过的新） */
export const unreadOf = (s: { events: CloudEvent[]; seenId: number; session: CloudSession | null | undefined }) =>
  s.events.filter((e) => e.id > s.seenId && e.actorId !== s.session?.userId);
