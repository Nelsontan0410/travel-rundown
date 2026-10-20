import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Sheet } from './Layout';
import { Icon, type IconKey } from './Icon';
import s from './TripTools.module.css';

/** UI state only. The page owns the existing routes and preparation content. */
export default function TripTools({ onShare, onToday, onStory, onOutfits, preparation }: {
  onShare: () => void;
  onToday?: () => void;
  onStory: () => void;
  onOutfits: () => void;
  preparation: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const go = (action: () => void) => {
    // Release focus/background before navigating or opening the preparation sheet.
    flushSync(() => setOpen(false));
    action();
  };
  const entry = (icon: IconKey, name: string, description: string, action: () => void) => (
    <button type="button" className={s.entry} onClick={() => go(action)}>
      <span className={s.tile}><Icon name={icon} /></span>
      <span className={s.copy}><strong>{name}</strong><span>{description}</span></span>
      <Icon name="ChevronRight" size="sm" />
    </button>
  );
  return <div className={s.actions}>
    <button type="button" className={s.trigger} aria-label="分享 / 邀请" onClick={onShare}><Icon name="Upload" /></button>
    <button type="button" className={s.trigger} aria-label="打开旅程工具" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="MoreHorizontal" /></button>
    <Sheet open={open} onClose={() => setOpen(false)} title="旅程工具">
      <button type="button" className={s.close} aria-label="关闭旅程工具" onClick={() => setOpen(false)}><Icon name="X" /></button>
      <nav aria-label="旅程工具" className={s.entries}>
        {onToday && entry('CalendarDays', '今日行程', '查看今日重点与时间线', onToday)}
        {entry('Image', '旅程概览', '查看旅程介绍和景点照片', onStory)}
        {entry('StickyNote', '穿搭与行李', '行李清单及每日穿搭', onOutfits)}
        {entry('FileText', '出发准备', '查看准备提醒及旅程设置', () => setPreparing(true))}
      </nav>
    </Sheet>
    <Sheet open={preparing} onClose={() => setPreparing(false)} title="出发准备">
      <button type="button" className={s.close} aria-label="关闭出发准备" onClick={() => setPreparing(false)}><Icon name="X" /></button>
      <div className={s.preparation}>{preparation}</div>
    </Sheet>
  </div>;
}
