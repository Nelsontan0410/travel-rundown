// 2026-10-19 首次使用：两条路径「创建旅程」「加入旅程」；没有旅程时各页面给出下一步。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Button, Card, EmptyState } from '../components/Basics';
import { Field, TextInput } from '../components/Form';
import { Icon } from '../components/Icon';
import { normalizeCode } from '../cloud/sync';
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
            用邀请码加入
          </Button>
        </div>
      }
    />
  );
}

/** 创建旅程：首选粘贴文字，次选导入文件，模板 / AI 提示词是可选辅助 */
export function CreateTripCard({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  const onFile = async () => {
    if (await importFile()) nav('/import/preview');
  };
  return (
    <Card className={p.pathCard}>
      <div className={p.pathHead}>
        <Icon name="FileUp" size="lg" color="var(--color-primary)" />
        <div>
          <h2 className={p.pathTitle}>创建旅程</h2>
          {!compact && <p className={p.lockNote}>粘贴整理好的行程文字，先预览、确认后才保存到这台设备。</p>}
        </div>
      </div>
      <Button block onClick={() => nav('/import/paste')}>
        粘贴行程文字
      </Button>
      <Button block variant="outline" onClick={() => void onFile()}>
        导入文件（Markdown / JSON / CSV）
      </Button>
      <Button variant="link" onClick={() => nav('/import/template')}>
        还没整理好？用 AI 整理行程（可选）
      </Button>
    </Card>
  );
}

/** 加入旅程：输入邀请码（或打开主用户发来的邀请链接） */
export function JoinTripCard({ compact }: { compact?: boolean }) {
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
    <Card className={p.pathCard}>
      <div className={p.pathHead} id="join">
        <Icon name="Globe" size="lg" color="var(--color-primary)" />
        <div>
          <h2 className={p.pathTitle}>加入旅程</h2>
          {!compact && <p className={p.lockNote}>同伴发来邀请链接时直接点开；只有邀请码的话填在这里。不用注册。</p>}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <Field label="邀请码" error={err || undefined}>
          <TextInput
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="例如 ABCDE-FGHJK"
            onChange={(e) => {
              setCode(e.target.value);
              setErr('');
            }}
          />
        </Field>
        <div className={p.sheetActions}>
          <Button block variant="outline" type="submit">
            加入
          </Button>
        </div>
      </form>
    </Card>
  );
}
