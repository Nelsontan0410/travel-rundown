import type { ReactNode } from 'react';
import s from './Cards.module.css';
import { Button, Card, IconButton, IconTile, InfoBanner, StatusChip, type ChipVariant } from './Basics';
import { AlertFilled, CheckFilled, Icon, type IconKey } from './Icon';
import { useBlobUrl } from '../hooks/data';

export function CopyIcon({ onClick, label = '复制' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={s.copyBtn} aria-label={label} onClick={onClick}>
      <Icon name="Copy" size="sm" />
    </button>
  );
}

/** FileRow：文件图标、文件名、已保存芯片 */
export function FileRow({
  title,
  mime,
  blobKey,
  saved,
  onClick,
  previewUrl,
}: {
  title: string;
  mime: string;
  blobKey: string;
  saved: boolean;
  onClick?: () => void;
  previewUrl?: string;
}) {
  const isImg = mime.startsWith('image/');
  const stored = useBlobUrl(isImg && saved ? blobKey : undefined);
  const url = previewUrl ?? stored;
  return (
    <button type="button" className={s.file} onClick={onClick} disabled={!onClick}>
      {isImg ? (
        url ? <img className={s.thumb} src={url} alt="" /> : <span className={s.thumb} />
      ) : (
        <span className={s.pdf}>PDF</span>
      )}
      <span className={s.fileName}>{title}</span>
      {saved && <StatusChip variant="success">已保存</StatusChip>}
    </button>
  );
}

export interface BookingFile {
  id: string;
  title: string;
  mime: string;
  blobKey: string;
  saved: boolean;
}

/** BookingCard（02、03） */
export function BookingCard({
  icon,
  warnIcon,
  title,
  subtitle,
  chip,
  bookingRef,
  onCopyRef,
  files,
  onOpenFile,
  withEye,
  onUpload,
  footer,
}: {
  icon: IconKey;
  warnIcon?: boolean;
  title: string;
  subtitle?: string;
  chip?: { variant: ChipVariant; label: string };
  bookingRef?: string;
  onCopyRef?: () => void;
  files: BookingFile[];
  onOpenFile: (id: string) => void;
  withEye?: boolean;
  onUpload?: () => void;
  footer?: ReactNode;
}) {
  return (
    <Card className={s.booking}>
      <div className={s.bHead}>
        <IconTile icon={icon} warn={warnIcon} />
        <div className={s.bText}>
          <p className={s.bTitle}>{title}</p>
          {subtitle && <p className={s.bSub}>{subtitle}</p>}
        </div>
        {chip && <StatusChip variant={chip.variant}>{chip.label}</StatusChip>}
      </div>
      {bookingRef && (
        <div className={s.refRow}>
          <span>预订编号</span>
          <span className={s.ref}>{bookingRef}</span>
          {onCopyRef && <CopyIcon onClick={onCopyRef} label="复制预订编号" />}
        </div>
      )}
      {files.length > 0
        ? files.map((f) => (
            <div key={f.id} className={s.fileLine}>
              <FileRow title={f.title} mime={f.mime} blobKey={f.blobKey} saved={f.saved} onClick={() => onOpenFile(f.id)} />
              {withEye && <IconButton icon="Eye" label="查看" onClick={() => onOpenFile(f.id)} />}
            </div>
          ))
        : onUpload && (
            <InfoBanner
              variant="warning"
              action={
                <Button variant="outline" size="sm" onClick={onUpload}>
                  上传文件
                </Button>
              }
            >
              未上传证明
            </InfoBanner>
          )}
      {footer}
    </Card>
  );
}

