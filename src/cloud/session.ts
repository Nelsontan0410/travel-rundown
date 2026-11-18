// 2026-10-18 同步：启动时恢复身份、定期检查新版本。
// 2026-10-26 账号：主用户用 Google 或邮箱登录，旅程存在云端，换手机 / 清缓存后重新登录就能找回。
// 同伴仍可以先用匿名身份加入（每台手机自动建一个），之后在「账号」里绑定 Google / 邮箱。
// 没用过同步的人不会加载 Supabase，也不会联网。
import { db } from '../db/schema';
import { deleteTrip } from '../db/repo';
import { useCloud } from '../store/cloud';
import { backend, cloudErrorText, type CloudSession } from './backend';
import { applyUpdate, checkUpdates, enableSync } from './sync';
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
    if (s && hasAccount(s)) rememberAccount(s);
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
  if (session && hasAccount(session)) rememberAccount(session);
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
  forgetAccount(); // 退出后马上回到登录页；本机数据隐藏但保留，同一个账号再登录就恢复
  const be = await backend();
  try {
    await be.signOut();
  } finally {
    useCloud.setState({ session: null, updates: {} });
  }
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


// ———————— 登录门禁（2026-11-15） ————————
// 登录了才能看到行程。云端只有一份：主用户和同伴登录后看到的都是云端那一份。
// 本机另存一个「已登录」记号，出国没网时也能打开（离线时 Supabase 没法刷新登录状态）。

const ACCOUNT_KEY = 'trip-account';
const OWNER_KEY = 'trip-local-owner';
const AFTER_LOGIN_KEY = 'trip-after-login';

export interface AccountMarker {
  userId: string;
  email?: string;
}

function readMarker(key: string): AccountMarker | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as AccountMarker;
    return v && typeof v.userId === 'string' ? v : null;
  } catch {
    return null;
  }
}
function writeMarker(key: string, v: AccountMarker | null): void {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 这台设备上最近登录的账号（退出登录后为空） */
export const accountMarker = (): AccountMarker | null => readMarker(ACCOUNT_KEY);
export function rememberAccount(s: CloudSession): void {
  writeMarker(ACCOUNT_KEY, { userId: s.userId, email: s.email });
}
export function forgetAccount(): void {
  writeMarker(ACCOUNT_KEY, null);
}

/** 这台设备上的本机数据属于哪个账号（第一次登录时认领） */
export const localOwner = (): AccountMarker | null => readMarker(OWNER_KEY);

/**
 * 登录后检查本机数据：还没有主人 → 认领给当前账号；是当前账号的 → 正常；是别的账号的 → 'other'（不显示，让用户选）。
 */
export function checkLocalOwner(s: CloudSession): 'ok' | 'other' {
  const owner = localOwner();
  if (!owner) {
    writeMarker(OWNER_KEY, { userId: s.userId, email: s.email });
    return 'ok';
  }
  return owner.userId === s.userId ? 'ok' : 'other';
}

/** 把这台设备上的本机数据清空，并交给当前账号（私人资料「仅本机」也会一起清掉） */
export async function clearLocalDataFor(s: CloudSession): Promise<void> {
  for (const t of db.tables) await t.clear();
  for (const k of [NAME_KEY]) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  writeMarker(OWNER_KEY, { userId: s.userId, email: s.email });
  useCloud.setState({ updates: {}, events: [] });
}

/** 邀请链接：先登录，登录后回到这个链接 */
export function rememberAfterLogin(path: string): void {
  try {
    sessionStorage.setItem(AFTER_LOGIN_KEY, path);
    localStorage.setItem(AFTER_LOGIN_KEY, path); // Google 登录会离开本页再回来，sessionStorage 不一定还在
  } catch {
    /* ignore */
  }
}
export function takeAfterLogin(): string | null {
  try {
    const v = localStorage.getItem(AFTER_LOGIN_KEY) || sessionStorage.getItem(AFTER_LOGIN_KEY);
    localStorage.removeItem(AFTER_LOGIN_KEY);
    sessionStorage.removeItem(AFTER_LOGIN_KEY);
    return v && v.startsWith('/join/') ? v : null;
  } catch {
    return null;
  }
}

let autoSyncing = false;
/**
 * 云端只有一份：登录后，本机还没有上云的行程（旧行程、新导入的）自动发布成云端那一份，当前账号是主用户。
 * 私人资料（仅本机）不会上传。失败的下次再试（没网、文件太大等）。
 */
export async function autoSyncLocalTrips(onStart?: (n: number) => void): Promise<{ done: number; failed: number }> {
  const out = { done: 0, failed: 0 };
  if (autoSyncing) return out;
  autoSyncing = true;
  try {
    const be = await backend();
    const s = await be.getSession();
    if (!hasAccount(s)) return out;
    const trips = (await db.trips.toArray()).filter((t) => !t.cloud);
    if (!trips.length) return out;
    onStart?.(trips.length);
    const name = myName() || s!.email?.split('@')[0] || '我';
    for (const t of trips) {
      try {
        await enableSync(t.id, name);
        out.done++;
      } catch {
        out.failed++;
      }
    }
    if (out.done) {
      markUsed();
      await refreshCloud();
    }
    return out;
  } finally {
    autoSyncing = false;
  }
}

/**
 * 2026-11-18 删除旅程：本机删除前，先处理云端，不然登录后会被「自动找回」重新下载。
 * 主用户 → 删除云端旅程（所有设备和同伴都看不到了）；同伴 → 退出这份旅程。
 * 云端失败（没网等）就抛错、本机不删，免得删了又跑回来。没开同步的旅程只删本机。
 */
export async function deleteTripEverywhere(tripId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (trip?.cloud) {
    const be = await backend();
    if (await be.getSession()) {
      if (trip.cloud.role === 'owner') await be.deleteCloudTrip(tripId);
      else await be.leaveTrip(tripId);
    }
  }
  await deleteTrip(tripId);
  if (trip?.cloud) await refreshCloud().catch(() => undefined);
}
