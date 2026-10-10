import { parseMd } from '../importer/parseMd';
import { useUI } from '../store/ui';
import { pickFile } from '../lib/files';
import { restoreBackup } from '../db/repo';
import { toast } from '../store/ui';

/** 解析 md 并进入导入预览页 */
export function startPreview(md: string, from: 'file' | 'paste', targetTripId?: string) {
  const result = parseMd(md);
  useUI.getState().setDraft({ md, result, from, targetTripId });
}

export async function importMdFile(): Promise<boolean> {
  const f = await pickFile('.md,.markdown,.txt,text/markdown,text/plain');
  if (!f) return false;
  const text = await f.text();
  startPreview(text, 'file');
  return true;
}

export async function restoreFromFile(): Promise<void> {
  const f = await pickFile('.zip,application/zip');
  if (!f) return;
  try {
    const n = await restoreBackup(f);
    toast(`已恢复 ${n} 个旅程`);
  } catch {
    toast('不是有效的备份文件');
  }
}
