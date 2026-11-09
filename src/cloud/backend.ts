// 2026-10-18 同步：云端接口。正式环境用 Supabase（supabase.ts，按需加载）；
// 自动测试可以换成模拟后端（setBackend，或浏览器测试在页面上放 window.__CLOUD_FAKE__）。
import type { TripSnapshot } from './snapshot';
import type { Item } from '../domain/types';

/**
 * 同步身份。2026-10-26 起主用户用账号（Google 或邮箱）登录，换手机、清缓存后重新登录就能找回；
 * 同伴仍可先用匿名身份加入（anonymous = true），之后在「账号」里绑定 Google / 邮箱，不会丢失已加入的旅程。
 */
export interface CloudSession {
  userId: string;
  email?: string;
  /** 匿名身份（还没绑定账号）：清除网站资料后无法找回 */
  anonymous?: boolean;
}

/** 这个账号在云端的旅程（主用户或同伴），用来在新手机上找回 */
export interface CloudAccountTrip {
  id: string;
  title: string;
  role: 'owner' | 'member';
  /** 云端最新版本号（0 = 还没发布过） */
  version: number;
  ownerName?: string;
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

/** 2026-10-19 通知：旅程里发生的事 */
export interface CloudEvent {
  id: number;
  tripId: string;
  actorId?: string;
  actorName?: string;
  kind: 'publish' | 'join' | 'leave' | 'remove' | string;
  title: string;
  detail: {
    version?: number;
    note?: string;
    important?: boolean;
    summary?: PublishSummary;
    /** 建议相关 */
    suggestionId?: string;
    count?: number;
    authorId?: string;
    accepted?: number;
    rejected?: number;
  };
  createdAt: string;
}

/** 发布时附带的改动摘要 */
export interface PublishSummary {
  added?: number;
  changed?: number;
  removed?: number;
  docs?: number;
  trip?: string[];
  /** 前几项改动的标题，例如「新增 · 小樽运河」 */
  lines?: string[];
}

/** 2026-10-19 同伴的一处修改建议（以行程项为单位） */
export interface SuggestionChange {
  op: 'add' | 'change' | 'remove';
  itemId: string;
  /** 在第几天（新增 / 修改 = 改后；删除 = 原来） */
  dayIndex?: number;
  title: string;
  /** 改后的样子（新增、修改） */
  item?: Item;
  /** 同伴提交时手上的主用户版本（修改、删除），用来看主用户之后有没有又改过 */
  base?: Item;
  fields?: string[];
  /** 2026-10-23 共同制作：改的是哪一类内容；没有 = 行程项（旧建议都是行程项） */
  kind?: 'item' | 'trip' | 'day' | 'doc' | 'guide' | 'highlight' | 'food';
  /** 行程项以外：内容自己的 id（itemId 这时是「类型:id」，用来记决定） */
  entityId?: string;
  /** 行程项以外：改后的完整内容（快照形态） */
  data?: unknown;
  /** 行程项以外：提交时手上的主用户版本（修改、删除） */
  baseData?: unknown;
  /** 附件（内容哈希）。版本里没有的已上传到 <旅程>/s/<作者>/<哈希> */
  files?: { hash: string; mime?: string }[];
  /** 一句话说明改后的样子（界面显示用） */
  text?: string;
}

export interface CloudSuggestion {
  id: string;
  tripId: string;
  authorId: string;
  authorName?: string;
  baseVersion: number;
  note?: string;
  changes: SuggestionChange[];
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
  decisions?: Record<string, 'accept' | 'reject'>;
  createdAt: string;
  decidedAt?: string;
}

export interface CloudBackend {
  getSession(): Promise<CloudSession | null>;
  /** 没有身份就自动建一个（匿名） */
  ensureSession(): Promise<CloudSession>;
  onSessionChange(cb: (s: CloudSession | null) => void): () => void;

  /** 2026-10-26 账号：Google 登录（会跳转到 Google 再回来；当前是匿名身份时是「绑定」，保留已加入的旅程） */
  signInGoogle(): Promise<void>;
  /** 邮箱 + 密码注册。needsConfirm = 要先去邮箱点确认链接 */
  signUpEmail(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  signInEmail(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** 这个账号在云端的所有旅程（主用户 + 同伴） */
  myTrips(): Promise<CloudAccountTrip[]>;

  createTrip(id: string, title: string, name: string): Promise<void>;
  publish(tripId: string, note: string, important: boolean, snapshot: TripSnapshot, title: string, summary?: PublishSummary): Promise<number>;
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

  /** 同伴提交建议，返回建议 id */
  submitSuggestion(tripId: string, baseVersion: number, note: string, changes: SuggestionChange[], summary?: PublishSummary): Promise<string>;
  /** 主用户：这份旅程的全部建议；同伴：自己提交的 */
  suggestions(tripId: string): Promise<CloudSuggestion[]>;
  decideSuggestion(id: string, decisions: Record<string, 'accept' | 'reject'>, accepted: number, rejected: number): Promise<void>;
  /** 作者撤回还没处理的建议 */
  withdrawSuggestion(id: string): Promise<void>;

  /** 这些旅程的通知（新的在后，最多 100 条）；afterId 之后的 */
  events(tripIds: string[], afterId?: number): Promise<CloudEvent[]>;
  /** 有新通知时马上告诉我（Supabase Realtime）；不支持就返回空函数 */
  watchEvents(cb: (e: CloudEvent) => void): () => void;

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
  if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不对';
  if (/already registered|already been registered|already exists/i.test(msg)) return '这个邮箱已经注册过了，请直接登录';
  if (/Email not confirmed/i.test(msg)) return '还没确认邮箱：请到邮箱里点确认链接，再回来登录';
  if (/Password should be at least|weak password/i.test(msg)) return '密码太短：至少 6 位';
  if (/valid email|invalid format|Unable to validate email/i.test(msg)) return '邮箱格式不对';
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return 'Google 登录还没在 Supabase 打开（见 docs/sync-setup.md 的「登录方式」）';
  if (/manual linking is disabled/i.test(msg)) return '绑定账号还没打开：Supabase → Authentication → Sign In / Providers → 打开 Allow manual linking';
  if (/already linked|identity.*exists|already.*another user/i.test(msg)) return '这个账号已经绑定了别的身份：先退出，再直接用它登录';
  if (/JWT|not authenticated|请先登录/i.test(msg)) return '同步身份失效了，请重新打开 App 再试';
  return msg || '同步失败，请稍后再试';
}
