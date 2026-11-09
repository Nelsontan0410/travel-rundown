// 2026-10-18 同步：Supabase 实现。只在用到同步时才加载（不影响离线和首屏）。
// 权限全部在数据库的行级权限和函数里检查（supabase/schema.sql），这里用的是可公开的 publishable key。
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import type { CloudAccountTrip, CloudBackend, CloudEvent, CloudInvite, CloudSession, CloudSuggestion } from './backend';
import type { TripSnapshot } from './snapshot';

const BUCKET = 'trip-files';

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

type AuthUser = { id: string; email?: string | null; is_anonymous?: boolean };
const toSession = (u: AuthUser | null | undefined): CloudSession | null =>
  u ? { userId: u.id, email: u.email || undefined, anonymous: !!u.is_anonymous } : null;

type EventRow = { id: number; trip_id: string; actor_id: string | null; actor_name: string | null; kind: string; title: string; detail: CloudEvent['detail'] | null; created_at: string };
const toEvent = (r: EventRow): CloudEvent => ({
  id: Number(r.id),
  tripId: r.trip_id,
  actorId: r.actor_id ?? undefined,
  actorName: r.actor_name ?? undefined,
  kind: r.kind,
  title: r.title,
  detail: r.detail ?? {},
  createdAt: r.created_at,
});

type SuggestionRow = { id: string; trip_id: string; author_id: string; author_name: string | null; base_version: number; note: string | null; changes: CloudSuggestion['changes']; status: CloudSuggestion['status']; decisions: CloudSuggestion['decisions'] | null; created_at: string; decided_at: string | null };
const toSuggestion = (r: SuggestionRow): CloudSuggestion => ({
  id: r.id,
  tripId: r.trip_id,
  authorId: r.author_id,
  authorName: r.author_name ?? undefined,
  baseVersion: r.base_version,
  note: r.note ?? undefined,
  changes: r.changes ?? [],
  status: r.status,
  decisions: r.decisions ?? undefined,
  createdAt: r.created_at,
  decidedAt: r.decided_at ?? undefined,
});

type InviteRow = { id: string; trip_id: string; code: string | null; name: string | null; accepted_at: string | null; created_at: string };
const toInvite = (r: InviteRow): CloudInvite => ({
  id: r.id,
  tripId: r.trip_id,
  code: r.code ?? '',
  name: r.name ?? undefined,
  acceptedAt: r.accepted_at ?? undefined,
  createdAt: r.created_at,
});