/** LocationCard（02） */
export function LocationCard({ name, lines, onCopy }: { name: string; lines: string[]; onCopy: () => void }) {
  return (
    <Card>
      <button type="button" className={s.loc} onClick={onCopy}>
        <Icon name="MapPin" color="var(--color-primary)" />
        <div className={s.locText}>
          <p className={s.locName}>{name}</p>
          {lines.map((l) => (
            <p key={l} className={s.locSub}>
              {l}
            </p>
          ))}
        </div>
        <span className={s.locCopy}>
          <Icon name="Copy" />
          <span>复制地点</span>
        </span>
      </button>
    </Card>
  );
}

/** TripCard · 大（有封面）/ 紧凑（没有封面） */
export function TripCard({
  coverKey,
  title,
  dateRange,
  meta,
  onOpen,
}: {
  coverKey?: string;
  title: string;
  dateRange: string;
  meta: string;
  onOpen: () => void;
}) {
  const url = useBlobUrl(coverKey);
  if (coverKey && url) {
    return (
      <Card className={s.trip}>
        <img className={s.tripCover} src={url} alt="" />
        <div className={s.tripBody}>
          <div className={s.tripTop}>
            <p className={s.tripName}>{title}</p>
            <StatusChip variant="success">已保存到本机</StatusChip>
          </div>
          <p className={s.tripDate}>{dateRange}</p>
          <div className={s.tripBottom}>
            <p className={s.tripMeta}>{meta}</p>
            <Button variant="outline" size="sm" chevron onClick={onOpen}>
              查看行程
            </Button>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <button type="button" className={s.compact} onClick={onOpen}>
        <IconTile icon="Building2" large />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className={s.compactName}>{title}</p>
          <p className={s.compactSub}>{dateRange}</p>
          <p className={s.compactMeta}>{meta}</p>
        </div>
        <span className={s.chev}>
          <Icon name="ChevronRight" size="sm" />
        </span>
      </button>
    </Card>
  );
}

export function SettingsGroup({ title, note, children, after }: { title?: string; note?: string; children: ReactNode; after?: ReactNode }) {
  return (
    <section>
      {title && <h2 className={s.groupTitle}>{title}</h2>}
      <Card className={s.group}>{children}</Card>
      {after}
      {note && <p className={s.groupNote}>{note}</p>}
    </section>
  );
}

export function SettingsRow({
  icon,
  label,
  value,
  arrow = true,
  danger,
  onClick,
}: {
  icon?: IconKey;
  label: string;
  value?: string;
  arrow?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      {icon && (
        <span className={s.srowIcon} style={danger ? { color: 'var(--color-warning-ink)' } : undefined}>
          <Icon name={icon} />
        </span>
      )}
      <span className={s.srowLabel} style={danger ? { color: 'var(--color-warning-ink)' } : undefined}>
        {label}
      </span>
      {value && <span className={s.srowValue}>{value}</span>}
      {arrow && <Icon name="ChevronRight" size="sm" color="var(--color-icon)" />}
    </>
  );
  return onClick ? (
    <button type="button" className={s.srow} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={s.srow}>{content}</div>
  );
}

export function ReadinessRow({ icon, label, state, text }: { icon: IconKey; label: string; state: 'ok' | 'warn' | 'grey'; text: string }) {
  return (
    <div className={s.srow}>
      <span className={s.srowIcon}>
        <Icon name={icon} />
      </span>
      <span className={s.srowLabel}>{label}</span>
      <span className={`${s.srowOk} ${state === 'warn' ? s.srowWarn : state === 'grey' ? s.srowGrey : ''}`}>
        {state === 'ok' && <CheckFilled size="sm" color="var(--color-success)" />}
        {state === 'warn' && <AlertFilled size="sm" color="var(--color-warning-ink)" />}
        {text}
      </span>
    </div>
  );
}

export function KeyValueCard({ rows }: { rows: [string, string][] }) {
  return (
    <Card>
      {rows.map(([k, v]) => (
        <div key={k} className={s.kv}>
          <span className={s.kvKey}>{k}</span>
          <span className={s.kvVal}>{v}</span>
        </div>
      ))}
    </Card>
  );
}
