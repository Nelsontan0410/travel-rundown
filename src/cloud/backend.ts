// 2026-10-18 同步：云端接口。正式环境用 Supabase（supabase.ts，按需加载）；
// 自动测试可以换成模拟后端（setBackend，或浏览器测试在页面上放 window.__CLOUD_FAKE__）。
import type { TripSnapshot } from './snapshot';

export interface CloudSession {
  userId: string;
  email: string;
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
  email: string;
  role: 'owner' | 'member';
}

export interface CloudInvite {
  id: string;
  tripId: string;
  tripTitle: string;
  email: string;
  inviterEmail?: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface CloudBackend {
  getSession(): Promise<CloudSession | null>;
  onSessionChange(cb: (s: CloudSession | null) => void): () => void;
  /** 发 6 位验证码到邮箱 */
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<CloudSession>;
  signOut(): Promise<void>;

  createTrip(id: string, title: string): Promise<void>;
  publish(tripId: string, note: string, important: boolean, snapshot: TripSnapshot, title: string): Promise<number>;
  /** 这些旅程在云端的最新版本（只返回自己是成员的） */
  latest(tripIds: string[]): Promise<CloudTripInfo[]>;
  /** 不传 version 取最新版 */
  fetchVersion(tripId: string, version?: number): Promise<CloudVersion | null>;

  members(tripId: string): Promise<CloudMember[]>;
  tripInvites(tripId: string): Promise<CloudInvite[]>;
  invite(tripId: string, email: string): Promise<void>;
  revokeInvite(inviteId: string): Promise<void>;
  removeMember(tripId: string, userId: string): Promise<void>;
  /** 发给我邮箱、还没接受的邀请 */
  myInvites(): Promise<CloudInvite[]>;
  acceptInvite(inviteId: string): Promise<string>;
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
  if (/Token has expired|invalid.*(otp|token)|otp/i.test(msg)) return '验证码不对或已过期，请重新获取';
  if (/JWT|not authenticated|请先登录/i.test(msg)) return '登录已过期，请重新登录';
  return msg || '同步失败，请稍后再试';
}
