// 测试用：内存里的模拟同步后端（规则和 supabase/schema.sql 一致：只有主用户能发布 / 邀请，成员才能读）
import type { CloudBackend, CloudInvite, CloudMember, CloudSession, CloudVersion } from '../cloud/backend';
import type { TripSnapshot } from '../cloud/snapshot';

export interface FakeCloud extends CloudBackend {
  as(email: string | null): void;
  state: {
    trips: Map<string, { id: string; owner: string; title: string; version: number; note?: string; important: boolean; updatedAt: string }>;
    members: { tripId: string; userId: string; email: string; role: 'owner' | 'member' }[];
    invites: CloudInvite[];
    versions: { tripId: string; v: CloudVersion }[];
    files: Map<string, Blob>;
  };
}

export function fakeCloud(): FakeCloud {
  let me: CloudSession | null = null;
  const state: FakeCloud['state'] = { trips: new Map(), members: [], invites: [], versions: [], files: new Map() };
  const listeners = new Set<(s: CloudSession | null) => void>();
  const need = () => {
    if (!me) throw new Error('请先登录');
    return me;
  };
  const isMember = (t: string) => !!me && state.members.some((m) => m.tripId === t && m.userId === me!.userId);
  const isOwner = (t: string) => !!me && state.trips.get(t)?.owner === me.userId;
  let n = 0;
  const id = () => `id-${++n}`;
  const ts = () => new Date(Date.UTC(2026, 9, 18, 0, 0, n++)).toISOString();

  return {
    state,
    as(email) {
      me = email ? { userId: `u:${email}`, email } : null;
      for (const l of listeners) l(me);
    },
    async getSession() {
      return me;
    },
    onSessionChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async sendCode() {},
    async verifyCode(email, code) {
      if (code !== '123456') throw new Error('Token has expired or is invalid');
      this.as(email);
      return me!;
    },
    async signOut() {
      this.as(null);
    },
    async createTrip(tid, title) {
      const s = need();
      if (state.trips.has(tid)) return;
      state.trips.set(tid, { id: tid, owner: s.userId, title, version: 0, important: false, updatedAt: ts() });
      state.members.push({ tripId: tid, userId: s.userId, email: s.email, role: 'owner' });
    },
    async publish(tid, note, important, snapshot: TripSnapshot, title) {
      if (!isOwner(tid)) throw new Error('只有主用户可以发布更新');
      const t = state.trips.get(tid)!;
      t.version += 1;
      Object.assign(t, { note, important, title, updatedAt: ts() });
      state.versions.push({ tripId: tid, v: { version: t.version, note, important, snapshot: JSON.parse(JSON.stringify(snapshot)), createdAt: ts() } });
      return t.version;
    },
    async latest(ids) {
      return ids.filter(isMember).map((i) => {
        const t = state.trips.get(i)!;
        return { id: i, title: t.title, version: t.version, note: t.note, important: t.important, updatedAt: t.updatedAt };
      });
    },
    async fetchVersion(tid, version) {
      if (!isMember(tid)) return null;
      const vs = state.versions.filter((x) => x.tripId === tid).map((x) => x.v);
      const v = version ? vs.find((x) => x.version === version) : vs[vs.length - 1];
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    async members(tid): Promise<CloudMember[]> {
      if (!isMember(tid)) return [];
      return state.members.filter((m) => m.tripId === tid).map(({ userId, email, role }) => ({ userId, email, role }));
    },
    async tripInvites(tid) {
      return isOwner(tid) ? state.invites.filter((i) => i.tripId === tid) : [];
    },
    async invite(tid, email) {
      const s = need();
      if (!isOwner(tid)) throw new Error('只有主用户可以邀请');
      if (email === s.email) throw new Error('不能邀请自己');
      state.invites = state.invites.filter((i) => !(i.tripId === tid && i.email === email));
      state.invites.push({ id: id(), tripId: tid, tripTitle: state.trips.get(tid)!.title, email, inviterEmail: s.email, createdAt: ts() });
    },
    async revokeInvite(iid) {
      state.invites = state.invites.filter((i) => !(i.id === iid && isOwner(i.tripId)));
    },
    async removeMember(tid, uid) {
      if (!isOwner(tid)) throw new Error('只有主用户可以移除成员');
      const m = state.members.find((x) => x.tripId === tid && x.userId === uid && x.role === 'member');
      state.members = state.members.filter((x) => x !== m);
      if (m) state.invites = state.invites.filter((i) => !(i.tripId === tid && i.email === m.email));
    },
    async myInvites() {
      const s = need();
      return state.invites.filter((i) => i.email === s.email && !i.acceptedAt);
    },
    async acceptInvite(iid) {
      const s = need();
      const inv = state.invites.find((i) => i.id === iid && i.email === s.email);
      if (!inv) throw new Error('邀请不存在或不是发给你的');
      if (!state.members.some((m) => m.tripId === inv.tripId && m.userId === s.userId)) {
        state.members.push({ tripId: inv.tripId, userId: s.userId, email: s.email, role: 'member' });
      }
      inv.acceptedAt = ts();
      return inv.tripId;
    },
    async leaveTrip(tid) {
      const s = need();
      state.members = state.members.filter((m) => !(m.tripId === tid && m.userId === s.userId && m.role === 'member'));
    },
    async upload(path, blob) {
      if (!isOwner(path.split('/')[0])) throw new Error('只有主用户能上传');
      if (!state.files.has(path)) state.files.set(path, blob);
    },
    async download(path) {
      if (!isMember(path.split('/')[0])) throw new Error('没有权限');
      const b = state.files.get(path);
      if (!b) throw new Error('Object not found');
      return b;
    },
  };
}
