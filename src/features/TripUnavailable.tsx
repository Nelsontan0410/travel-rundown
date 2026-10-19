// 2026-10-19：打开某份旅程的链接，但这台设备上没有这份旅程时显示（以前会直接跳到「还没有旅程」，看不出原因）。
// 原因：行程保存在每台设备自己的本机数据库里；网址只是「这台设备上的这份旅程」，不是分享链接。
// 分几种情况说明：链接格式不对 / 没网 / 这台设备用过同步且是成员（可以直接下载）/ 其他（需要邀请码）。
// 不会为了检查而新建同步身份，也不会公开任何行程。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader } from '../components/Layout';
import { Button, Card, EmptyState, InfoBanner } from '../components/Basics';
import { Field, TextInput } from '../components/Form';
import { backend, cloudErrorText } from '../cloud/backend';
import { applyUpdate, normalizeCode } from '../cloud/sync';
import { refreshCloud } from '../cloud/session';
import { toast } from '../store/ui';
import type { TabKey } from '../components/Layout';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = 'checking' | 'invalid' | 'offline' | 'member' | 'none' | 'error';

export default function TripUnavailable({ tripId, tab, title = '旅程' }: { tripId: string; tab?: TabKey; title?: string }) {
  const nav = useNavigate();
  const [state, setState] = useState<State>('checking');
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (!UUID.test(tripId)) return setState('invalid');
    setState('checking');
    try {
      const be = await backend();
      const s = await be.getSession();
      // 这台设备没用过同步：不去联网，直接说明要邀请码
      if (!s) return setState('none');
      if (navigator.onLine === false) return setState('offline');
      const info = await be.latest([tripId]);
      setState(info.length ? 'member' : 'none');
    } catch (e) {
      setErr(cloudErrorText(e));
      setState(navigator.onLine === false ? 'offline' : 'error');
    }
  };
  useEffect(() => {
    void check();
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setBusy(true);
    try {
      const be = await backend();
      const v = await be.fetchVersion(tripId);
      if (!v) throw new Error('主用户还没有发布任何版本');
      await applyUpdate(tripId, v);
      await refreshCloud();
      toast('已下载到这台设备');
      // 页面会自动显示（本机数据库一有这份旅程就重画）
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const join = () => {
    const c = normalizeCode(code);
    if (!c) return setCodeErr('请填主用户给你的邀请码');
    if (c.length < 6) return setCodeErr('邀请码太短了，请检查一下（一般是 10 位，例如 ABCDE-FGHJK）');
    nav(`/join/${c}`);
  };

  return (
    <Screen tab={tab} header={tab ? undefined : <BackHeader title={title} />}>
      {state === 'checking' ? (
        <p className={p.lockNote} role="status">
          正在查找这份旅程…
        </p>
      ) : state === 'invalid' ? (
        <EmptyState
          title="链接不完整或已失效"
          text="这个网址里的旅程编号不对。请回到「我的旅程」打开，或让分享给你的人重新发一次邀请。"
          action={<Button onClick={() => nav('/trips')}>去我的旅程</Button>}
        />
      ) : state === 'member' ? (
        <div className={p.stack}>
          <EmptyState title="这台设备上还没有这份旅程" text="你已经是这份旅程的同伴，可以直接把最新版本下载到这台设备。" compact />
          <Button icon="Download" disabled={busy} onClick={() => void download()}>
            {busy ? '下载中…' : '下载到这台设备'}
          </Button>
        </div>
      ) : (
        <div className={p.stack}>
          <EmptyState
            title="这台设备上没有这份旅程"
            text="行程保存在加入过的设备里，直接复制网址不能分享。如果有人邀请你，请输入邀请码加入，加入后会打开这份行程。"
            compact
          />
          {state === 'offline' && <InfoBanner variant="warning">现在没有网络，暂时无法确认或加入。联网后再试。</InfoBanner>}
          {state === 'error' && (
            <InfoBanner
              variant="warning"
              action={
                <Button size="sm" variant="outline" onClick={() => void check()}>
                  重试
                </Button>
              }
            >
              暂时连不上同步服务：{err}
            </InfoBanner>
          )}
          <Card className={p.cloudCard}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <Field label="邀请码" hint="主用户在「旅程设置 → 同步与同伴」生成后发给你" error={codeErr || undefined}>
                <TextInput
                  value={code}
                  autoCapitalize="characters"
                  placeholder="例如 ABCDE-FGHJK"
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeErr('');
                  }}
                />
              </Field>
              <div className={p.sheetActions}>
                <Button block type="submit">
                  用邀请码加入
                </Button>
              </div>
            </form>
          </Card>
          <Button variant="outline" onClick={() => nav('/trips')}>
            去我的旅程
          </Button>
        </div>
      )}
    </Screen>
  );
}
