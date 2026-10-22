// 2026-10-19 同步第二步的界面：
//  · 同伴「我的修改」：勾选本机的修改 → 提交给主用户；看自己提交过的建议、撤回、把某项恢复成主用户版本
//  · 主用户「同伴建议」列表 + 逐项审核（接受 / 不采纳）→ 写进本机 → 一键发布新版本
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import p from './Page.module.css';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader, Dialog } from '../components/Layout';
import { Button, Card, EmptyState, FilterChips, InfoBanner, SectionTitle, StatusChip } from '../components/Basics';
import { Field, TextInput } from '../components/Form';
import { useTripData } from '../hooks/data';
import { toast } from '../store/ui';
import { backend, cloudErrorText, type CloudSuggestion, type SuggestionChange } from '../cloud/backend';
import { changeLine, changeText, decide, isEntity, myLocalChanges, revertLocal, reviewRows, submitSuggestion, type ReviewRow } from '../cloud/suggest';
import { publishUpdate } from '../cloud/sync';
import { KIND_LABEL } from '../cloud/shared';
import { refreshCloud } from '../cloud/session';
import { fmtTimeRange } from '../domain/format';
import type { Item } from '../domain/types';

const OP = { add: { label: '新增', v: 'success' }, change: { label: '修改', v: 'info' }, remove: { label: '删除', v: 'neutral' } } as const;
const STATUS: Record<CloudSuggestion['status'], { label: string; v: 'success' | 'info' | 'neutral' }> = {
  pending: { label: '等待主用户', v: 'info' },
  accepted: { label: '已采纳', v: 'success' },
  partial: { label: '部分采纳', v: 'success' },
  rejected: { label: '没有采纳', v: 'neutral' },
};

export function brief(it: Item | undefined): string {
  if (!it) return '（没有这一项）';
  return [fmtTimeRange(it.start, it.end, it.endDayOffset), it.title, it.place?.localName ?? it.place?.name, it.note].filter(Boolean).join(' · ');
}
const when = (iso: string) => new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 本机有几处还没提交的修改（同伴用，会跟着数据库自动更新） */
export function useLocalChangeCount(tripId: string | undefined, isMember: boolean): number {
  return (
    useLiveQuery(async () => (tripId && isMember ? (await myLocalChanges(tripId)).length : 0), [tripId, isMember]) ?? 0
  );
}

function ChangeHead({ c }: { c: SuggestionChange }) {
  return (
    <div className={p.notifyHead}>
      <StatusChip variant={OP[c.op].v}>{OP[c.op].label}</StatusChip>
      <span className={p.inviteTitle} style={{ flex: 1, minWidth: 0 }}>
        {isEntity(c) && c.kind !== 'day' ? `${KIND_LABEL[c.kind]} · ` : ''}
        {c.dayIndex && !(isEntity(c) && c.kind === 'day') ? `Day ${c.dayIndex} · ` : ''}
        {c.title}
      </span>
    </div>
  );
}

// ———————— 同伴：我的修改 ————————

