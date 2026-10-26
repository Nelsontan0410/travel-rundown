// 2026-10-26 账号：Google 登录 / 邮箱注册登录 / 从云端找回旅程 / 退出。
// 主用户必须用账号：换手机、清缓存后重新登录就能找回旅程。同伴可以先匿名加入，之后在这里绑定账号（不会丢已加入的旅程）。
import { useState } from 'react';
import p from './Page.module.css';
import { Sheet } from '../components/Layout';
import { Button, InfoBanner } from '../components/Basics';
import { Field, TextInput } from '../components/Form';
import { useCloud } from '../store/cloud';
import { toast } from '../store/ui';
import { cloudErrorText } from '../cloud/backend';
import { hasAccount, restoreFromCloud, signInWithEmail, signInWithGoogle, signOutAccount, signUpWithEmail } from '../cloud/session';

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useCloud((s) => s.session);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const signedIn = hasAccount(session);
  const anonymous = !!session && !!session.anonymous;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const google = () =>
    run(async () => {
      setMsg('正在跳转到 Google…');
      await signInWithGoogle();
    });

  const submit = () =>
    run(async () => {
      if (!email.trim()) throw new Error('请填邮箱');
      if (pw.length < 6) throw new Error('密码太短：至少 6 位');
      if (mode === 'up') {
        const r = await signUpWithEmail(email, pw);
        if (r.needsConfirm) {
          setMsg(`确认邮件已发到 ${email.trim()}。点邮件里的链接确认后，回到这里用邮箱和密码登录。`);
          setMode('in');
          setPw('');
          return;
        }
        toast('已注册并登录');
      } else {
        await signInWithEmail(email, pw);
        toast('已登录');
      }
      onClose();
    });

  const restore = () =>
    run(async () => {
      const r = await restoreFromCloud();
      if (r.restored.length) toast(`已找回：${r.restored.join('、')}`);
      else if (r.failed.length) throw new Error(`「${r.failed.join('、')}」下载失败，请检查网络后再试`);
      else toast('云端没有需要找回的旅程（本机已经都有了）');
    });

  const out = () =>
    run(async () => {
      await signOutAccount();
      toast('已退出登录，本机的旅程还在');
      onClose();
    });

  return (
    <Sheet open={open} onClose={onClose} title="账号">
      {signedIn ? (
        <>
          <p className={p.lockNote}>已登录：{session?.email || '账号'}</p>
          <InfoBanner variant="info">换手机或清除网站资料后，重新登录就能找回已开启同步的旅程。完成勾选、实际记账、穿搭打包只在本机，找不回来。</InfoBanner>
          <div className={p.sheetActions}>
            <Button block disabled={busy} onClick={() => void restore()}>
              {busy ? '处理中…' : '从云端找回旅程'}
            </Button>
            <Button block variant="outline" disabled={busy} onClick={() => void out()}>
              退出登录
            </Button>
          </div>
        </>
      ) : (
        <>
          {anonymous ? (
            <InfoBanner variant="warning">这台手机现在是临时身份，清除网站资料后就找不回已加入或已发布的旅程。绑定 Google 或邮箱后就不怕了，已有的旅程不受影响。</InfoBanner>
          ) : (
            <InfoBanner variant="info">登录后，开启同步的旅程存在云端；换手机或清缓存后重新登录就能找回。</InfoBanner>
          )}
          <div className={p.sheetActions}>
            <Button block disabled={busy} onClick={() => void google()}>
              用 Google 登录
            </Button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="邮箱">
              <TextInput type="email" value={email} autoComplete="email" inputMode="email" autoCapitalize="none" placeholder="name@example.com" aria-label="邮箱" onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="密码" hint="至少 6 位">
              <TextInput type="password" value={pw} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} aria-label="密码" onChange={(e) => setPw(e.target.value)} />
            </Field>
            <div className={p.sheetActions}>
              <Button block type="submit" variant="outline" disabled={busy}>
                {mode === 'up' ? '邮箱注册' : '邮箱登录'}
              </Button>
              <Button type="button" variant="link" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
                {mode === 'up' ? '已有账号？去登录' : '没有账号？邮箱注册'}
              </Button>
            </div>
          </form>
        </>
      )}
      {msg && (
        <p className={p.pasteError} role="alert">
          {msg}
        </p>
      )}
    </Sheet>
  );
}
