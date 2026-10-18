// 2026-10-18 同步：这台手机的同步身份、待处理的更新（界面状态，不存数据）
import { create } from 'zustand';
import type { CloudSession } from '../cloud/backend';

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
}

export const useCloud = create<CloudState>(() => ({
  session: undefined,
  updates: {},
}));
