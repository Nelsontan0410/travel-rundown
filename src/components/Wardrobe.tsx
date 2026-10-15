// 2026-10 第一批 ④：衣橱单品缩略图、每日穿搭卡、打包清单行（纯展示，照片用 useBlobUrl 读）。
import type { ReactNode } from 'react';
import s from './Wardrobe.module.css';
import { Icon } from './Icon';
import { useBlobUrl } from '../hooks/data';

export interface GarmentView {
  id: string;
  name: string;
  categoryLabel: string;
  photoBlobKey?: string;
}

export function GarmentThumb({ g, size = 'md' }: { g: GarmentView; size?: 'sm' | 'md' | 'lg' }) {
  const url = useBlobUrl(g.photoBlobKey);
  return (
    <span className={`${s.thumb} ${s[size]}`} aria-hidden>
      {url ? <img src={url} alt="" /> : <span className={s.ph}>{g.categoryLabel.slice(0, 1)}</span>}
    </span>
  );
}

/** 一天的穿搭：一排单品缩略图 + 名称 */
export function OutfitStrip({ garments, empty = '还没安排' }: { garments: GarmentView[]; empty?: string }) {
  if (!garments.length) return <p className={s.empty}>{empty}</p>;
  return (
    <ul className={s.strip}>
      {garments.map((g) => (
        <li key={g.id} className={s.piece}>
          <GarmentThumb g={g} />
          <span className={s.pieceName}>{g.name}</span>
          <span className={s.pieceCat}>{g.categoryLabel}</span>
        </li>
      ))}
    </ul>
  );
}

export function OutfitDayCard({
  label,
  sub,
  garments,
  note,
  onEdit,
  action,
}: {
  label: string;
  sub: string;
  garments: GarmentView[];
  note?: string;
  onEdit: () => void;
  action?: ReactNode;
}) {
  return (
    <section className={s.day}>
      <header className={s.dayHead}>
        <div className={s.dayText}>
          <p className={s.dayLabel}>{label}</p>
          <p className={s.daySub}>{sub}</p>
        </div>
        {action}
        <button type="button" className={s.edit} onClick={onEdit} aria-label={`编辑 ${label} 的穿搭`}>
          <Icon name="Pencil" size="sm" />
          <span>{garments.length ? '编辑' : '安排'}</span>
        </button>
      </header>
      <OutfitStrip garments={garments} />
      {note && <p className={s.note}>{note}</p>}
    </section>
  );
}

/** 衣橱网格里的一件 */
export function GarmentTile({ g, meta, onClick }: { g: GarmentView; meta?: string; onClick: () => void }) {
  return (
    <button type="button" className={s.tile} onClick={onClick}>
      <GarmentThumb g={g} size="lg" />
      <span className={s.tileName}>{g.name}</span>
      <span className={s.tileMeta}>
        {g.categoryLabel}
        {meta ? ` · ${meta}` : ''}
      </span>
    </button>
  );
}

/** 选择单品（编辑穿搭时） */
export function GarmentPick({ g, on, onToggle }: { g: GarmentView; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`${s.pick} ${on ? s.pickOn : ''}`} aria-pressed={on} onClick={onToggle}>
      <GarmentThumb g={g} size="sm" />
      <span className={s.pickName}>{g.name}</span>
      <span className={s.pickBox} aria-hidden>
        {on && <Icon name="CheckCircle2" size="sm" />}
      </span>
    </button>
  );
}

/** 打包清单一行 */
export function PackRow({
  label,
  sub,
  packed,
  onToggle,
  thumb,
  onDelete,
}: {
  label: string;
  sub?: string;
  packed: boolean;
  onToggle: () => void;
  thumb?: GarmentView;
  onDelete?: () => void;
}) {
  return (
    <li className={`${s.pack} ${packed ? s.packed : ''}`}>
      <button type="button" role="checkbox" aria-checked={packed} className={s.packMain} onClick={onToggle} aria-label={`${packed ? '已装' : '未装'}：${label}`}>
        <span className={s.box} aria-hidden>
          {packed && <Icon name="CheckCircle2" size="sm" />}
        </span>
        {thumb && <GarmentThumb g={thumb} size="sm" />}
        <span className={s.packText}>
          <span className={s.packLabel}>{label}</span>
          {sub && <span className={s.packSub}>{sub}</span>}
        </span>
      </button>
      {onDelete && (
        <button type="button" className={s.del} onClick={onDelete} aria-label={`删除：${label}`}>
          <Icon name="Trash2" size="xs" />
        </button>
      )}
    </li>
  );
}

export function PackProgress({ packed, total }: { packed: number; total: number }) {
  const pct = total ? Math.round((packed / total) * 100) : 0;
  return (
    <div className={s.progress}>
      <div className={s.progressText}>
        <span>已装 {packed} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={packed} aria-label="打包进度">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
