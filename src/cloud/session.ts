// 2026-10-18 同步：启动时恢复身份、定期检查新版本。
// 不用邮箱：每台手机第一次用同步时自动建一个身份（Supabase 匿名登录），存在这台手机上。
// 没用过同步的人不会加载 Supabase，也不会联网。
import { db } from '../db/schema';
import { useCloud } from '../store/cloud';
import { backend, cloudErrorText, type CloudSession } from './backend';
import { checkUpdates } from './sync';

const USED_KEY = 'trip-sync-used';
const NAME_KEY = 'trip-sync-name';

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
    const updates = await checkUpdates();
    useCloud.setState({ updates, lastError: undefined });
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
    if (s) void refreshCloud();
  });
  await refreshCloud();
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
