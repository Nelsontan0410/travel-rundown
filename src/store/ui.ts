import { create } from 'zustand';
import type { ParseResult } from '../importer/parseMd';

interface ImportDraft {
  md: string;
  result: ParseResult;
  targetTripId?: string;
  from: 'file' | 'paste';
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

export const useUI = create<UIState>((set) => ({
  toast: null,
  showToast: (text) => {
    clearTimeout(timer);
    set({ toast: { id: Date.now(), text } });
    timer = setTimeout(() => set({ toast: null }), 2000);
  },
  draft: null,
  setDraft: (draft) => set({ draft }),
  pasteText: '',
  setPasteText: (pasteText) => set({ pasteText }),
  restoreAsk: false,
  updateSW: null,
  selectedDay: {},
  selectDay: (tripId, dayId) => set((s) => ({ selectedDay: { ...s.selectedDay, [tripId]: dayId } })),
}));

export const toast = (text: string) => useUI.getState().showToast(text);
