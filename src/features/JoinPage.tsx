// 2026-10-18 同步：同伴打开邀请链接 / 输入邀请码 → 看到是哪份旅程 → 填名字 → 加入并下载行程
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader } from '../components/Layout';
import { Button, Card, EmptyState, InfoBanner } from '../components/Basics';
import { toast } from '../store/ui';
import { backend, cloudErrorText, type InvitePeek } from '../cloud/backend';
import { ensureCloudSession, myName, refreshCloud, setMyName } from '../cloud/session';
import { joinWithCode, normalizeCode, prettyCode } from '../cloud/sync';
import { db } from '../db/schema';
import { NameField } from './CloudParts';

export default function JoinPage() {
  const nav = useNavigate();
  const code = normalizeCode(useParams().code ?? '');
  const [peek, setPeek] = useState<InvitePeek | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [name, setName] = useState(myName());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureCloudSession();
        const r = await (await backend()).peekInvite(code);
        if (!alive) return;
        setPeek(r);
        if (r && !myName() && r.name) setName(r.name);
      } catch (e) {
        if (!alive) return;
        setErr(cloudErrorText(e));
        setPeek(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  const join = async () => {
    if (!name.trim()) return toast('填你的名字，主用户会看到');
    setBusy(true);
    try {
      setMyName(name);
      const id = await joinWithCode(code, name);
      await refreshCloud();
      toast(`已加入「${peek?.tripTitle ?? '旅程'}」`);
      nav(`/itinerary/${id}`, { replace: true });
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const openMine = async () => {
    if (peek && (await db.trips.get(peek.tripId))) nav(`/itinerary/${peek.tripId}`, { replace: true });
    else void join();
  };

  return (
    <Screen
      tab="trips"
      header={<BackHeader title="加入旅程" />}
      bottom={
        peek && peek.usable && !peek.mine ? (
          <Button icon="Download" disabled={busy} onClick={() => void join()}>
            {busy ? '加入中…' : '加入并下载行程'}
          </Button>
        ) : undefined
      }
    >
      {peek === undefined ? (
        <p className={p.lockNote}>正在读取邀请…</p>
      ) : !peek ? (
        <EmptyState title="这个邀请用不了" text={err || `邀请码 ${prettyCode(code)} 不对，或者已被主用户撤回。请主用户重新分享一次。`} compact />
      ) : peek.mine ? (
        <EmptyState
          title="你已经在这份旅程里了"
          text={peek.tripTitle}
          action={<Button onClick={() => void openMine()}>打开行程</Button>}
          compact
        />
      ) : !peek.usable ? (
        <EmptyState title="这个邀请已经被用过了" text="每个邀请只能给一台手机用。请主用户为你重新生成一个。" compact />
      ) : (
        <div className={p.stack}>
          <Card className={p.cloudCard}>
            <p className={p.cloudTitle}>{peek.tripTitle}</p>
            <p className={p.lockNote}>{peek.inviterName ? `${peek.inviterName} 邀请你一起看这份行程` : '主用户邀请你一起看这份行程'}</p>
          </Card>
          <NameField value={name} onChange={setName} />
          <InfoBanner variant="info">
            加入后行程会存进这台手机，没网也能看。主用户发布更新时你会收到提醒，自己决定要不要套用。完成勾选、记账、穿搭打包都只是你自己的。
          </InfoBanner>
          <p className={p.lockNote}>{`想用主屏幕上的 App 看？不要在这里加入，改在 App 的「旅程」页输入邀请码 ${prettyCode(code)}（一个邀请码只能在一个地方用）。`}</p>
        </div>
      )}
    </Screen>
  );
}
