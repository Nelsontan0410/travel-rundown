import { copyText } from '../lib/files';
import { toast } from '../store/ui';

/** 打开外部链接（导航、翻译）。打不开时 Toast「无法打开链接，已复制地点」，并把地点文字复制到剪贴板。 */
export function openExternal(url: string, fallbackCopy?: string): void {
  let w: Window | null = null;
  try {
    w = window.open(url, '_blank');
    if (w) w.opener = null;
  } catch {
    w = null;
  }
  if (w) return;
  if (fallbackCopy) void copyText(fallbackCopy).then(() => toast('无法打开链接，已复制地点'));
  else toast('无法打开链接');
}

export async function copyWithToast(text: string): Promise<void> {
  const ok = await copyText(text);
  toast(ok ? '已复制' : '复制失败');
}
