import type { ReactNode } from 'react';
import s from './Ledger.module.css';
import { Card, IconTile } from './Basics';
import { Icon, type IconKey } from './Icon';

/** 账本概览：预算 / 已花 / 剩余 + 进度条 */
export function LedgerSummaryCard({
  budget,
  spent,
  left,
  fmt,
  onClick,
  title = '旅行账本',
  action,
}: {
  budget?: number;
  spent: number;
  left?: number;
  fmt: (n: number) => string;
  onClick?: () => void;
  title?: string;
  action?: ReactNode;
}) {
  const over = left !== undefined && left < 0;
  const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
  const body = (
    <>
      <div className={s.top}>
        <Icon name="Wallet" size="sm" />
        <span className={s.title}>{title}</span>
        {action}
        {onClick && <Icon name="ChevronRight" size="xs" />}
      </div>
      <div className={s.nums}>
        <div className={s.num}>
          <span className={s.numLabel}>总预算</span>
          <span className={s.numValue}>{budget === undefined ? '未设置' : fmt(budget)}</span>
        </div>
        <div className={s.num}>
          <span className={s.numLabel}>已花</span>
          <span className={s.numValue}>{fmt(spent)}</span>
        </div>
        <div className={s.num}>
          <span className={s.numLabel}>{over ? '超支' : '剩余'}</span>
          <span className={`${s.numValue} ${over ? s.over : ''}`}>{left === undefined ? '—' : fmt(Math.abs(left))}</span>
        </div>
      </div>
      {budget !== undefined && (
        <div className={s.bar}>
          <div className={`${s.fill} ${over ? s.fillOver : ''}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
  );
  return (
    <Card>
      {onClick ? (
        <button type="button" className={s.card} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={s.card}>{body}</div>
      )}
    </Card>
  );
}

export function CategoryBreakdown({ rows, fmt }: { rows: { label: string; amount: number }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Card className={s.cats}>
      {rows.map((r) => (
        <div key={r.label} className={s.cat}>
          <span>{r.label}</span>
          <div className={s.catBar}>
            <div className={s.catFill} style={{ width: `${(r.amount / max) * 100}%` }} />
          </div>
          <span className={s.catAmt}>{fmt(r.amount)}</span>
        </div>
      ))}
    </Card>
  );
}

export function LedgerDay({ label, total }: { label: string; total: string }) {
  return (
    <p className={s.day}>
      <span>{label}</span>
      <span>{total}</span>
    </p>
  );
}

export function ExpenseRow({ icon, title, sub, amount, onClick }: { icon: IconKey; title: string; sub?: string; amount: string; onClick?: () => void }) {
  return (
    <button type="button" className={s.row} onClick={onClick}>
      <IconTile icon={icon} />
      <span className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </span>
      <span className={s.rowAmt}>{amount}</span>
    </button>
  );
}
