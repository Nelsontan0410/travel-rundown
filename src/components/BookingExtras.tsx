// 2026-10 第一批 ②：预订卡片底部 —— 离线状态、外部链接 / 动态票码、全屏出示；以及资料页顶部的离线准备检查。
import s from './BookingExtras.module.css';
import { Button } from './Basics';
import { Icon } from './Icon';

export type OfflineVariant = 'success' | 'warning' | 'neutral';

export function OfflineChip({ variant, label }: { variant: OfflineVariant; label: string }) {
  return <span className={`${s.chip} ${s[variant]}`}>{label}</span>;
}

export interface LinkRow {
  id: string;
  title: string;
  dynamic: boolean;
  app?: string;
}

export function BookingFooter({
  offline,
  links,
  onOpenLink,
  onShow,
  showLabel = '全屏出示',
}: {
  offline: { variant: OfflineVariant; label: string; detail: string };
  links: LinkRow[];
  onOpenLink: (id: string) => void;
  onShow?: () => void;
  showLabel?: string;
}) {
  return (
    <div className={s.footer}>
      {links.map((l) => (
        <button key={l.id} type="button" className={s.link} onClick={() => onOpenLink(l.id)}>
          <Icon name={l.dynamic ? 'Ticket' : 'Globe'} size="sm" />
          <span className={s.linkText}>
            <span className={s.linkTitle}>{l.title}</span>
            <span className={s.linkSub}>{l.dynamic ? `动态票码${l.app ? ` · ${l.app}` : ''} · 现场需联网` : '网页链接 · 需联网'}</span>
          </span>
          <Icon name="ExternalLink" size="xs" />
        </button>
      ))}
      <div className={s.row}>
        <OfflineChip variant={offline.variant} label={offline.label} />
        <span className={s.detail}>{offline.detail}</span>
      </div>
      {onShow && (
        <Button block variant="outline" icon="Eye" onClick={onShow}>
          {showLabel}
        </Button>
      )}
    </div>
  );
}

/** 资料页顶部：离线准备检查 */
export function OfflineSummary({
  total,
  ready,
  rows,
  onPick,
}: {
  total: number;
  ready: number;
  rows: { id: string; title: string; sub: string; variant: OfflineVariant; label: string }[];
  onPick: (id: string) => void;
}) {
  const allOk = rows.length === 0;
  return (
    <section className={`${s.summary} ${allOk ? s.summaryOk : ''}`} aria-label="离线准备检查">
      <div className={s.sumHead}>
        <Icon name={allOk ? 'CheckCircle2' : 'AlertCircle'} size="sm" />
        <p className={s.sumTitle}>离线准备检查</p>
        <span className={s.sumCount}>
          {ready} / {total} 项可离线出示
        </span>
      </div>
      {allOk ? (
        <p className={s.sumText}>所有预订都有保存在本机的凭证，没网也能出示。</p>
      ) : (
        <ul className={s.sumList}>
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className={s.sumRow} onClick={() => onPick(r.id)}>
                <span className={s.sumRowText}>
                  <span className={s.linkTitle}>{r.title}</span>
                  <span className={s.linkSub}>{r.sub}</span>
                </span>
                <OfflineChip variant={r.variant} label={r.label} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