export function MySuggestPage() {
  const { tripId } = useParams();
  const td = useTripData(tripId);
  const changes = useLiveQuery(async () => (tripId ? myLocalChanges(tripId) : []), [tripId, td?.items]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<CloudSuggestion[] | null>(null);
  const [reverting, setReverting] = useState<SuggestionChange | null>(null);

  const loadMine = async () => {
    if (!tripId) return;
    try {
      setMine(await (await backend()).suggestions(tripId));
    } catch (e) {
      toast(cloudErrorText(e));
    }
  };
  useEffect(() => {
    void loadMine();
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  // 默认全选；自己新加的证明资料可能是私人的，默认不选
  useEffect(() => {
    if (changes && picked === null) setPicked(new Set(changes.filter((c) => !(c.kind === 'doc' && c.op === 'add')).map((c) => c.itemId)));
  }, [changes, picked]);

  if (!tripId || td === null) return <Screen header={<BackHeader title="我的修改" />}>{null}</Screen>;
  const sel = picked ?? new Set<string>();
  const chosen = (changes ?? []).filter((c) => sel.has(c.itemId));
  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };
  const submit = async () => {
    if (!chosen.length) return toast('请至少勾选一处');
    setBusy(true);
    try {
      await submitSuggestion(
        tripId,
        note,
        chosen.map((c) => c.itemId),
      );
      setNote('');
      toast(`已提交 ${chosen.length} 处给主用户`);
      await loadMine();
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const pendingIds = new Set((mine ?? []).filter((s) => s.status === 'pending').flatMap((s) => s.changes.map((c) => c.itemId)));

  return (
    <>
      {td && <TripThemeScope theme={td.trip.theme} />}
      <Screen
        header={<BackHeader title="我的修改" />}
        bottom={
          changes && changes.length > 0 ? (
            <Button icon="Upload" disabled={busy || !chosen.length} onClick={() => void submit()}>
              {busy ? '提交中…' : `提交给主用户（${chosen.length} 处）`}
            </Button>
          ) : undefined
        }
      >
        <div className={p.stack}>
          <InfoBanner variant="info">
            这些是你在本机改的，只有你看得到。勾选想给主用户看的，提交后主用户会收到通知；主用户接受并发布后，大家都会收到。没勾选的继续只留在你手机上。
          </InfoBanner>
          {changes === undefined ? (
            <p className={p.lockNote}>正在读取…</p>
          ) : changes.length === 0 ? (
            <EmptyState title="没有本机修改" text="你在行程、资料、旅行亮点、美食册、旅程资料里新增、修改或删除的内容会出现在这里。" compact />
          ) : (
            <>
              <ul className={p.notifyList}>
                {changes.map((c) => (
                  <li key={c.itemId}>
                    <label className={`${p.notifyItem} ${p.suggestRow}`}>
                      <input type="checkbox" checked={sel.has(c.itemId)} onChange={() => toggle(c.itemId)} aria-label={`提交：${changeLine(c)}`} />
                      <span className={p.suggestText}>
                        <ChangeHead c={c} />
                        {c.op === 'change' && c.fields?.length ? <span className={p.lockNote}>改了：{c.fields.join('、')}</span> : null}
                        {c.op !== 'remove' && <span className={p.notifyBody}>{isEntity(c) ? changeText(c) : brief(c.item)}</span>}
                        {pendingIds.has(c.itemId) && <span className={p.lockNote}>已经在一条等待中的建议里</span>}
                        <button type="button" className={p.linkBtn} onClick={(e) => (e.preventDefault(), setReverting(c))}>
                          恢复成主用户版本
                        </button>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <Field label="给主用户的说明（可选）">
                <TextInput value={note} maxLength={120} placeholder="例如：Day 2 下雪的话晚一点出发比较好" onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          )}

          <div>
            <SectionTitle>我提交过的建议</SectionTitle>
            {!mine ? (
              <p className={p.lockNote}>正在读取…</p>
            ) : mine.length === 0 ? (
              <p className={p.lockNote}>还没有提交过。</p>
            ) : (
              <div className={p.stack}>
                {mine.map((s) => (
                  <Card key={s.id} className={p.cloudCard}>
                    <div className={p.notifyHead}>
                      <StatusChip variant={STATUS[s.status].v}>{STATUS[s.status].label}</StatusChip>
                      <span className={p.notifyTrip}>{s.changes.length} 处修改</span>
                      <span className={p.notifyTime}>{when(s.createdAt)}</span>
                    </div>
                    {s.note && <p className={p.notifyBody}>{s.note}</p>}
                    <ul className={p.diffList}>
                      {s.changes.map((c) => (
                        <li key={c.itemId}>
                          <span className={p.diffText}>
                            {changeLine(c)}
                            {s.decisions?.[c.itemId] === 'accept' ? ' · ✓ 已采纳' : s.decisions?.[c.itemId] === 'reject' ? ' · 没有采纳' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {s.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void backend()
                            .then((b) => b.withdrawSuggestion(s.id))
                            .then(loadMine)
                            .then(() => toast('已撤回'))
                            .catch((e) => toast(cloudErrorText(e)))
                        }
                      >
                        撤回
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </Screen>
      <Dialog
        open={!!reverting}
        onClose={() => setReverting(null)}
        title="恢复成主用户版本？"
        text={reverting ? `「${reverting.title}」会变回主用户发布的样子，你在这一项上的修改会丢掉。` : ''}
        actions={
          <>
            <Button variant="outline" onClick={() => setReverting(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const c = reverting!;
                setReverting(null);
                void revertLocal(tripId, c.itemId).then(() => toast('已恢复'));
              }}
            >
              恢复
            </Button>
          </>
        }
      />
    </>
  );
}

// ———————— 主用户：建议列表 ————————

export function SuggestionsPage() {
  const nav = useNavigate();
  const { tripId } = useParams();
  const td = useTripData(tripId);
  const [list, setList] = useState<CloudSuggestion[] | null>(null);
  useEffect(() => {
    if (!tripId) return;
    void backend()
      .then((b) => b.suggestions(tripId))
      .then(setList)
      .catch((e) => {
        toast(cloudErrorText(e));
        setList([]);
      });
  }, [tripId]);
  if (!tripId || td === null) return <Screen header={<BackHeader title="同伴建议" />}>{null}</Screen>;
  const pending = (list ?? []).filter((s) => s.status === 'pending');
  const done = (list ?? []).filter((s) => s.status !== 'pending');
  const row = (s: CloudSuggestion) => (
    <li key={s.id}>
      <button type="button" className={p.notifyItem} onClick={() => nav(`/trip/${tripId}/suggestion/${s.id}`)}>
        <div className={p.notifyHead}>
          <StatusChip variant={STATUS[s.status].v}>{s.status === 'pending' ? '待处理' : STATUS[s.status].label}</StatusChip>
          <span className={p.notifyTrip}>{s.authorName || '同伴'} · {s.changes.length} 处修改</span>
          <span className={p.notifyTime}>{when(s.createdAt)}</span>
        </div>
        {s.note && <p className={p.notifyBody}>{s.note}</p>}
        <p className={p.lockNote}>{s.changes.slice(0, 3).map(changeLine).join('；')}{s.changes.length > 3 ? ' …' : ''}</p>
      </button>
    </li>
  );
  return (
    <>
      {td && <TripThemeScope theme={td.trip.theme} />}
      <Screen header={<BackHeader title="同伴建议" />}>
        {list === null ? (
          <p className={p.lockNote}>正在读取…</p>
        ) : list.length === 0 ? (
          <EmptyState title="还没有建议" text="同伴在自己手机上改了行程、资料、亮点或美食，并选择提交后，会出现在这里。" compact />
        ) : (
          <div className={p.stack}>
            {pending.length > 0 && (
              <div>
                <SectionTitle first>待处理（{pending.length}）</SectionTitle>
                <ul className={p.notifyList}>{pending.map(row)}</ul>
              </div>
            )}
            {done.length > 0 && (
              <div>
                <SectionTitle>处理过的</SectionTitle>
                <ul className={p.notifyList}>{done.map(row)}</ul>
              </div>
            )}
          </div>
        )}
      </Screen>
    </>
  );
}

// ———————— 主用户：逐项审核 ————————

const CHOICES: { value: 'accept' | 'reject'; label: string }[] = [
  { value: 'accept', label: '接受' },
  { value: 'reject', label: '不采纳' },
];

export function ReviewSuggestionPage() {
  const nav = useNavigate();
  const { tripId, sid } = useParams();
  const td = useTripData(tripId);
  const [sg, setSg] = useState<CloudSuggestion | null | undefined>(undefined);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [choice, setChoice] = useState<Record<string, 'accept' | 'reject'>>({});
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<{ accepted: number } | null>(null);

  useEffect(() => {
    if (!tripId || !sid) return;
    void (async () => {
      try {
        const all = await (await backend()).suggestions(tripId);
        const s = all.find((x) => x.id === sid) ?? null;
        setSg(s);
        if (s) {
          setRows(await reviewRows(tripId, s));
          setChoice(s.decisions ?? Object.fromEntries(s.changes.map((c) => [c.itemId, 'accept' as const])));
        }
      } catch (e) {
        toast(cloudErrorText(e));
        setSg(null);
      }
    })();
  }, [tripId, sid]);

  if (!tripId || td === null) return <Screen header={<BackHeader title="审核建议" />}>{null}</Screen>;
  const pending = sg?.status === 'pending';
  const acc = rows.filter((r) => choice[r.change.itemId] === 'accept').length;
  const rej = rows.length - acc;

  const confirm = async () => {
    if (!sg) return;
    setBusy(true);
    try {
      const r = await decide(tripId, sg, choice);
      setSg({ ...sg, status: r.rejected === 0 ? 'accepted' : r.accepted === 0 ? 'rejected' : 'partial', decisions: choice });
      if (r.accepted > 0) setPublished({ accepted: r.accepted });
      else {
        toast('已告诉同伴：这次没有采纳');
        nav(-1);
      }
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const publishNow = async () => {
    if (!sg) return;
    setBusy(true);
    try {
      const v = await publishUpdate(tripId, `采纳 ${sg.authorName || '同伴'} 的建议${sg.note ? `：${sg.note}` : ''}`.slice(0, 80), false);
      await refreshCloud();
      toast(`已发布 v${v}，大家都会收到`);
      nav(`/trip/${tripId}/settings#sync`, { replace: true });
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {td && <TripThemeScope theme={td.trip.theme} />}
      <Screen
        header={<BackHeader title="审核建议" />}
        bottom={
          sg && pending ? (
            <Button icon="CheckCircle2" disabled={busy} onClick={() => void confirm()}>
              {busy ? '处理中…' : `确认（接受 ${acc} · 不采纳 ${rej}）`}
            </Button>
          ) : undefined
        }
      >
        {sg === undefined ? (
          <p className={p.lockNote}>正在读取…</p>
        ) : !sg ? (
          <EmptyState title="找不到这条建议" text="可能已经被同伴撤回了。" compact />
        ) : (
          <div className={p.stack}>
            <Card className={p.cloudCard}>
              <div className={p.notifyHead}>
                <StatusChip variant={STATUS[sg.status].v}>{pending ? '待处理' : STATUS[sg.status].label}</StatusChip>
                <span className={p.notifyTrip}>{sg.authorName || '同伴'} · 基于 v{sg.baseVersion}</span>
                <span className={p.notifyTime}>{when(sg.createdAt)}</span>
              </div>
              {sg.note && <p className={p.notifyBody}>{sg.note}</p>}
              {pending && <p className={p.lockNote}>逐项选择「接受」或「不采纳」。接受的会写进你的行程，之后发布新版本，大家才会收到。</p>}
            </Card>
            {rows.map((r) => {
              const c = r.change;
              return (
                <Card key={c.itemId} className={p.cloudCard}>
                  <ChangeHead c={c} />
                  {c.op === 'change' && c.fields?.length ? <p className={p.lockNote}>改了：{c.fields.join('、')}</p> : null}
                  <div className={p.conflictCols}>
                    <div>
                      <p className={p.groupLabel}>现在</p>
                      <p className={p.diffText}>{isEntity(c) ? r.currentText ?? '（没有这一项）' : c.op === 'add' && !r.current ? '（没有这一项）' : brief(r.current)}</p>
                    </div>
                    <div>
                      <p className={p.groupLabel}>{sg.authorName || '同伴'} 的建议</p>
                      <p className={p.diffText}>{c.op === 'remove' ? '（删除这一项）' : isEntity(c) ? changeText(c) : brief(c.item)}</p>
                    </div>
                  </div>
                  {r.ownerChanged && pending && (
                    <InfoBanner variant="warning">
                      {c.op === 'add' ? '这一项你那边已经有了，接受会换成同伴的版本。' : (isEntity(c) ? r.currentText !== undefined : r.current) ? '同伴提交之后你又改过这一项，接受会换成同伴的版本。' : '这一项你已经删掉了，接受会按同伴的版本加回来。'}
                    </InfoBanner>
                  )}
                  {r.noDay && pending && <InfoBanner variant="warning">你的行程里没有 Day {c.dayIndex}，接受后会放到最后一天。</InfoBanner>}
                  {pending ? (
                    <FilterChips options={CHOICES} value={choice[c.itemId] ?? 'accept'} onChange={(v) => setChoice({ ...choice, [c.itemId]: v })} />
                  ) : (
                    <p className={p.lockNote}>{sg.decisions?.[c.itemId] === 'accept' ? '✓ 已接受' : '没有采纳'}</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Screen>
      <Dialog
        open={!!published}
        onClose={() => {
          setPublished(null);
          nav(`/trip/${tripId}/settings#sync`, { replace: true });
        }}
        title={`已接受 ${published?.accepted ?? 0} 处`}
        text="已经写进你的行程。现在发布新版本，大家（包括提建议的同伴）就会收到。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setPublished(null);
                nav(`/trip/${tripId}/settings#sync`, { replace: true });
              }}
            >
              稍后再发布
            </Button>
            <Button disabled={busy} onClick={() => void publishNow()}>
              {busy ? '发布中…' : '现在发布'}
            </Button>
          </>
        }
      />
    </>
  );
}
