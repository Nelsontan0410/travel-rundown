// 2026-10-18 iOS 修复：主屏幕 App 切到后台（去 WhatsApp 复制邀请码、看照片…）再回来时，
// iOS 常会把 IndexedDB 连接断掉（"Connection to Indexed Database server lost"）。
// 之后所有读取都失败，页面就停在空白，要手动刷新才好。
// 这里在回到前台时先探一下数据库；读不到就重新打开，还不行才自动重新载入。
import { db } from './schema';

const LOST = /Connection to Indexed Database server lost|DatabaseClosed|InvalidState|UnknownError|database connection is closing|transaction.*(finished|inactive)/i;

export function isDbLost(e: unknown): boolean {
  const err = e as { name?: string; message?: string; inner?: { name?: string; message?: string } } | null;
  const text = [err?.name, err?.message, err?.inner?.name, err?.inner?.message].filter(Boolean).join(' ');
  return LOST.test(text);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('IndexedDB timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

let fixing: Promise<boolean> | null = null;

/** 关掉再打开数据库，成功返回 true */
export function recoverDb(): Promise<boolean> {
  if (!fixing) {
    fixing = (async () => {
      try {
        console.warn('[db] 连接断了，重新打开');
        db.close({ disableAutoOpen: false });
        await withTimeout(db.open(), 4000);
        await withTimeout(db.settings.get('app'), 2000);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          fixing = null;
        }, 0);
      }
    })();
  }
  return fixing;
}

const reload = () => window.location.reload();

/** 探一下数据库还能不能读；不能就修，修不好就重新载入 */
export async function probeDb(): Promise<void> {
  try {
    await withTimeout(db.settings.get('app'), 1500);
  } catch {
    if (!(await recoverDb())) reload();
  }
}

let installed = false;
export function installDbRecovery(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void probeDb();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void probeDb();
  });
  window.addEventListener('focus', () => void probeDb());
  window.addEventListener('unhandledrejection', (e) => {
    if (isDbLost(e.reason)) void recoverDb().then((ok) => !ok && reload());
  });
}
