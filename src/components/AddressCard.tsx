// 2026-10 第一批 ③：全屏地址卡 —— 把手机递给司机或店员看。当地语言名称和地址用大字，
// 下面是一句当地语言的「请带我到这里」；名称、地址都能单独复制；底部可以直接看路线。
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import s from './AddressCard.module.css';
import { Button } from './Basics';
import { CopyIcon } from './Cards';
import { Icon } from './Icon';
import { useOverlay } from '../hooks/layout';

export interface AddressCardView {
  role: string;
  bigName: string;
  bigAddress?: string;
  smallName?: string;
  smallAddress?: string;
  hasLocal: boolean;
  phrase: { local: string; zh: string; lang: string };
}

export function AddressCardSheet({
  open,
  onClose,
  card,
  onCopy,
  onRoute,
}: {
  open: boolean;
  onClose: () => void;
  card: AddressCardView;
  onCopy: (text: string, what: string) => void;
  onRoute?: () => void;
}) {
  const { panelRef, titleId } = useOverlay(open, onClose);
  // 给别人看的时候不要熄屏
  useEffect(() => {
    if (!open) return;
    let lock: { release: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [open]);
  if (!open) return null;
  const all = [card.bigName, card.bigAddress].filter(Boolean).join('\n');
  return createPortal(
    <div ref={panelRef} className={s.wrap} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className={s.head}>
        <span className={s.role}>{card.role}</span>
        <button type="button" className={s.close} onClick={onClose} aria-label="关闭">
          <Icon name="Plus" className={s.x} />
        </button>
      </header>
      <div className={s.body}>
        <p className={s.phrase} lang={card.phrase.lang}>
          {card.phrase.local}
        </p>
        <div className={s.block}>
          <h2 id={titleId} className={s.name} lang={card.hasLocal ? card.phrase.lang : undefined}>
            {card.bigName}
          </h2>
          <CopyIcon onClick={() => onCopy(card.bigName, '名称')} label="复制名称" />
        </div>
        {card.bigAddress && (
          <div className={s.block}>
            <p className={s.addr} lang={card.hasLocal ? card.phrase.lang : undefined}>
              {card.bigAddress}
            </p>
            <CopyIcon onClick={() => onCopy(card.bigAddress!, '地址')} label="复制地址" />
          </div>
        )}
        {(card.smallName || card.smallAddress) && (
          <div className={s.mine}>
            {card.smallName && <p>{card.smallName}</p>}
            {card.smallAddress && <p>{card.smallAddress}</p>}
          </div>
        )}
        {!card.hasLocal && <p className={s.warn}>行程里没有这个地点的当地语言名称或地址，建议重新导入时补上。</p>}
        <p className={s.zh}>（{card.phrase.zh}）</p>
      </div>
      <footer className={s.foot}>
        <Button variant="outline" icon="Copy" onClick={() => onCopy(all, '名称和地址')}>
          复制全部
        </Button>
        {onRoute && (
          <Button icon="Navigation" onClick={onRoute}>
            看路线
          </Button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
