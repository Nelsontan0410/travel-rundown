// 测试用：内存里的模拟同步后端（规则和 supabase/schema.sql 一致：只有主用户能发布 / 邀请，成员才能读，一个邀请码只给一台手机）
import type { CloudBackend, CloudEvent, CloudInvite, CloudMember, CloudSession, CloudVersion } from '../cloud/backend';
import type { TripSnapshot } from '../cloud/snapshot';

export interface FakeCloud extends CloudBackend {
  /** 换成某台手机（null = 这台手机还没有同步身份） */
  as(device: string | null): void;
  state: {
    trips: Map<string, { id: string; owner: string; title: string; version: number; note?: string; important: boolean; updatedAt: string }>;
    members: { tripId: string; userId: string; name?: string; role: 'owner' | 'member' }[];
    invites: (CloudInvite & { acceptedBy?: string; inviterName?: string })[];
    versions: { tripId: string; v: CloudVersion }[];
    files: Map<string, Blob>;
    events: CloudEvent[];
  };
}

export function fakeCloud(): FakeCloud {
  let device: string | null = null;
  const sessions = new Map<string, CloudSession>();
  const state: FakeCloud['state'] = { trips: new Map(), members: [], invites: [], versions: [], files: new Map(), events: [] };
  const watchers = new Set<(e: CloudEvent) => void>();
  let eid = 0;
  const nameOf = (t: string, u: string) => state.members.find((m) => m.tripId === t && m.userId === u)?.name;
  const log = (tripId: string, kind: string, title: string, detail: CloudEvent['detail'] = {}, actorId = cur()?.userId) => {
    const e: CloudEvent = { id: ++eid, tripId, actorId, actorName: actorId ? nameOf(tripId, actorId) : undefined, kind, title, detail, createdAt: ts() };
    state.events.push(e);
    for (const w of watchers) w(e);
  };
  const listeners = new Set<(s: CloudSession | null) => void>();
  const cur = () => (device ? sessions.get(device) ?? null : null);
  const need = () => {
    const s = cur();
    if (!s) throw new Error('请先登录');
    return s;
  };
  const isMember = (t: string) => !!cur() && state.members.some((m) => m.tripId === t && m.userId === cur()!.userId);
  const isOwner = (t: string) => !!cur() && state.trips.get(t)?.owner === cur()!.userId;
  let n = 0;
  const id = () => `id-${++n}`;
  const ts = () => new Date(Date.UTC(2026, 9, 18, 0, 0, n++)).toISOString();
  const norm = (c: string) => c.toUpperCase().replace(/[\s-]/g, '');

  return {
    state,
    as(d) {
      device = d;
      for (const l of listeners) l(cur());
    },
    async getSession() {
      return cur();
    },
    async ensureSession() {
      if (!device) throw new Error('没有手机');
      if (!sessions.has(device)) sessions.set(device, { userId: `u:${device}` });
      return sessions.get(device)!;
    },
    onSessionChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async createTrip(tid, title, name) {
      const s = need();
      if (state.trips.has(tid)) {
        if (state.trips.get(tid)!.owner !== s.userId) throw new Error('这份旅程已经属于别人');
        return;
      }
      state.trips.set(tid, { id: tid, owner: s.userId, title, version: 0, important: false, updatedAt: ts() });
      state.members.push({ tripId: tid, userId: s.userId, name: name || undefined, role: 'owner' });
    },
    async publish(tid, note, important, snapshot: TripSnapshot, title, summary) {
      if (!isOwner(tid)) throw new Error('只有主用户可以发布更新');
      const t = state.trips.get(tid)!;
      t.version += 1;
      Object.assign(t, { note, important, title, updatedAt: ts() });
      state.versions.push({ tripId: tid, v: { version: t.version, note, important, snapshot: JSON.parse(JSON.stringify(snapshot)), createdAt: ts() } });
      log(tid, 'publish', `${nameOf(tid, cur()!.userId) || '有人'} 发布了 v${t.version}${important ? '（重要更新）' : ''}`, { version: t.version, note, important, summary: summary ?? {} });
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
      return state.members.filter((m) => m.tripId === tid).map(({ userId, name, role }) => ({ userId, name, role }));
    },
    async tripInvites(tid) {
      return isOwner(tid) ? state.invites.filter((i) => i.tripId === tid).map(({ acceptedBy: _a, inviterName: _i, ...i }) => i) : [];
    },
    async createInvite(tid, name) {
      const s = need();
      if (!isOwner(tid)) throw new Error('只有主用户可以邀请');
      const code = `CODE${String(++n).padStart(6, '0')}`;
      const inviterName = state.members.find((m) => m.tripId === tid && m.userId === s.userId)?.name;
      state.invites.push({ id: id(), tripId: tid, code, name: name || undefined, inviterName, createdAt: ts() });
      return code;
    },
    async revokeInvite(iid) {
      state.invites = state.invites.filter((i) => !(i.id === iid && isOwner(i.tripId)));
    },
    async removeMember(tid, uid) {
      if (!isOwner(tid)) throw new Error('只有主用户可以移除成员');
      const gone = state.members.find((x) => x.tripId === tid && x.userId === uid && x.role === 'member');
      state.members = state.members.filter((x) => x !== gone);
      if (gone) log(tid, 'remove', `${nameOf(tid, cur()!.userId) || '有人'} 移除了 ${gone.name || '一位同伴'}`);
      state.invites = state.invites.filter((i) => !(i.tripId === tid && i.acceptedBy === uid));
    },
    async peekInvite(code) {
      const s = need();
      const inv = state.invites.find((i) => i.code === norm(code));
      if (!inv) return null;
      const t = state.trips.get(inv.tripId)!;
      return {
        tripId: inv.tripId,
        tripTitle: t.title,
        inviterName: inv.inviterName,
        name: inv.name,
        usable: (!inv.acceptedBy || inv.acceptedBy === s.userId) && t.owner !== s.userId,
        mine: t.owner === s.userId || inv.acceptedBy === s.userId,
      };
    },
    async joinWithCode(code, name) {
      const s = need();
      const inv = state.invites.find((i) => i.code === norm(code));
      if (!inv) throw new Error('邀请码不对，或者已被主用户撤回');
      if (isOwner(inv.tripId)) throw new Error('这是你自己的旅程');
      if (inv.acceptedBy && inv.acceptedBy !== s.userId) throw new Error('这个邀请码已经在别的手机上用过了，请主用户重新生成');
      const m = state.members.find((x) => x.tripId === inv.tripId && x.userId === s.userId);
      if (m) m.name = name || inv.name;
      else {
        state.members.push({ tripId: inv.tripId, userId: s.userId, name: name || inv.name, role: 'member' });
        log(inv.tripId, 'join', `${name || inv.name || '有人'} 加入了旅程`);
      }
      inv.acceptedAt ??= ts();
      inv.acceptedBy = s.userId;
      return inv.tripId;
    },
    async leaveTrip(tid) {
      const s = need();
      const me = state.members.find((m) => m.tripId === tid && m.userId === s.userId && m.role === 'member');
      if (!me) return;
      state.members = state.members.filter((m) => m !== me);
      const e: CloudEvent = { id: ++eid, tripId: tid, actorId: s.userId, actorName: me.name, kind: 'leave', title: `${me.name || '一位同伴'} 退出了旅程`, detail: {}, createdAt: ts() };
      state.events.push(e);
      for (const w of watchers) w(e);
    },
    async events(ids, afterId) {
      return state.events.filter((e) => ids.includes(e.tripId) && isMember(e.tripId) && (!afterId || e.id > afterId)).slice(-100);
    },
    watchEvents(cb) {
      watchers.add(cb);
      return () => watchers.delete(cb);
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
