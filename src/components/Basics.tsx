import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './Basics.module.css';
import { AlertFilled, CheckFilled, Icon, Logo, type IconKey } from './Icon';

type BtnVariant = 'primary' | 'outline' | 'link' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'lg' | 'sm';
  icon?: IconKey;
  block?: boolean;
  chevron?: boolean;
}

/** Button：primary / outline / link；大号、小号 */
export function Button({ variant = 'primary', size = 'lg', icon, block, chevron, className, children, ...rest }: ButtonProps) {
  const cls = [s.btn, variant === 'link' ? s.link : s[size], s[variant], block ? s.block : '', className ?? ''].join(' ');
  const showChevron = chevron ?? variant === 'link';
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 'xs' : 'sm'} />}
      {children}
      {showChevron && <Icon name="ChevronRight" size="xs" />}
    </button>
  );
}

export function IconButton({ icon, label, onClick }: { icon: IconKey; label: string; onClick?: () => void }) {
  return (
    <button type="button" className={s.iconBtn} aria-label={label} onClick={onClick}>
      <Icon name={icon} size="sm" />
    </button>
  );
}

export type ChipVariant = 'success' | 'info' | 'neutral';

export function StatusChip({ variant, children }: { variant: ChipVariant; children: ReactNode }) {
  return (
    <span className={`${s.chip} ${s[`chip-${variant}`]}`}>
      {variant === 'success' && <CheckFilled size="chip" color="var(--color-success)" />}
      {children}
    </span>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={s.filters} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`${s.filter} ${o.value === value ? s.filterOn : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function InfoBanner({
  variant,
  children,
  action,
  onClick,
}: {
  variant: 'success' | 'info' | 'warning';
  children: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={`${s.banner} ${s[`banner-${variant}`]}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {variant === 'success' && <CheckFilled size="sm" color="var(--color-success)" />}
      {variant === 'info' && <Icon name="Info" size="sm" color="var(--color-icon)" />}
      {variant === 'warning' && <AlertFilled size="sm" color="var(--color-warning)" />}
      <span className={s.bannerText}>{children}</span>
      {action}
    </div>
  );
}

export function SectionTitle({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <h2 className={s.section} style={first ? { marginTop: 'var(--space-4)' } : undefined}>
      {children}
    </h2>
  );
}

export function NoteBox({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${s.note} ${className ?? ''}`}>{children}</div>;
}

export function IconTile({ icon, warn, large }: { icon: IconKey; warn?: boolean; large?: boolean }) {
  return (
    <span className={`${s.tile} ${warn ? s.tileWarn : ''} ${large ? s.tileLg : ''}`}>
      <Icon name={icon} size="md" />
    </span>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`${s.card} ${className ?? ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {children}
    </div>
  );
}

export function EmptyState({ title, text, action, compact }: { title: string; text?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`${s.empty} ${compact ? s.emptyCompact : ''}`}>
      <Logo size="xl" color="var(--color-text-3)" />
      <p className={s.emptyTitle}>{title}</p>
      {text && <p className={s.emptyText}>{text}</p>}
      {action}
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className={s.emptyLine}>{children}</p>;
}

export function Caption({ children, align }: { children: ReactNode; align?: 'right' | 'center' }) {
  return (
    <p className={s.caption} style={align ? { textAlign: align } : undefined}>
      {children}
    </p>
  );
}
