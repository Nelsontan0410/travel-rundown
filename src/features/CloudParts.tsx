// 2026-10-18 同步的界面：旅程列表里的「和同伴同步」、旅程设置里的「同步与同伴」、发布更新、行程页的新版本提醒、改动清单。
// 2026-10-26：主用户用账号（Google / 邮箱）开启同步，换手机后重新登录找回；同伴用主用户分享的邀请码 / 链接加入，可先匿名、之后绑定账号。
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
import { ensureCloudSession, hasAccount, myName, refreshCloud, setMyName } from '../cloud/session';
import { AccountSheet } from './AccountSheet';
import { detachLocal, enableSync, pendingChanges, prettyCode, publishUpdate } from '../cloud/sync';
import type { SnapshotDiff } from '../cloud/snapshot';
import type { Trip } from '../domain/types';
import { copyText } from '../lib/files';
import { useLocalChangeCount } from './SuggestPages';

export const inviteLink = (code: string) => `${location.origin}/join/${code}`;

/** 分享邀请：手机上用系统分享（WhatsApp、微信…），不支持就复制 */
export async function shareInvite(code: string, tripTitle: string, inviter?: string): Promise<void> {
  const text = `${inviter ? `${inviter} ` : ''}邀请你一起看「${tripTitle}」的行程。打开链接加入：${inviteLink(code)}\n已经装了 App 的话，也可以在「旅程」页输入邀请码：${prettyCode(code)}`;
  const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: tripTitle, text });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  toast((await copyText(text)) ? '已复制邀请，可以贴给同伴' : '复制失败，请手动抄下邀请码');
}

