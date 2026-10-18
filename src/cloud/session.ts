// 2026-10-18 同步：启动时恢复登录、定期检查新版本和邀请。
// 没用过同步的人不会加载 Supabase，也不会联网。
import { db } from '../db/schema';
import { useCloud } from '../store/cloud';
import { backend, cloudErrorText } from './backend';
import { checkUpdates, myInvites } from './sync';

const USED_KEY = 'trip-sync-used';

function markUsed() {
  try {
    localStorage.setItem(USED_KEY, '1');
  } catch {
    /* 隐私模式等存不了也没关系 */
  }
}

/** 点邮件里的登录链接回来时，网址后面带着登录信息 */
const fromLoginLink = () => /access_token=|error_description=/.test(location.hash);

async function everUsed(): Promise<boolean> {
  if (fromLoginLink()) return true;
  try {
    if (localStorage.getItem(USED_KEY)) return true;
  } catch {
    /* ignore */
  }
  return (await db.trips.toArray()).some((t) => !!t.cloud);
}

let started = false;
let timer: ReturnType<typeof setInterval> | undefined;

/** 检查新版本和邀请；离线或出错时安静地记下原因 */
export async function refreshCloud(): Promise<void> {
  const be = await backend();
  const session = await be.getSession();
  useCloud.setState({ session });
  if (!session) return useCloud.setState({ updates: {}, invites: [] });
  try {
    const [updates, invites] = await Promise.all([checkUpdates(), myInvites()]);
    useCloud.setState({ updates, invites, lastError: undefined });
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

export async function sendLoginCode(email: string): Promise<void> {
  const be = await backend();
  await be.sendCode(email);
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const be = await backend();
  const s = await be.verifyCode(email, code);
  useCloud.setState({ session: s });
  await initCloud(true);
  await refreshCloud();
}

export async function signOutCloud(): Promise<void> {
  const be = await backend();
  await be.signOut();
  useCloud.setState({ session: null, updates: {}, invites: [] });
}