export function createSupabaseBackend(): CloudBackend {
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    // 2026-10-26：Google 登录回来时网址里带授权码（pkce），由这里自动换成登录状态
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'trip-sync-auth' },
  });
  const me = async () => toSession((await sb.auth.getSession()).data.session?.user);
  const rawUser = async () => (await sb.auth.getSession()).data.session?.user;
  const back = () => `${window.location.origin}/`;

  return {
    getSession: me,
    async ensureSession() {
      const s = await me();
      if (s) return s;
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw new Error(error.message);
      const n = toSession(data.user);
      if (!n) throw new Error('同步身份建立失败');
      return n;
    },
    async signInGoogle() {
      const u = await rawUser();
      // 当前是匿名身份：绑定 Google（user id 不变，已加入的旅程不丢）；否则正常登录
      const r = u?.is_anonymous
        ? await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: back() } })
        : await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back() } });
      if (r.error) throw new Error(r.error.message);
    },
    async signUpEmail(email, password) {
      const u = await rawUser();
      if (u?.is_anonymous) {
        // 匿名身份升级成邮箱账号：user id 不变
        const { error } = await sb.auth.updateUser({ email: email.trim(), password }, { emailRedirectTo: back() });
        if (error) throw new Error(error.message);
        return { needsConfirm: true };
      }
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: back() } });
      if (error) throw new Error(error.message);
      // 邮箱已注册时 Supabase 不报错，只返回没有 identities 的用户
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered');
      return { needsConfirm: !data.session };
    },
    async signInEmail(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) throw new Error(error.message);
    },
    async myTrips() {
      const s = await me();
      if (!s) return [];
      type Row = { trip_id: string; role: 'owner' | 'member'; cloud_trips: { id: string; title: string; latest_version: number } | { id: string; title: string; latest_version: number }[] | null };
      const rows = must(await sb.from('trip_members').select('trip_id,role,cloud_trips(id,title,latest_version)').eq('user_id', s.userId)) as unknown as Row[];
      const ids = rows.map((r) => r.trip_id);
      const owners = ids.length ? (must(await sb.from('trip_members').select('trip_id,name').in('trip_id', ids).eq('role', 'owner')) as { trip_id: string; name: string | null }[]) : [];
      const ownerName = new Map(owners.map((o) => [o.trip_id, o.name ?? undefined]));
      return rows.flatMap((r): CloudAccountTrip[] => {
        const t = Array.isArray(r.cloud_trips) ? r.cloud_trips[0] : r.cloud_trips;
        return t ? [{ id: t.id, title: t.title, role: r.role, version: t.latest_version, ownerName: ownerName.get(r.trip_id) }] : [];
      });
    },
    onSessionChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s?.user)));
      return () => data.subscription.unsubscribe();
    },

    async createTrip(id, title, name) {
      must(await sb.rpc('create_cloud_trip', { p_id: id, p_title: title, p_name: name }));
    },
    async publish(tripId, note, important, snapshot: TripSnapshot, title, summary) {
      return must(await sb.rpc('publish_version', { p_trip: tripId, p_note: note, p_important: important, p_snapshot: snapshot, p_title: title, p_summary: summary ?? null })) as number;
    },
    async latest(tripIds) {
      if (!tripIds.length) return [];
      const rows = must(
        await sb.from('cloud_trips').select('id,title,latest_version,latest_note,latest_important,updated_at').in('id', tripIds),
      ) as { id: string; title: string; latest_version: number; latest_note: string | null; latest_important: boolean; updated_at: string }[];
      return rows.map((r) => ({ id: r.id, title: r.title, version: r.latest_version, note: r.latest_note ?? undefined, important: r.latest_important, updatedAt: r.updated_at }));
    },
    async fetchVersion(tripId, version) {
      let q = sb.from('trip_versions').select('version,note,important,snapshot,created_at').eq('trip_id', tripId);
      q = version ? q.eq('version', version) : q.order('version', { ascending: false }).limit(1);
      const rows = must(await q) as { version: number; note: string | null; important: boolean; snapshot: TripSnapshot; created_at: string }[];
      const r = rows[0];
      return r ? { version: r.version, note: r.note ?? undefined, important: r.important, snapshot: r.snapshot, createdAt: r.created_at } : null;
    },

    async members(tripId) {
      const rows = must(await sb.from('trip_members').select('user_id,name,role').eq('trip_id', tripId).order('joined_at')) as { user_id: string; name: string | null; role: 'owner' | 'member' }[];
      return rows.map((r) => ({ userId: r.user_id, name: r.name ?? undefined, role: r.role }));
    },
    async tripInvites(tripId) {
      const rows = must(await sb.from('trip_invites').select('id,trip_id,code,name,accepted_at,created_at').eq('trip_id', tripId).not('code', 'is', null).order('created_at')) as InviteRow[];
      return rows.map(toInvite);
    },
    async createInvite(tripId, name) {
      return must(await sb.rpc('create_invite', { p_trip: tripId, p_name: name })) as string;
    },
    async revokeInvite(inviteId) {
      must(await sb.from('trip_invites').delete().eq('id', inviteId));
    },
    async removeMember(tripId, userId) {
      must(await sb.rpc('remove_member', { p_trip: tripId, p_user: userId }));
    },
    async peekInvite(code) {
      const rows = must(await sb.rpc('peek_invite', { p_code: code })) as { trip_id: string; trip_title: string; inviter_name: string | null; name: string | null; usable: boolean; mine: boolean }[];
      const r = rows?.[0];
      return r ? { tripId: r.trip_id, tripTitle: r.trip_title, inviterName: r.inviter_name ?? undefined, name: r.name ?? undefined, usable: !!r.usable, mine: !!r.mine } : null;
    },
    async joinWithCode(code, name) {
      return must(await sb.rpc('join_with_code', { p_code: code, p_name: name })) as string;
    },
    async leaveTrip(tripId) {
      const s = await me();
      if (!s) return;
      must(await sb.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', s.userId));
    },

    async submitSuggestion(tripId, baseVersion, note, changes, summary) {
      return must(await sb.rpc('submit_suggestion', { p_trip: tripId, p_base: baseVersion, p_note: note, p_changes: changes, p_summary: summary ?? null })) as string;
    },
    async suggestions(tripId) {
      const rows = must(await sb.from('trip_suggestions').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(50)) as SuggestionRow[];
      return rows.map(toSuggestion);
    },
    async decideSuggestion(id, decisions, accepted, rejected) {
      must(await sb.rpc('decide_suggestion', { p_id: id, p_decisions: decisions, p_accepted: accepted, p_rejected: rejected }));
    },
    async withdrawSuggestion(id) {
      must(await sb.from('trip_suggestions').delete().eq('id', id).eq('status', 'pending'));
    },

    async events(tripIds, afterId) {
      if (!tripIds.length) return [];
      let q = sb.from('trip_events').select('*').in('trip_id', tripIds).order('id', { ascending: false }).limit(100);
      if (afterId) q = q.gt('id', afterId);
      const rows = must(await q) as EventRow[];
      return rows.map(toEvent).reverse();
    },
    watchEvents(cb) {
      const ch = sb
        .channel('trip-events')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_events' }, (p) => cb(toEvent(p.new as EventRow)))
        .subscribe();
      return () => {
        void sb.removeChannel(ch);
      };
    },

    async upload(path, blob) {
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' });
      // 内容地址：同一个 sha256 已经传过就不用再传
      if (error && !/exists|Duplicate|409/i.test(error.message)) throw new Error(error.message);
    },
    async download(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(error?.message ?? '文件下载失败');
      return data;
    },
  };
}