/** 填自己的名字（开启同步 / 加入时用） */
export function NameField({ value, onChange, label = '你的名字' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label} hint="同伴会看到这个名字">
      <TextInput value={value} maxLength={20} placeholder="例如：小明" aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </Field>
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
      {diff.guide.map((g) => (
        <li key={`g${g}`}>
          <StatusChip variant="info">亮点</StatusChip>
          <span className={p.diffText}>{g}</span>
        </li>
      ))}
      {(diff.food ?? []).map((f) => (
        <li key={`f${f}`}>
          <StatusChip variant="info">美食</StatusChip>
          <span className={p.diffText}>{f}</span>
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
  const [mateName, setMateName] = useState('');
  const [ownName, setOwnName] = useState(myName());
  const [startOpen, setStartOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<CloudMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pendingSg, setPendingSg] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const role = trip.cloud?.role;
  const isOwner = role === 'owner';
  const localCount = useLocalChangeCount(trip.id, role === 'member');

  const load = async () => {
    if (!session || !trip.cloud) return;
    try {
      const be = await backend();
      if (isOwner) setDiff(await pendingChanges(trip.id));
      const [m, inv, sgs] = await Promise.all([
        be.members(trip.id),
        isOwner ? be.tripInvites(trip.id) : Promise.resolve([]),
        isOwner ? be.suggestions(trip.id) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvites(inv.filter((i) => !i.acceptedAt));
      setPendingSg(sgs.filter((x) => x.status === 'pending').length);
    } catch (e) {
      useCloud.setState({ lastError: cloudErrorText(e) });
    }
  };
  useEffect(() => {
    void load();
  }, [session?.userId, trip.cloud?.version, trip.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // 主用户开着这一页时：回到前台或每 20 秒刷新一次同伴名单（同伴刚加入就能看到）
  useEffect(() => {
    if (!isOwner || !session) return;
    const tick = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', tick);
    const t = setInterval(tick, 20_000);
    return () => {
      document.removeEventListener('visibilitychange', tick);
      clearInterval(t);
    };
  }, [isOwner, session?.userId, trip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trip.cloud) {
    const start = async () => {
      if (!ownName.trim()) return toast('先填你的名字，同伴会看到');
      // 2026-10-26：主用户必须用账号，换手机 / 清缓存后才找得回来
      if (!hasAccount(session)) {
        setStartOpen(false);
        setAccountOpen(true);
        return toast('先登录账号，再开启同步');
      }
      setBusy(true);
      try {
        setMyName(ownName);
        await ensureCloudSession();
        await enableSync(trip.id, ownName);
        setStartOpen(false);
        toast('已开启同步，现在可以邀请同伴');
      } catch (e) {
        toast(cloudErrorText(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
        <SettingsGroup title="同步与同伴" note="开启后你的账号就是这份旅程的主用户：只有你能修改并发布更新，同伴用你分享的邀请加入。换手机或清缓存后，重新登录账号就能找回。完成勾选、实际记账、穿搭打包都各自保存，不会同步。">
          <SettingsRow icon="Upload" label="开启同步（成为主用户）" onClick={() => (hasAccount(session) ? setStartOpen(true) : setAccountOpen(true))} />
        </SettingsGroup>
        <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
        <Sheet open={startOpen} onClose={() => setStartOpen(false)} title="开启同步">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <NameField value={ownName} onChange={setOwnName} />
            <InfoBanner variant="info">已用账号登录：换手机或清除网站资料后，重新登录同一个账号就能找回并继续发布。</InfoBanner>
            <div className={p.sheetActions}>
              <Button block type="submit" disabled={busy}>
                {busy ? '开启中…' : '开启并发布第一版'}
              </Button>
            </div>
          </form>
        </Sheet>
      </>
    );
  }

  if (session === undefined) return null;

  if (isOwner) {
    const invite = async () => {
      const name = mateName.trim();
      if (!name) return toast('填同伴的名字，方便你分辨');
      try {
        const code = await (await backend()).createInvite(trip.id, name);
        setMateName('');
        await load();
        await shareInvite(code, trip.title, trip.cloud?.ownerName ?? myName());
      } catch (err) {
        toast(cloudErrorText(err));
      }
    };
    const others = (members ?? []).filter((m) => m.role === 'member');
    return (
      <>
        <SettingsGroup title="同步与同伴" note={session && session.anonymous ? '你是主用户，但现在还是临时身份：清除网站资料后就不能再发布这份旅程。先绑定 Google 或邮箱。' : '你是主用户：只有你能修改行程并发布更新。'}>
          {session && session.anonymous && <SettingsRow icon="Upload" label="绑定账号（防止丢失）" onClick={() => setAccountOpen(true)} />}
          <SettingsRow icon="CheckCircle2" label="已发布" value={`v${trip.cloud.version}`} arrow={false} />
          <SettingsRow
            icon="Upload"
            label={diff && diff.count ? `发布更新（${diff.count} 处改动）` : '发布更新'}
            value={diff && !diff.count ? '没有新改动' : undefined}
            onClick={() => setPublishOpen(true)}
          />
          <SettingsRow
            icon="StickyNote"
            label={pendingSg ? `同伴建议（${pendingSg} 条待处理）` : '同伴建议'}
            value={pendingSg ? undefined : '没有待处理'}
            onClick={() => nav(`/trip/${trip.id}/suggestions`)}
          />
        </SettingsGroup>
        <div className={p.mt12}>
          <Card className={p.cloudCard}>
            <p className={p.cloudTitle}>同伴</p>
            {others.length === 0 && invites.length === 0 && <p className={p.lockNote}>还没有同伴。填同伴的名字，生成邀请后用 WhatsApp / 微信发给他。</p>}
            {others.map((m) => (
              <div key={m.userId} className={p.inviteRow}>
                <div className={p.inviteText}>
                  <p className={p.inviteTitle}>{m.name || '同伴'}</p>
                  <p className={p.lockNote}>已加入</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setRemoving(m)}>
                  移除
                </Button>
              </div>
            ))}
            {invites.map((i) => (
              <div key={i.id} className={p.inviteRow}>
                <div className={p.inviteText}>
                  <p className={p.inviteTitle}>{i.name || '同伴'}</p>
                  <p className={p.lockNote}>还没加入 · 邀请码 {prettyCode(i.code)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void shareInvite(i.code, trip.title, trip.cloud?.ownerName ?? myName())}>
                  分享
                </Button>
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
              <TextInput placeholder="同伴的名字" maxLength={20} value={mateName} onChange={(e) => setMateName(e.target.value)} aria-label="同伴的名字" />
              <Button size="sm" type="submit">
                生成邀请
              </Button>
            </form>
            <p className={p.lockNote}>每个邀请只能给一台手机用。同伴换手机的话，移除后再生成一个新的。</p>
          </Card>
        </div>
        <PublishSheet open={publishOpen} onClose={() => setPublishOpen(false)} trip={trip} diff={diff} onDone={() => void load()} />
        <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
        <Dialog
          open={!!removing}
          onClose={() => setRemoving(null)}
          title={`移除 ${removing?.name || '这位同伴'}？`}
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
  const removed = members !== null && !!session && !members.some((m) => m.userId === session.userId);
  return (
    <>
      <SettingsGroup
        title="同步与同伴"
        note="这份旅程由主用户管理。你在本机的修改只存在这台手机上，想让大家也看到就在「我的修改」里提交给主用户；完成勾选、实际记账、穿搭打包都是你自己的。"
      >
        <SettingsRow icon="Home" label="主用户" value={trip.cloud.ownerName ?? trip.cloud.ownerEmail ?? '—'} arrow={false} />
        <SettingsRow icon="CheckCircle2" label="已套用" value={`v${trip.cloud.version}`} arrow={false} />
        <SettingsRow icon="Pencil" label={localCount ? `我的修改（${localCount} 处，只在本机）` : '我的修改'} value={localCount ? '提交给主用户' : '没有'} onClick={() => nav(`/trip/${trip.id}/suggest`)} />
        {update ? (
          <SettingsRow icon="Download" label={`查看新版本 v${update.version}`} value={update.note} onClick={() => nav(`/trip/${trip.id}/update`)} />
        ) : (
          <SettingsRow icon="RotateCcw" label="检查更新" onClick={() => void refreshCloud().then(() => toast(useCloud.getState().updates[trip.id] ? '有新版本' : '已经是最新版本'))} />
        )}
        <SettingsRow icon="Trash2" label="退出这份旅程的同步" danger onClick={() => setLeaving(true)} />
      </SettingsGroup>
      {(removed || !session) && (
        <div className={p.mt8}>
          <InfoBanner variant="warning">{session ? '你已经不在这份旅程的成员名单里，之后收不到更新。手机上的资料会保留。' : '这台手机的同步身份不见了（可能清除过网站资料），收不到更新。请主用户重新邀请你。'}</InfoBanner>
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
export function UpdateNotice({ tripId, role }: { tripId: string; role?: 'owner' | 'member' }) {
  const nav = useNavigate();
  const u = useCloud((s) => s.updates[tripId]);
  const local = useLocalChangeCount(tripId, role === 'member');
  if (!u && local > 0)
    return (
      <div className={p.mt8}>
        <InfoBanner
          variant="info"
          action={
            <Button size="sm" variant="outline" onClick={() => nav(`/trip/${tripId}/suggest`)}>
              查看
            </Button>
          }
        >
          你在本机改了 {local} 处，只有你看得到。可以提交给主用户。
        </InfoBanner>
      </div>
    );
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
