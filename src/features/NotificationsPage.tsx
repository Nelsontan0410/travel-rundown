// 2026-10-19 通知页：同步中的旅程里，谁发布了更新（改了什么）、谁加入 / 退出 / 被移除。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, RootHeader } from '../components/Layout';
import { Button, Card, EmptyState, InfoBanner, StatusChip } from '../components/Basics';
import { useCloud } from '../store/cloud';
import { useTrips } from '../hooks/data';
import { toast } from '../store/ui';
import { refreshCloud } from '../cloud/session';
import { disablePush, enablePush, eventBody, eventLink, markAllSeen, pushOn, pushSupported } from '../cloud/notify';
import type { CloudEvent } from '../cloud/backend';

const KIND: Record<string, { label: string; variant: 'info' | 'success' | 'neutral' }> = {
  publish: { label: '更新', variant: 'info' },
  join: { label: '加入', variant: 'success' },
  leave: { label: '退出', variant: 'neutral' },
  remove: { label: '移除', variant: 'neutral' },
  suggest: { label: '建议', variant: 'info' },
  decide: { label: '处理', variant: 'success' },
};

function ago(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function counts(e: CloudEvent): string {
  const s = e.detail.summary;
  if (!s) return '';
  return [s.added && `新增 ${s.added}`, s.changed && `修改 ${s.changed}`, s.removed && `删除 ${s.removed}`, s.docs && `资料 ${s.docs}`, s.trip?.length && s.trip.join('、')]
    .filter(Boolean)
    .join(' · ');
}

export default function NotificationsPage() {
  const nav = useNavigate();
  const events = useCloud((s) => s.events);
  const seenId = useCloud((s) => s.seenId);
  const me = useCloud((s) => s.session?.userId);
  const trips = useTrips();
  const [push, setPush] = useState(pushOn());
  const [seenAtOpen] = useState(seenId);

  useEffect(() => {
    void refreshCloud().finally(markAllSeen);
  }, []);
  useEffect(() => {
    markAllSeen();
  }, [events.length]);

  const titleOf = (id: string) => trips?.find((t) => t.id === id)?.title ?? '旅程';
  const list = [...events].reverse();
  const anySync = !!trips?.some((t) => t.cloud);

  const togglePush = async () => {
    if (push) {
      disablePush();
      setPush(false);
      return toast('已关闭手机通知');
    }
    const ok = await enablePush();
    setPush(ok);
    toast(ok ? '已打开手机通知' : '没有拿到通知权限，可以在浏览器的网站设置里允许通知');
  };

  return (
    <Screen tab="notify" header={<RootHeader title="通知" icon="RotateCcw" iconLabel="刷新" onIcon={() => void refreshCloud().then(() => toast('已刷新'))} />}>
      <div className={p.stack}>
        {pushSupported() && anySync && (
          <Card className={p.cloudCard}>
            <p className={p.cloudTitle}>手机通知</p>
            <p className={p.lockNote}>
              {push
                ? '已打开：App 在后台时，有人发布更新或加入 / 退出，手机会弹出通知。'
                : '打开后，App 在后台时，有人发布更新或加入 / 退出，手机会弹出通知。'}
              App 完全关掉（从最近任务里划掉）时收不到，下次打开会在这里看到。
            </p>
            <Button variant="outline" icon="Bell" onClick={() => void togglePush()}>
              {push ? '关闭手机通知' : '打开手机通知'}
            </Button>
          </Card>
        )}

        {!anySync ? (
          <EmptyState title="还没有同步中的旅程" text="在旅程设置 → 同步与同伴 开启同步或用邀请码加入后，大家的更新会出现在这里。" compact />
        ) : list.length === 0 ? (
          <EmptyState title="还没有通知" text="主用户发布更新、同伴加入或退出时，会出现在这里。" compact />
        ) : (
          <ul className={p.notifyList}>
            {list.map((e) => {
              const k = KIND[e.kind] ?? { label: '动态', variant: 'neutral' as const };
              const fresh = e.id > seenAtOpen && e.actorId !== me;
              const body = eventBody(e);
              const c = counts(e);
              return (
                <li key={e.id}>
                  <button type="button" className={`${p.notifyItem} ${fresh ? p.notifyFresh : ''}`} onClick={() => void eventLink(e).then((u) => nav(u))}>
                    <div className={p.notifyHead}>
                      <StatusChip variant={e.detail.important ? 'info' : k.variant}>{e.detail.important ? '重要' : k.label}</StatusChip>
                      <span className={p.notifyTrip}>{titleOf(e.tripId)}</span>
                      <span className={p.notifyTime}>{ago(e.createdAt)}</span>
                    </div>
                    <p className={p.inviteTitle}>
                      {e.actorId === me ? e.title.replace(/^\S+ /, '你 ') : e.title}
                    </p>
                    {body && <p className={p.notifyBody}>{body}</p>}
                    {c && <p className={p.lockNote}>{c}</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {anySync && (
          <InfoBanner variant="info">只有用同步的旅程才有通知。每台手机各自记录读过哪些。</InfoBanner>
        )}
      </div>
    </Screen>
  );
}
