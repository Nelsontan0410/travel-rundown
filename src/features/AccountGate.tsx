// 2026-11-15 登录门禁：登录了才能看到行程。
// - 没登录：只显示登录页（Google / 邮箱）。收到邀请链接的同伴也先登录，登录后回到邀请页。
// - 登录后：云端只有一份行程，主用户和同伴看到的都是云端那一份；本机还没上云的行程自动备份成云端那一份。
// - 本机数据属于第一次登录的账号：退出登录后看不到，同一个账号再登录就恢复；别的账号登录时不会看到它（可选择清掉）。
// - 出国没网时：本机记着「已登录」，照常打开。
import { useEffect, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { useLocation, useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { AccountForm } from './AccountSheet';
import { Button, InfoBanner } from '../components/Basics';
import { db } from '../db/schema';
import { useCloud } from '../store/cloud';
import { toast } from '../store/ui';
import {
  accountMarker,
  autoSyncLocalTrips,
  checkLocalOwner,
  clearLocalDataFor,
  hasAccount,
  initCloud,
  localOwner,
  rememberAccount,
  rememberAfterLogin,
  requestPersistentStorage,
  signOutAccount,
  takeAfterLogin,
} from '../cloud/session';

function LoginPage() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith('/join/')) rememberAfterLogin(pathname);
  }, [pathname]);
  const invited = pathname.startsWith('/join/');
  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '48px 20px 32px' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>同行吧 tongxing8</h1>
      {invited && (
        <p className={p.lockNote} style={{ marginBottom: 16 }}>
          你收到了同伴的邀请。先登录，登录后会回到邀请页。
        </p>
      )}
      <AccountForm onClose={() => undefined} gate />
    </div>
  );
}

function OtherOwner({ onDone }: { onDone: () => void }) {
  const session = useCloud((s) => s.session);
  const mine = accountMarker();
  const owner = localOwner();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = owner?.email || '另一个账号';
  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '48px 20px 32px' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>这台设备上的数据属于别的账号</h1>
      <InfoBanner variant="warning">
        这台设备上保存的行程和私人资料属于 {who}，你现在登录的是 {mine?.email || session?.email || '另一个账号'}，所以不会显示它们。
      </InfoBanner>
      <p className={p.lockNote}>想用现在的账号：先清除本机数据（{who} 云端的行程不受影响，但她 / 他放在这台设备上的私人资料会永久丢失）。也可以退出登录，让 {who} 自己再登录。</p>
      <div className={p.sheetActions}>
        {confirm ? (
          <Button
            block
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void clearLocalDataFor({ userId: (mine ?? { userId: '' }).userId, email: mine?.email })
                .then(() => {
                  toast('已清除本机数据');
                  onDone();
                })
                .finally(() => setBusy(false));
            }}
          >
            确认清除并使用当前账号
          </Button>
        ) : (
          <Button block variant="outline" onClick={() => setConfirm(true)}>
            清除本机数据，使用当前账号
          </Button>
        )}
        <Button block variant="outline" onClick={() => void signOutAccount()}>
          退出登录
        </Button>
      </div>
    </div>
  );
}

export default function AccountGate({ children }: { children: ReactNode }) {
  const session = useCloud((s) => s.session); // undefined = 还在读取
  const nav = useNavigate();
  const loc = useLocation();
  const acct = session && hasAccount(session) ? session : null;
  const marker = accountMarker();
  const identity = acct ? { userId: acct.userId, email: acct.email } : marker;
  const [owner, setOwner] = useState<'ok' | 'other' | null>(null);

  useEffect(() => {
    requestPersistentStorage();
    void initCloud(true);
  }, []);

  useEffect(() => {
    if (acct) rememberAccount(acct);
  }, [acct?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const uid = identity?.userId;
  useEffect(() => {
    setOwner(identity ? checkLocalOwner(identity) : null);
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 登录后：收到邀请链接的人回到邀请页
  useEffect(() => {
    if (owner !== 'ok') return;
    const back = takeAfterLogin();
    if (back && back !== loc.pathname) nav(back, { replace: true });
  }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps

  // 云端只有一份：本机还没上云的行程自动备份
  useEffect(() => {
    if (!acct || owner !== 'ok') return;
    const run = () =>
      void autoSyncLocalTrips((n) => toast(`正在把 ${n} 份行程备份到云端…`)).then((r) => {
        if (r.done) toast(`已备份 ${r.done} 份行程到云端`);
        if (r.failed) toast(`${r.failed} 份行程备份失败，稍后会自动重试`);
      });
    const sub = liveQuery(() => db.trips.filter((t) => !t.cloud).count()).subscribe({ next: (n) => n > 0 && run(), error: () => undefined });
    window.addEventListener('online', run);
    return () => {
      sub.unsubscribe();
      window.removeEventListener('online', run);
    };
  }, [acct?.userId, owner]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!identity) return session === undefined ? null : <LoginPage />;
  if (owner === null) return null;
  if (owner === 'other') return <OtherOwner onDone={() => setOwner('ok')} />;
  return <>{children}</>;
}
