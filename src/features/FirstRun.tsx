// 2026-10-19 首次使用：两条路径「创建旅程」「加入旅程」；没有旅程时各页面给出下一步。
// 手机 390×844 下，新用户首屏能看到：主按钮、次按钮、示例与模板、邀请入口。
// 2026-11-18：邀请码改成按邮箱邀请 —— 被邀请的人用那个邮箱登录就自动加入，这里只放说明和「检查邀请」。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Button, EmptyState } from '../components/Basics';
import { Icon, Logo } from '../components/Icon';
import { checkInvites } from '../cloud/session';
import { cloudErrorText } from '../cloud/backend';
import { useCloud } from '../store/cloud';
import { toast } from '../store/ui';
import { importFile } from './importFlow';

/** 没有选中旅程时：说明这页要旅程才能用，并给两个入口 */
export function NoTripState({ text }: { text: string }) {
  const nav = useNavigate();
  return (
    <EmptyState
      title="还没有旅程"
      text={text}
      action={
        <div className={p.emptyActions}>
          <Button onClick={() => nav('/import/paste')}>创建旅程</Button>
          <Button variant="outline" onClick={() => nav('/trips#join')}>
            收到邀请？
          </Button>
        </div>
      }
    />
  );
}

function useFileImport() {
  const nav = useNavigate();
  return async () => {
    if (await importFile()) nav('/import/preview');
  };
}

/** 收到邀请：用被邀请的邮箱登录就会自动加入；这里可以手动再检查一次 */
export function JoinRow() {
  const email = useCloud((st) => (st.session && !st.session.anonymous ? st.session.email : undefined));
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await checkInvites();
      toast(r.restored.length ? `已加入 ${r.restored.join('、')}` : r.failed.length ? `有 ${r.failed.length} 份旅程下载失败，稍后再试` : '暂时没有发给这个邮箱的新邀请');
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={p.joinBlock}>
      <p className={p.joinLabel} id="join">
        <Icon name="Globe" size="sm" />
        收到同伴的邀请？
      </p>
      <p id="join-hint" className={p.lockNote}>
        {email ? `主用户邀请 ${email} 后，旅程会自动出现在这里。` : '请主用户邀请你登录用的邮箱，旅程会自动出现在这里。'}
        用的是别的邮箱？在「账号」里退出，换那个邮箱登录。
      </p>
      <Button id="join-code" variant="outline" disabled={busy} onClick={() => void go()}>
        {busy ? '检查中…' : '检查邀请'}
      </Button>
    </div>
  );
}

/** 新用户首页 */
export function NewUserHome() {
  const nav = useNavigate();
  const onFile = useFileImport();
  return (
    <div className={p.newHome}>
      <div className={p.newHero}>
        <Logo size="xl" />
        <h2 className={p.newTitle}>下一段旅程，从这里开始</h2>
        <p className={p.newSub}>把整理好的行程放进来，出行时离线也能看，还能和同伴一起同步。</p>
      </div>
      <div className={p.newActions}>
        <Button block icon="FileText" onClick={() => nav('/import/paste')}>
          粘贴行程文字
        </Button>
        <Button block variant="outline" icon="FileUp" onClick={() => void onFile()}>
          导入文件
        </Button>
        <Button variant="link" onClick={() => nav('/import/template')}>
          查看示例与模板
        </Button>
      </div>
      <JoinRow />
      <p className={p.newFoot}>备份与恢复在右上角「…」里</p>
    </div>
  );
}

/** 已有旅程：创建和加入作为次级操作 */
export function CreateOrJoin() {
  const nav = useNavigate();
  const onFile = useFileImport();
  return (
    <div className={p.stack}>
      <div className={p.twoButtons}>
        <Button variant="outline" icon="FileText" onClick={() => nav('/import/paste')}>
          粘贴行程
        </Button>
        <Button variant="outline" icon="FileUp" onClick={() => void onFile()}>
          导入文件
        </Button>
      </div>
      <JoinRow />
    </div>
  );
}
