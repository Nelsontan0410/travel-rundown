// 2026-10-18 同步：启动时恢复身份、定期检查新版本。
// 2026-10-26 账号：主用户用 Google 或邮箱登录，旅程存在云端，换手机 / 清缓存后重新登录就能找回。
// 同伴仍可以先用匿名身份加入（每台手机自动建一个），之后在「账号」里绑定 Google / 邮箱。
// 没用过同步的人不会加载 Supabase，也不会联网。
import { db } from '../db/schema';
import { useCloud } from '../store/cloud';
import { backend, cloudErrorText, type CloudSession } from './backend';
import { applyUpdate, checkUpdates } from './sync';
import { loadEvents, watchEvents } from './notify';
import { toast } from '../store/ui';

const USED_KEY = 'trip-sync-used';
const NAME_KEY = 'trip-sync-name';

export function markCloudUsed(): void {
  markUsed();
}

function markUsed() {
  try {
    localStorage.setItem(USED_KEY, '1');
  } catch {
    /* 隐私模式等存不了也没关系 */
  }
}

async function everUsed(): Promise<boolean> {
  try {
    if (localStorage.getItem(USED_KEY)) return true;
  } catch {
    /* ignore */
  }
  return (await db.trips.toArray()).some((t) => !!t.cloud);
}

/** 自己在同步里显示的名字（存在这台手机上） */
export function myName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setMyName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* ignore */
  }
}

let started = false;
let timer: ReturnType<typeof setInterval> | undefined;

/** 检查新版本；离线或出错时安静地记下原因 */
export async function refreshCloud(): Promise<void> {
  const be = await backend();
  const session = await be.getSession();
  useCloud.setState({ session });
  if (!session) return useCloud.setState({ updates: {} });
  try {
    const [updates] = await Promise.all([checkUpdates(), loadEvents()]);
    useCloud.setState({ updates, lastError: undefined });
    void watchEvents(() => void refreshCloud());
  } catch (e) {
    useCloud.setState({ lastError: cloudErrorText(e) });
  }
}

/** App 启动时调用一次 */
export async function initCloud(force = false): Promise<void> {
  if (started) return;
  if (!force && !(await everUsed())) {
    useCloud.setState({ session: null });
    return;
  }
  started = true;
  markUsed();
  const be = await backend();
  be.onSessionChange((s) => {
    useCloud.setState({ session: s });
    if (s) void refreshCloud().then(() => autoRestore());
  });
  await refreshCloud();
  void autoRestore();
  if (typeof document === 'undefined') return; // 没有页面（自动测试）就不挂定时检查
  const tick = () => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) void refreshCloud();
  };
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
  timer = setInterval(tick, 5 * 60_000);
}

export function stopCloudForTests() {
  if (timer) clearInterval(timer);
  started = false;
}

/** 开启同步 / 加入旅程前调用：没有身份就自动建一个 */
export async function ensureCloudSession(): Promise<CloudSession> {
  const be = await backend();
  const s = await be.ensureSession();
  useCloud.setState({ session: s });
  await initCloud(true);
  return s;
}


// ———————— 账号（2026-10-26） ————————

/** 有账号（不是匿名）才算「找得回来」 */
export const hasAccount = (s: CloudSession | null | undefined): boolean => !!s && !s.anonymous;

/** 请浏览器尽量别清掉这个网站的资料（iOS / 安卓空间紧张时会自动清）。不保证，但没有坏处 */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}

async function afterAuth(): Promise<void> {
  const be = await backend();
  const session = await be.getSession();
  useCloud.setState({ session });
  await initCloud(true);
  await refreshCloud();
}

/** Google 登录：会跳到 Google 再回到这个网站（回来后自动恢复登录并找回旅程） */
export async function signInWithGoogle(): Promise<void> {
  markUsed();
  const be = await backend();
  await be.signInGoogle();
}

/** 邮箱注册；返回 needsConfirm = 要先去邮箱点确认链接 */
export async function signUpWithEmail(email: string, password: string): Promise<{ needsConfirm: boolean }> {
  markUsed();
  const be = await backend();
  const r = await be.signUpEmail(email, password);
  if (!r.needsConfirm) await afterAuth();
  return r;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  markUsed();
  const be = await backend();
  await be.signInEmail(email, password);
  await afterAuth();
}

export async function signOutAccount(): Promise<void> {
  const be = await backend();
  await be.signOut();
  useCloud.setState({ session: null, updates: {} });
}

export interface RestoreResult {
  restored: string[];
  failed: string[];
}

/**
 * 把这个账号在云端的旅程找回到这台手机：本机还没有的旅程，下载最新发布的版本建成本机旅程。
 * 主用户的旅程找回后仍是主用户（可以继续发布）；完成勾选、实际记账、穿搭打包不上云，找不回来。
 * 本机已经有的旅程不动。
 */
export async function restoreFromCloud(onProgress?: (title: string) => void): Promise<RestoreResult> {
  const be = await backend();
  const session = await be.getSession();
  const out: RestoreResult = { restored: [], failed: [] };
  if (!session) return out;
  const mine = await be.myTrips();
  const local = new Map((await db.trips.toArray()).map((t) => [t.id, t]));
  for (const t of mine) {
    if (local.has(t.id)) continue;
    if (t.version <= 0) continue;
    try {
      onProgress?.(t.title);
      const v = await be.fetchVersion(t.id);
      if (!v) continue;
      await applyUpdate(t.id, v, {}, { ownerName: t.ownerName });
      if (t.role === 'owner') {
        await db.trips.update(t.id, { cloud: { role: 'owner', version: v.version, ownerName: t.ownerName, syncedAt: new Date().toISOString() } });
      }
      out.restored.push(t.title || '未命名旅程');
    } catch {
      out.failed.push(t.title || '未命名旅程');
    }
  }
  if (out.restored.length) await refreshCloud();
  return out;
}

let restoring: Promise<void> | null = null;
/** 登录后（含 Google 回来、换手机）自动找回；失败不打扰，用户可以在「账号」里手动再找 */
function autoRestore(): Promise<void> {
  if (restoring) return restoring;
  restoring = (async () => {
    try {
      const be = await backend();
      const s = await be.getSession();
      if (!hasAccount(s)) return;
      const r = await restoreFromCloud();
      if (r.restored.length) toast(`已从云端找回 ${r.restored.length} 份旅程`);
    } catch {
      /* 离线等：安静跳过 */
    } finally {
      setTimeout(() => {
        restoring = null;
      }, 30_000);
    }
  })();
  return restoring;
}
