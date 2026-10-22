import { copyText } from '../lib/files';
import { toast } from '../store/ui';
import { amapAppUrl, mobileOs } from './maps';

/** 打开外部链接（导航、翻译）。打不开时 Toast「无法打开链接，已复制地点」，并把地点文字复制到剪贴板。 */
export function openExternal(url: string, fallbackCopy?: string): void {
  if (openAmapApp(url)) return;
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

export async function copyWithToast(text: string, okMsg = '已复制'): Promise<void> {
  const ok = await copyText(text);
  toast(ok ? okMsg : '复制失败');
}

/**
 * 手机上的高德链接直接拉起高德 App：
 * Android 用 intent（没装 App 浏览器自己开网页版）；iOS 用 iosamap://，1.5 秒后页面还在前台就当没装，改开网页版。
 */
function openAmapApp(url: string): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const os = mobileOs(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const app = amapAppUrl(url, os);
  if (!app) return false;
  if (os === 'ios') {
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') window.location.href = url;
    }, 1500);
    const cancel = () => {
      if (document.visibilityState === 'hidden') window.clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', cancel, { once: true });
  }
  window.location.href = app;
  return true;
}
