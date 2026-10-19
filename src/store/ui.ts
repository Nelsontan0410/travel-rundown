import { create } from 'zustand';
import type { ImportFormat, ParseResult } from '../importer/parseMd';

interface ImportDraft {
  /** 原始输入（MD / JSON / CSV / 文字），确认导入后存进 Trip.sourceMd */
  md: string;
  result: ParseResult;
  targetTripId?: string;
  from: 'file' | 'paste';
  /** 修订 2026-10：识别出的格式、交给解析器的标准文本（预览「查看原文」用）、文件名 */
  format?: ImportFormat;
  normalized?: string;
  fileName?: string;
}

interface UIState {
  toast: { id: number; text: string } | null;
  showToast: (text: string) => void;
  draft: ImportDraft | null;
  setDraft: (d: ImportDraft | null) => void;
  pasteText: string;
  setPasteText: (t: string) => void;
  restoreAsk: boolean; // 恢复备份前的确认
  updateSW: (() => void) | null; // 有新版本时的刷新函数
  selectedDay: Record<string, string>; // tripId → dayId
  selectDay: (tripId: string, dayId: string) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

const DRAFT_KEY = 'trip-paste-draft';
function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(t: string) {
  try {
    if (t) localStorage.setItem(DRAFT_KEY, t);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 存不了就只留在内存里 */
  }
}

export const useUI = create<UIState>((set) => ({
  toast: null,
  showToast: (text) => {
    clearTimeout(timer);
    set({ toast: { id: Date.now(), text } });
    timer = setTimeout(() => set({ toast: null }), 2000);
  },
  draft: null,
  setDraft: (draft) => set({ draft }),
  // 2026-10-19：粘贴的草稿存在这台设备上，返回、切换步骤、刷新都不会丢；导入成功后清掉
  pasteText: readDraft(),
  setPasteText: (pasteText) => {
    writeDraft(pasteText);
    set({ pasteText });
  },
  restoreAsk: false,
  updateSW: null,
  selectedDay: {},
  selectDay: (tripId, dayId) => set((s) => ({ selectedDay: { ...s.selectedDay, [tripId]: dayId } })),
}));

export const toast = (text: string) => useUI.getState().showToast(text);
