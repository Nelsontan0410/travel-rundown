// 图标对照（设计参考「组件库 · 图标对照」）。全部是 lucide-react 线性图标；
// 需要「实心」的几处（Tab 激活、勾圆、实心 AlertCircle）用同一套 lucide 几何画成填充版。
import {
  AlertCircle,
  Bell,
  Building2,
  CalendarDays,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  FileUp,
  Globe,
  Home,
  Image,
  Info,
  Languages,
  Lock,
  LockOpen,
  MapPin,
  Minus,
  MoreHorizontal,
  Mountain,
  Navigation,
  Paperclip,
  Plane,
  Plus,
  RotateCcw,
  Settings,
  StickyNote,
  Ticket,
  TrainFront,
  Trash2,
  Upload,
  Utensils,
  Wallet,
  Pencil,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';

export const ICONS = {
  AlertCircle,
  Bell,
  Building2,
  CalendarDays,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  FileUp,
  Globe,
  Home,
  Image,
  Info,
  Languages,
  Lock,
  LockOpen,
  MapPin,
  Minus,
  MoreHorizontal,
  Mountain,
  Navigation,
  Paperclip,
  Plane,
  Plus,
  RotateCcw,
  Settings,
  StickyNote,
  Ticket,
  TrainFront,
  Trash2,
  Upload,
  Utensils,
  Wallet,
  Pencil,
  ExternalLink,
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;

interface IconProps {
  name: IconKey;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'chip';
  color?: string;
  className?: string;
  style?: CSSProperties;
}

const SIZE_VAR = {
  chip: 'var(--size-icon-chip)',
  xs: 'var(--size-icon-xs)',
  sm: 'var(--size-icon-sm)',
  md: 'var(--size-icon)',
  lg: 'var(--size-icon-lg)',
  xl: 'var(--size-icon-xl)',
};

export function Icon({ name, size = 'md', color, className, style }: IconProps) {
  const C = ICONS[name];
  const s = SIZE_VAR[size];
  return (
    <C
      aria-hidden
      className={className}
      strokeWidth={1.75}
      style={{ width: s, height: s, color, ...style }}
    />
  );
}

interface FilledProps {
  size?: 'chip' | 'xs' | 'sm' | 'md';
  color: string;
}

function svgBox(size: FilledProps['size']) {
  const s = SIZE_VAR[size ?? 'sm'];
  return { width: s, height: s, flexShrink: 0 } as CSSProperties;
}

/** 实心勾圆：用在 success 芯片、提示条和 ReadinessRow */
export function CheckFilled({ size = 'chip', color }: FilledProps) {
  return (
    <svg viewBox="0 0 24 24" style={svgBox(size)} aria-hidden>
      <circle cx="12" cy="12" r="11" fill={color} />
      <path d="m8 12 3 3 5-6" fill="none" stroke="var(--color-surface)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 实心 AlertCircle */
export function AlertFilled({ size = 'sm', color }: FilledProps) {
  return (
    <svg viewBox="0 0 24 24" style={svgBox(size)} aria-hidden>
      <circle cx="12" cy="12" r="11" fill={color} />
      <path d="M12 7v6" stroke="var(--color-surface)" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M12 16.5h.01" stroke="var(--color-surface)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Tab 栏激活时的填充版图标（lucide 同一套几何） */
export function TabIconFilled({ name }: { name: 'Home' | 'CalendarDays' | 'FileText' | 'Bell' }) {
  const common = { width: 'var(--size-icon)', height: 'var(--size-icon)' } as CSSProperties;
  const inner = { stroke: 'var(--color-surface)', strokeWidth: 1.75, strokeLinecap: 'round' as const, fill: 'none' };
  const outer = { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.75, strokeLinejoin: 'round' as const };
  if (name === 'Home')
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden>
        <path {...outer} d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M14.5 21v-7a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v7z" fill="var(--color-surface)" />
      </svg>
    );
  if (name === 'Bell')
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden>
        <path {...outer} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
      </svg>
    );
  if (name === 'CalendarDays')
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden>
        <rect {...outer} x="3" y="4" width="18" height="18" rx="2" />
        <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
        <path {...inner} d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" strokeWidth={2} />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" style={common} aria-hidden>
      <path {...outer} d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path {...inner} d="M10 9H8M16 13H8M16 17H8" />
    </svg>
  );
}

/** Logo：两座连续山峰的折线加一条底线，自绘 SVG */
export function Logo({ size = 'md', color = 'var(--color-primary)' }: { size?: 'md' | 'xl'; color?: string }) {
  const s = SIZE_VAR[size];
  return (
    <svg viewBox="0 0 24 24" style={{ width: s, height: s, flexShrink: 0 }} aria-hidden fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 18 9 6.5l4.5 8 2.5-4 5.5 7.5" />
      <path d="M2 18h20" />
    </svg>
  );
}
