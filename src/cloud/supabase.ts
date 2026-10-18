// 2026-10-18 同步：Supabase 实现。只在用到同步时才加载（不影响离线和首屏）。
// 权限全部在数据库的行级权限和函数里检查（supabase/schema.sql），这里用的是可公开的 publishable key。
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import type { CloudBackend, CloudInvite, CloudSession } from './backend';
import type { TripSnapshot } from './snapshot';

const BUCKET = 'trip-files';

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const toSession = (u: { id: string; email?: string } | null | undefined): CloudSession | null =>
  u ? { userId: u.id, email: (u.email ?? '').toLowerCase() } : null;

type InviteRow = { id: string; trip_id: string; trip_title: string; email: string; inviter_email: string | null; accepted_at: string | null; created_at: string };
const toInvite = (r: InviteRow): CloudInvite => ({
  id: r.id,
  tripId: r.trip_id,
  tripTitle: r.trip_title,
  email: r.email,
  inviterEmail: r.inviter_email ?? undefined,
  acceptedAt: r.accepted_at ?? undefined,
  createdAt: r.created_at,
});

export function createSupabaseBackend(): CloudBackend {
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'trip-sync-auth' },
  });

  return {
    async getSession() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session?.user);
    },
    onSessionChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s?.user)));
      return () => data.subscription.unsubscribe();
    },
    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
      if (error) throw new Error(error.message);
    },
    async verifyCode(email, code) {
      const { data, error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
      if (error) throw new Error(error.message);
      const s = toSession(data.user);
      if (!s) throw new Error('登录失败');
      return s;
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async createTrip(id, title) {
      must(await sb.rpc('create_cloud_trip', { p_id: id, p_title: title }));
    },
    async publish(tripId, note, important, snapshot: TripSnapshot, title) {
      return must(await sb.rpc('publish_version', { p_trip: tripId, p_note: note, p_important: important, p_snapshot: snapshot, p_title: title })) as number;
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
      const rows = must(await sb.from('trip_members').select('user_id,email,role').eq('trip_id', tripId)) as { user_id: string; email: string; role: 'owner' | 'member' }[];
      return rows.map((r) => ({ userId: r.user_id, email: r.email, role: r.role }));
    },
    async tripInvites(tripId) {
      const rows = must(await sb.from('trip_invites').select('*').eq('trip_id', tripId).order('created_at')) as InviteRow[];
      return rows.map(toInvite);
    },
    async invite(tripId, email) {
      must(await sb.rpc('invite_member', { p_trip: tripId, p_email: email.trim().toLowerCase() }));
    },
    async revokeInvite(inviteId) {
      must(await sb.from('trip_invites').delete().eq('id', inviteId));
    },
    async removeMember(tripId, userId) {
      must(await sb.rpc('remove_member', { p_trip: tripId, p_user: userId }));
    },
    async myInvites() {
      const s = toSession((await sb.auth.getUser()).data.user);
      if (!s) return [];
      const rows = must(await sb.from('trip_invites').select('*').eq('email', s.email).is('accepted_at', null).order('created_at')) as InviteRow[];
      return rows.map(toInvite);
    },
    async acceptInvite(inviteId) {
      return must(await sb.rpc('accept_invite', { p_invite: inviteId })) as string;
    },
    async leaveTrip(tripId) {
      const s = toSession((await sb.auth.getUser()).data.user);
      if (!s) return;
      must(await sb.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', s.userId));
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
