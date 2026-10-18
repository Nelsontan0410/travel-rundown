// 2026-10-18 同步：云端接口。正式环境用 Supabase（supabase.ts，按需加载）；
// 自动测试可以换成模拟后端（setBackend，或浏览器测试在页面上放 window.__CLOUD_FAKE__）。
import type { TripSnapshot } from './snapshot';

/** 每台手机一个身份（Supabase 匿名登录），不用邮箱 */
export interface CloudSession {
  userId: string;
}

export interface CloudTripInfo {
  id: string;
  title: string;
  version: number;
  note?: string;
  important: boolean;
  updatedAt: string;
}

export interface CloudVersion {
  version: number;
  note?: string;
  important: boolean;
  snapshot: TripSnapshot;
  createdAt: string;
}

export interface CloudMember {
  userId: string;
  name?: string;
  role: 'owner' | 'member';
}

/** 主用户生成的邀请码 */
export interface CloudInvite {
  id: string;
  tripId: string;
  code: string;
  /** 给谁的（主用户填的名字） */
  name?: string;
  acceptedAt?: string;
  createdAt: string;
}

/** 加入前看到的邀请资料 */
export interface InvitePeek {
  tripId: string;
  tripTitle: string;
  inviterName?: string;
  name?: string;
  /** 还能用（没被别的手机用过，也不是自己的旅程） */
  usable: boolean;
  /** 自己已经是成员 / 主用户 */
  mine: boolean;
}

export interface CloudBackend {
  getSession(): Promise<CloudSession | null>;
  /** 没有身份就自动建一个（匿名） */
  ensureSession(): Promise<CloudSession>;
  onSessionChange(cb: (s: CloudSession | null) => void): () => void;

  createTrip(id: string, title: string, name: string): Promise<void>;
  publish(tripId: string, note: string, important: boolean, snapshot: TripSnapshot, title: string): Promise<number>;
  /** 这些旅程在云端的最新版本（只返回自己是成员的） */
  latest(tripIds: string[]): Promise<CloudTripInfo[]>;
  /** 不传 version 取最新版 */
  fetchVersion(tripId: string, version?: number): Promise<CloudVersion | null>;

  members(tripId: string): Promise<CloudMember[]>;
  tripInvites(tripId: string): Promise<CloudInvite[]>;
  /** 生成邀请码，返回邀请码 */
  createInvite(tripId: string, name: string): Promise<string>;
  revokeInvite(inviteId: string): Promise<void>;
  removeMember(tripId: string, userId: string): Promise<void>;
  peekInvite(code: string): Promise<InvitePeek | null>;
  /** 用邀请码加入，返回旅程 id */
  joinWithCode(code: string, name: string): Promise<string>;
  leaveTrip(tripId: string): Promise<void>;

  /** 共享文件：已存在就跳过 */
  upload(path: string, blob: Blob): Promise<void>;
  download(path: string): Promise<Blob>;
}

let current: CloudBackend | null = null;
let loading: Promise<CloudBackend> | null = null;

export function setBackend(b: CloudBackend | null): void {
  current = b;
  loading = null;
}

/** 取得云端接口：测试用的模拟后端优先，否则按需加载 Supabase */
export async function backend(): Promise<CloudBackend> {
  if (current) return current;
  const fake = (globalThis as { __CLOUD_FAKE__?: CloudBackend }).__CLOUD_FAKE__;
  if (fake) return (current = fake);
  if (!loading) loading = import('./supabase').then((m) => (current = m.createSupabaseBackend()));
  return loading;
}

/** 把云端返回的错误转成给人看的中文 */
export function cloudErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return '连不上同步服务，请检查网络后再试';
  if (/rate limit|too many/i.test(msg)) return '请求太频繁，请过几分钟再试';
  if (/anonymous sign-ins are disabled/i.test(msg)) return '同步服务还没打开匿名登录（Supabase → Authentication → Sign In / Providers → Allow anonymous sign-ins）';
  if (/JWT|not authenticated|请先登录/i.test(msg)) return '同步身份失效了，请重新打开 App 再试';
  return msg || '同步失败，请稍后再试';
}
