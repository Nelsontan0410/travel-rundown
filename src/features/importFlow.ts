import { parseImport } from '../importer/structured';
import { useUI } from '../store/ui';
import { downloadBlob, pickFile } from '../lib/files';
import { restoreBackupDetailed } from '../db/repo';
import { toast } from '../store/ui';
import { CSV_TEMPLATE, JSON_TEMPLATE } from '../importer/templates';

/** 解析（自动识别 MD / JSON / CSV / 文字）并进入导入预览页。这一步不写数据库 */
export function startPreview(text: string, from: 'file' | 'paste', targetTripId?: string, fileName?: string) {
  const { result, normalized, format } = parseImport(text, fileName);
  useUI.getState().setDraft({ md: text, result, from, targetTripId, format, normalized, fileName });
}

export const IMPORT_ACCEPT = '.md,.markdown,.txt,.json,.csv,.tsv,text/markdown,text/plain,application/json,text/csv';

/** 选文件导入：MD / JSON / CSV / TXT */
export async function importFile(targetTripId?: string): Promise<boolean> {
  const f = await pickFile(IMPORT_ACCEPT);
  if (!f) return false;
  const text = await f.text();
  startPreview(text, 'file', targetTripId, f.name);
  return true;
}

/** 旧名字，保留给已有调用 */
export const importMdFile = () => importFile();

export function downloadTemplate(kind: 'json' | 'csv'): void {
  const body = kind === 'json' ? JSON_TEMPLATE : CSV_TEMPLATE;
  const type = kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
  downloadBlob(new Blob([body], { type }), `travel-rundown-template.${kind}`);
}

/** 恢复备份入口：先弹确认（RestoreConfirm），确认后才选文件 */
export function restoreFromFile(): void {
  useUI.setState({ restoreAsk: true });
}

export async function pickAndRestore(): Promise<void> {
  const f = await pickFile('.zip,application/zip');
  if (!f) return;
  try {
    const r = await restoreBackupDetailed(f);
    const what = r.scope === 'trip' ? '旅行包' : `${r.trips} 个旅程`;
    toast(r.missingFiles ? `已恢复${what}，${r.missingFiles} 个附件不在包里，需要重新添加` : `已恢复${what}`);
  } catch {
    toast('不是有效的备份文件');
  }
}
