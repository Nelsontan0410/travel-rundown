import type { InputHTMLAttributes, ReactNode } from 'react';
import s from './Form.module.css';

/** 表单字段：标题 + 输入 + 说明 / 错误 */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.label}>{label}</span>
      {children}
      {error ? <span className={s.error}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </label>
  );
}

export function TextInput({ money, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { money?: boolean }) {
  return <input className={`${s.input} ${money ? s.money : ''} ${className ?? ''}`} {...rest} />;
}

export function SwitchRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={s.switchRow} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`${s.switch} ${on ? s.switchOn : ''}`} />
    </button>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={s.actions}>{children}</div>;
}
