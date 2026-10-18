// 2026-10-18 同步：登录状态、待处理的更新和邀请（界面状态，不存数据）
import { create } from 'zustand';
import type { CloudInvite, CloudSession } from '../cloud/backend';

export interface PendingUpdate {
  version: number;
  note?: string;
  important: boolean;
}

interface CloudState {
  /** undefined = 还没检查；null = 没登录 */
  session: CloudSession | null | undefined;
  updates: Record<string, PendingUpdate>;
  invites: CloudInvite[];
  /** 最近一次检查失败的原因（离线等），不打扰用户，只在同步区块里显示 */
  lastError?: string;
  loginOpen: boolean;
}

export const useCloud = create<CloudState>(() => ({
  session: undefined,
  updates: {},
  invites: [],
  loginOpen: false,
}));
