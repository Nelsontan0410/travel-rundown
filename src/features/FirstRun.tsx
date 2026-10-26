// 2026-10-19 首次使用：两条路径「创建旅程」「加入旅程」；没有旅程时各页面给出下一步。
// 手机 390×844 下，新用户首屏能看到：主按钮、次按钮、示例与模板、邀请码入口。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Button, EmptyState } from '../components/Basics';
import { TextInput } from '../components/Form';
import { Icon, Logo } from '../components/Icon';
import { normalizeCode } from '../cloud/sync';
import { importFile } from './importFlow';
import { AccountSheet } from './AccountSheet';

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
            用邀请码加入
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

/** 邀请码一行：输入 + 加入，格式不对就地提示 */
export function JoinRow() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    const c = normalizeCode(code);
    if (!c) return setErr('请填主用户给你的邀请码');
    if (!/^[A-Z0-9]{6,16}$/.test(c)) return setErr('邀请码格式不对：一般是 10 位字母和数字，例如 ABCDE-FGHJK');
    nav(`/join/${c}`);
  };
  return (
    <form
      className={p.joinBlock}
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <label htmlFor="join-code" className={p.joinLabel} id="join">
        <Icon name="Globe" size="sm" />
        收到同伴的邀请？
      </label>
      <div className={p.joinRow}>
        <TextInput
          id="join-code"
          value={code}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="输入邀请码"
          aria-describedby={err ? 'join-err' : 'join-hint'}
          aria-invalid={err ? true : undefined}
          onChange={(e) => {
            setCode(e.target.value);
            setErr('');
          }}
        />
        <Button type="submit">加入</Button>
      </div>
      {err ? (
        <p id="join-err" className={p.pasteError} role="alert">
          {err}
        </p>
      ) : (
        <p id="join-hint" className={p.lockNote}>
          邀请链接直接点开即可；只有邀请码就填在这里，不用注册。
        </p>
      )}
    </form>
  );
}

/** 新用户首页 */
export function NewUserHome() {
  const nav = useNavigate();
  const onFile = useFileImport();
  const [account, setAccount] = useState(false);
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
        <Button variant="link" onClick={() => setAccount(true)}>
          已有账号？登录找回旅程
        </Button>
      </div>
      <JoinRow />
      <p className={p.newFoot}>备份与恢复在右上角「…」里</p>
      <AccountSheet open={account} onClose={() => setAccount(false)} />
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
