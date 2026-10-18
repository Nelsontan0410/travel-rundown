// 2026-10-18 同步第一步的界面：登录、旅程列表里的邀请、旅程设置里的「同步与同伴」、发布更新、行程页的新版本提醒、改动清单。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Dialog, Sheet } from '../components/Layout';
import { Button, Card, InfoBanner, StatusChip } from '../components/Basics';
import { SettingsGroup, SettingsRow } from '../components/Cards';
import { Field, SwitchRow, TextInput } from '../components/Form';
import { useCloud } from '../store/cloud';
import { toast } from '../store/ui';
import { backend, cloudErrorText, type CloudInvite, type CloudMember } from '../cloud/backend';
import { refreshCloud, sendLoginCode, signOutCloud, verifyLoginCode } from '../cloud/session';
import { detachLocal, enableSync, joinTrip, pendingChanges, publishUpdate } from '../cloud/sync';
import type { SnapshotDiff } from '../cloud/snapshot';
import type { Trip } from '../domain/types';

export const openLogin = () => useCloud.setState({ loginOpen: true });

/** 登录：邮箱 → 6 位验证码（邮件模板没改时只有链接，点链接回来也能登录）。全局挂一个 */
export function LoginSheet() {
  const open = useCloud((s) => s.loginOpen);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const close = () => useCloud.setState({ loginOpen: false });
  useEffect(() => {
    if (open) {
      setCode('');
      setSent(false);
      setErr('');
    }
  }, [open]);
  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('请填正确的邮箱');
    setBusy(true);
    setErr('');
    try {
      await sendLoginCode(email);
      setSent(true);
    } catch (e) {
      setErr(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) return setErr('验证码是 6 位数字');
    setBusy(true);
    setErr('');
    try {
      await verifyLoginCode(email, code);
      toast('已登录');
      close();
    } catch (e) {
      setErr(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={close} title="登录同步">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void (sent ? verify() : send());
        }}
      >
        <p className={p.lockNote}>用邮箱登录。主用户发布行程、邀请同伴；被邀请的同伴登录后就能收到更新。行程资料仍然保存在这台手机上，没网也能看。</p>
        <Field label="邮箱" error={!sent ? err || undefined : undefined}>
          <TextInput type="email" inputMode="email" autoComplete="email" value={email} disabled={sent} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {sent && (
          <Field label="验证码" hint={`已发到 ${email.trim()}，几分钟内有效。邮件里如果只有链接没有数字，在这台设备上点链接也能登录。没收到可以看看垃圾邮件。`} error={err || undefined}>
            <TextInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} placeholder="6 位数字" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        <div className={p.sheetActions}>
          <Button block type="submit" disabled={busy}>
            {sent ? '登录' : '发送验证码'}
          </Button>
          {sent && (
            <Button block type="button" variant="link" chevron={false} onClick={() => setSent(false)}>
              换一个邮箱 / 重新发送
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

/** 旅程列表：登录入口和收到的邀请 */
export function InvitesCard() {
  const nav = useNavigate();
  const session = useCloud((s) => s.session);
  const invites = useCloud((s) => s.invites);
  const [busy, setBusy] = useState<string | null>(null);
  if (session === undefined) return null;
  if (!session) {
    return (
      <Card className={p.cloudCard}>
        <p className={p.cloudTitle}>和同伴同步</p>
        <p className={p.lockNote}>被邀请了？登录后就能看到邀请，加入后会收到主用户发布的行程更新。</p>
        <Button variant="outline" icon="Globe" onClick={openLogin}>
          登录同步
        </Button>
      </Card>
    );
  }
  const join = async (inv: CloudInvite) => {
    setBusy(inv.id);
    try {
      const id = await joinTrip(inv);
      await refreshCloud();
      toast(`已加入「${inv.tripTitle}」`);
      nav(`/itinerary/${id}`);
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className={p.cloudCard}>
      <div className={p.cloudHead}>
        <p className={p.cloudTitle}>同步</p>
        <span className={p.cloudWho}>{session.email}</span>
      </div>
      {invites.length === 0 ? (
        <p className={p.lockNote}>没有新的邀请。</p>
      ) : (
        invites.map((inv) => (
          <div key={inv.id} className={p.inviteRow}>
            <div className={p.inviteText}>
              <p className={p.inviteTitle}>{inv.tripTitle}</p>
              <p className={p.lockNote}>{inv.inviterEmail ? `${inv.inviterEmail} 邀请你加入` : '邀请你加入'}</p>
            </div>
            <Button size="sm" disabled={busy === inv.id} onClick={() => void join(inv)}>
              {busy === inv.id ? '加入中…' : '加入'}
            </Button>
          </div>
        ))
      )}
      <Button variant="link" chevron={false} onClick={() => void signOutCloud().then(() => toast('已退出登录'))}>
        退出登录
      </Button>
    </Card>
  );
}

/** 改动清单：主用户「还没发布的改动」和同伴「这个版本改了什么」共用 */
export function DiffList({ diff, empty = '没有改动' }: { diff: SnapshotDiff; empty?: string }) {
  if (!diff.count) return <p className={p.lockNote}>{empty}</p>;
  const label = { added: '新增', removed: '删除', changed: '修改' } as const;
  return (
    <ul className={p.diffList}>
      {diff.trip.length > 0 && (
        <li>
          <StatusChip variant="info">旅程</StatusChip>
          <span className={p.diffText}>{diff.trip.join('、')}</span>
        </li>
      )}
      {diff.days.map((d) => (
        <li key={`d${d.index}`}>
          <StatusChip variant="info">Day {d.index}</StatusChip>
          <span className={p.diffText}>{d.fields.join('、')}</span>
        </li>
      ))}
      {diff.items.map((c) => (
        <li key={c.id}>
          <StatusChip variant={c.kind === 'removed' ? 'neutral' : c.kind === 'added' ? 'success' : 'info'}>{label[c.kind]}</StatusChip>
          <span className={p.diffText}>
            {c.dayIndex ? `Day ${c.dayIndex} · ` : ''}
            {c.title}
            {c.fields.length > 0 && <span className={p.diffFields}>（{c.fields.join('、')}）</span>}
          </span>
        </li>
      ))}
      {diff.docs.map((d) => (
        <li key={`doc${d.id}`}>
          <StatusChip variant={d.kind === 'removed' ? 'neutral' : 'info'}>{label[d.kind]}资料</StatusChip>
          <span className={p.diffText}>{d.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** 主用户：发布更新 */
function PublishSheet({ open, onClose, trip, diff, onDone }: { open: boolean; onClose: () => void; trip: Trip; diff: SnapshotDiff | null; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setNote('');
      setImportant(false);
    }
  }, [open]);
  const go = async () => {
    if (!note.trim()) return toast('写一句这次改了什么，方便同伴看懂');
    setBusy(true);
    try {
      const v = await publishUpdate(trip.id, note, important);
      toast(`已发布 v${v}`);
      onDone();
      onClose();
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="发布更新">
      <p className={p.lockNote}>发布后，所有同伴都会收到提醒，自己预览后决定要不要套用。</p>
      {diff && <DiffList diff={diff} />}
      <Field label="这次改了什么">
        <TextInput value={note} maxLength={80} placeholder="例如：Day 3 改坐 JR，酒店换了" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <SwitchRow label="重要更新（同伴那边醒目提醒）" on={important} onChange={setImportant} />
      <div className={p.sheetActions}>
        <Button block disabled={busy} icon="Upload" onClick={() => void go()}>
          {busy ? '发布中…' : '发布'}
        </Button>
      </div>
    </Sheet>
  );
}

/** 旅程设置里的「同步与同伴」 */
export function SyncSection({ trip }: { trip: Trip }) {
  const nav = useNavigate();
  const session = useCloud((s) => s.session);
  const update = useCloud((s) => s.updates[trip.id]);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [members, setMembers] = useState<CloudMember[] | null>(null);
  const [invites, setInvites] = useState<CloudInvite[]>([]);
  const [email, setEmail] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<CloudMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const role = trip.cloud?.role;
  const isOwner = role === 'owner';

  const load = async () => {
    if (!session || !trip.cloud) return;
    try {
      const be = await backend();
      if (isOwner) setDiff(await pendingChanges(trip.id));
      const [m, inv] = await Promise.all([be.members(trip.id), isOwner ? be.tripInvites(trip.id) : Promise.resolve([])]);
      setMembers(m);
      setInvites(inv.filter((i) => !i.acceptedAt));
      if (!isOwner && !m.some((x) => x.email === session.email)) setMembers([]);
    } catch (e) {
      useCloud.setState({ lastError: cloudErrorText(e) });
    }
  };
  useEffect(() => {
    void load();
  }, [session?.userId, trip.cloud?.version, trip.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return null;

  if (!session) {
    return (
      <SettingsGroup title="同步与同伴" note="登录后可以开启同步、邀请同伴；被邀请的同伴登录后会收到你发布的更新。">
        <SettingsRow icon="Globe" label="登录同步" onClick={openLogin} />
      </SettingsGroup>
    );
  }

  if (!trip.cloud) {
    const start = async () => {
      setBusy(true);
      try {
        await enableSync(trip.id);
        toast('已开启同步，现在可以邀请同伴');
        await load();
      } catch (e) {
        toast(cloudErrorText(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <SettingsGroup title="同步与同伴" note={`已登录 ${session.email}。开启后你是这份旅程的主用户：只有你能修改并发布更新，同伴只能被邀请加入。完成勾选、实际记账、穿搭打包都各自保存，不会同步。`}>
        <SettingsRow icon="Upload" label={busy ? '开启中…' : '开启同步（成为主用户）'} onClick={busy ? undefined : () => void start()} />
      </SettingsGroup>
    );
  }

  if (isOwner) {
    const invite = async () => {
      const e = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(e)) return toast('请填正确的邮箱');
      try {
        await (await backend()).invite(trip.id, e);
        setEmail('');
        toast('已邀请，对方用这个邮箱登录就能加入');
        await load();
      } catch (err) {
        toast(cloudErrorText(err));
      }
    };
    return (
      <>
        <SettingsGroup title="同步与同伴" note="你是主用户：只有你能修改行程并发布更新。">
          <SettingsRow icon="CheckCircle2" label="已发布" value={`v${trip.cloud.version}`} arrow={false} />
          <SettingsRow
            icon="Upload"
            label={diff && diff.count ? `发布更新（${diff.count} 处改动）` : '发布更新'}
            value={diff && !diff.count ? '没有新改动' : undefined}
            onClick={() => setPublishOpen(true)}
          />
        </SettingsGroup>
        <div className={p.mt12}>
          <Card className={p.cloudCard}>
            <p className={p.cloudTitle}>成员</p>
            {(members ?? []).map((m) => (
              <div key={m.userId} className={p.inviteRow}>
                <div className={p.inviteText}>
                  <p className={p.inviteTitle}>{m.email}</p>
                  <p className={p.lockNote}>{m.role === 'owner' ? '主用户（你）' : '同伴'}</p>
                </div>
                {m.role === 'member' && (
                  <Button size="sm" variant="outline" onClick={() => setRemoving(m)}>
                    移除
                  </Button>
                )}
              </div>
            ))}
            {invites.map((i) => (
              <div key={i.id} className={p.inviteRow}>
                <div className={p.inviteText}>
                  <p className={p.inviteTitle}>{i.email}</p>
                  <p className={p.lockNote}>已邀请，还没加入</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void backend().then((b) => b.revokeInvite(i.id)).then(load)}>
                  撤回
                </Button>
              </div>
            ))}
            <form
              className={p.inviteForm}
              onSubmit={(e) => {
                e.preventDefault();
                void invite();
              }}
            >
              <TextInput type="email" inputMode="email" placeholder="同伴的邮箱" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="同伴的邮箱" />
              <Button size="sm" type="submit">
                邀请
              </Button>
            </form>
          </Card>
        </div>
        <PublishSheet open={publishOpen} onClose={() => setPublishOpen(false)} trip={trip} diff={diff} onDone={() => void load()} />
        <Dialog
          open={!!removing}
          onClose={() => setRemoving(null)}
          title={`移除 ${removing?.email ?? ''}？`}
          text="对方之后收不到更新；他手机上已经保存的资料不会被删除。"
          actions={
            <>
              <Button variant="outline" onClick={() => setRemoving(null)}>
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const m = removing!;
                  setRemoving(null);
                  void backend()
                    .then((b) => b.removeMember(trip.id, m.userId))
                    .then(load)
                    .then(() => toast('已移除'))
                    .catch((e) => toast(cloudErrorText(e)));
                }}
              >
                移除
              </Button>
            </>
          }
        />
      </>
    );
  }

  // 同伴
  const removed = members !== null && !members.some((m) => m.email === session.email);
  return (
    <>
      <SettingsGroup
        title="同步与同伴"
        note="这份旅程由主用户管理。你在本机的修改只存在这台手机上；完成勾选、实际记账、穿搭打包都是你自己的。"
      >
        <SettingsRow icon="Home" label="主用户" value={trip.cloud.ownerEmail ?? '—'} arrow={false} />
        <SettingsRow icon="CheckCircle2" label="已套用" value={`v${trip.cloud.version}`} arrow={false} />
        {update ? (
          <SettingsRow icon="Download" label={`查看新版本 v${update.version}`} value={update.note} onClick={() => nav(`/trip/${trip.id}/update`)} />
        ) : (
          <SettingsRow icon="RotateCcw" label="检查更新" onClick={() => void refreshCloud().then(() => toast(useCloud.getState().updates[trip.id] ? '有新版本' : '已经是最新版本'))} />
        )}
        <SettingsRow icon="Trash2" label="退出这份旅程的同步" danger onClick={() => setLeaving(true)} />
      </SettingsGroup>
      {removed && (
        <div className={p.mt8}>
          <InfoBanner variant="warning">你已经不在这份旅程的成员名单里，之后收不到更新。手机上的资料会保留。</InfoBanner>
        </div>
      )}
      <Dialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="退出同步？"
        text="之后收不到主用户的更新。手机上已经保存的行程和资料都会保留，变成你自己的旅程。"
        actions={
          <>
            <Button variant="outline" onClick={() => setLeaving(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setLeaving(false);
                void backend()
                  .then((b) => b.leaveTrip(trip.id))
                  .catch(() => undefined)
                  .then(() => detachLocal(trip.id))
                  .then(refreshCloud)
                  .then(() => toast('已退出同步'));
              }}
            >
              退出
            </Button>
          </>
        }
      />
    </>
  );
}

/** 行程页顶部：同伴有新版本时提醒（重要更新用醒目样式） */
export function UpdateNotice({ tripId }: { tripId: string }) {
  const nav = useNavigate();
  const u = useCloud((s) => s.updates[tripId]);
  if (!u) return null;
  return (
    <div className={p.mt8}>
      <InfoBanner
        variant={u.important ? 'warning' : 'info'}
        action={
          <Button size="sm" variant="outline" onClick={() => nav(`/trip/${tripId}/update`)}>
            查看
          </Button>
        }
      >
        {u.important ? '重要更新' : '主用户发布了新版本'} v{u.version}
        {u.note ? `：${u.note}` : ''}
      </InfoBanner>
    </div>
  );
}
