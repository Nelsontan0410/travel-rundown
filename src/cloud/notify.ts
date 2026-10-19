// 2026-10-19 通知：谁发布了更新、谁加入 / 退出，同步中的每个人都会收到。
//  · 应用内：底部「通知」页和红点（打开 App、回到前台、每 5 分钟、以及实时推送时更新）
//  · 手机系统通知：用户在通知页打开后，App 在后台时有新通知会弹出（App 完全关掉时收不到，见通知页说明）
import { db } from '../db/schema';
import { useCloud } from '../store/cloud';
import { toast } from '../store/ui';
import { backend, type CloudEvent } from './backend';

const SEEN_KEY = 'trip-notify-seen';
const PUSH_KEY = 'trip-notify-push';
const NOTIFIED_KEY = 'trip-notify-shown';

const ls = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

async function cloudTrips() {
  return (await db.trips.toArray()).filter((t) => !!t.cloud);
}

/** 合并新通知（按 id 去重，最多留 200 条） */
function merge(list: CloudEvent[]) {
  if (!list.length) return;
  const cur = useCloud.getState().events;
  const byId = new Map(cur.map((e) => [e.id, e]));
  for (const e of list) byId.set(e.id, e);
  const events = [...byId.values()].sort((a, b) => a.id - b.id).slice(-200);
  useCloud.setState({ events });
}

/** 拉取本机同步中旅程的通知 */
export async function loadEvents(): Promise<CloudEvent[]> {
  const trips = await cloudTrips();
  if (!trips.length) return [];
  const be = await backend();
  const last = useCloud.getState().events.at(-1)?.id;
  const fresh = await be.events(
    trips.map((t) => t.id),
    last,
  );
  merge(fresh);
  void systemNotify(fresh);
  return fresh;
}

let unwatch: (() => void) | null = null;
/** 实时收通知（登录后调用一次） */
export async function watchEvents(onPublish: () => void): Promise<void> {
  if (unwatch) return;
  const be = await backend();
  unwatch = be.watchEvents((e) => {
    void (async () => {
      const t = await db.trips.get(e.tripId);
      if (!t?.cloud) return;
      merge([e]);
      void systemNotify([e]);
      // App 开着时：顶部小提示
      if (document.visibilityState === 'visible' && e.actorId !== useCloud.getState().session?.userId) toast(`${t.title}：${e.title}`);
      if (e.kind === 'publish') onPublish();
    })();
  });
}
export function stopWatchForTests() {
  unwatch?.();
  unwatch = null;
}

/** 通知页打开时：全部标为已读 */
export function markAllSeen() {
  const last = useCloud.getState().events.at(-1)?.id ?? 0;
  if (last <= useCloud.getState().seenId) return;
  ls.set(SEEN_KEY, String(last));
  useCloud.setState({ seenId: last });
}

// ———————— 手机系统通知 ————————

export const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
export const pushOn = () => pushSupported() && ls.get(PUSH_KEY) === '1' && Notification.permission === 'granted';

/** 打开手机通知（会弹出系统授权）；返回是否成功 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (p !== 'granted') return false;
  ls.set(PUSH_KEY, '1');
  // 以前的通知不再补弹
  ls.set(NOTIFIED_KEY, String(useCloud.getState().events.at(-1)?.id ?? 0));
  return true;
}
export function disablePush() {
  ls.set(PUSH_KEY, '0');
}

/** 通知点开后去哪一页 */
export async function eventLink(e: CloudEvent): Promise<string> {
  const t = await db.trips.get(e.tripId);
  if (!t) return '/trips';
  if (e.kind === 'publish' && t.cloud?.role === 'member') {
    return (e.detail.version ?? 0) > (t.cloud.version ?? 0) ? `/trip/${e.tripId}/update` : `/itinerary/${e.tripId}`;
  }
  if (t.cloud?.role === 'owner') return `/trip/${e.tripId}/settings#sync`;
  return `/itinerary/${e.tripId}`;
}

export function eventBody(e: CloudEvent): string {
  const parts: string[] = [];
  if (e.detail.note) parts.push(e.detail.note);
  const s = e.detail.summary;
  if (s?.lines?.length) parts.push(s.lines.slice(0, 3).join('；'));
  return parts.join('\n');
}

async function systemNotify(list: CloudEvent[]) {
  if (!pushOn() || document.visibilityState === 'visible') return;
  const me = useCloud.getState().session?.userId;
  const shown = Number(ls.get(NOTIFIED_KEY) || 0);
  const todo = list.filter((e) => e.id > shown && e.actorId !== me);
  if (!todo.length) return;
  ls.set(NOTIFIED_KEY, String(Math.max(...todo.map((e) => e.id))));
  const reg = await navigator.serviceWorker.ready;
  for (const e of todo.slice(-3)) {
    const t = await db.trips.get(e.tripId);
    await reg.showNotification(t ? `${t.title}：${e.title}` : e.title, {
      body: eventBody(e),
      tag: `trip-event-${e.id}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: await eventLink(e) },
    });
  }
}
