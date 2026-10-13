import { useEffect, useState } from 'react';
import { Sheet } from './Layout';
import { Button } from './Basics';
import { Field, FormActions, TextInput } from './Form';

/**
 * 输入密码 / 设置密码。
 * mode=unlock：一个密码框，显示提示语；onSubmit 返回错误文字时显示在框下。
 * mode=set：密码 + 确认 + 提示语（可选），并提醒忘记密码无法恢复。
 */
export default function PasswordSheet({
  open,
  onClose,
  mode,
  title,
  hint,
  minLength = 4,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'unlock' | 'set';
  title: string;
  hint?: string;
  minLength?: number;
  onSubmit: (password: string, hint?: string) => Promise<string | void>;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [h, setH] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPw('');
      setPw2('');
      setH('');
      setErr('');
    }
  }, [open]);

  const submit = async () => {
    if (pw.length < minLength) return setErr(`密码至少 ${minLength} 位`);
    if (mode === 'set' && pw !== pw2) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      const e = await onSubmit(pw, mode === 'set' ? h.trim() || undefined : undefined);
      if (e) setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="密码" hint={mode === 'unlock' && hint ? `提示：${hint}` : undefined} error={err || undefined}>
          <TextInput type="password" autoComplete={mode === 'set' ? 'new-password' : 'current-password'} value={pw} autoFocus onChange={(e) => { setPw(e.target.value); setErr(''); }} />
        </Field>
        {mode === 'set' && (
          <>
            <Field label="再输入一次">
              <TextInput type="password" autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErr(''); }} />
            </Field>
            <Field label="密码提示（可选）" hint="密码只在这台设备上加密使用，不会保存。忘记密码将无法打开这份文件。">
              <TextInput value={h} maxLength={40} onChange={(e) => setH(e.target.value)} />
            </Field>
          </>
        )}
        <FormActions>
          <Button type="submit" disabled={busy}>
            {mode === 'set' ? '设置密码' : '打开'}
          </Button>
        </FormActions>
      </form>
    </Sheet>
  );
}
