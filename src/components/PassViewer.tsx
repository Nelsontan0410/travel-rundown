// 2026-10 第一批 ②：全屏出示预订资料。二维码 / 票码图片排最前，然后是预订编号、其他文件、
// 动态票码和网页链接。打开时尽量保持屏幕常亮（Wake Lock，不支持就算了）。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './PassViewer.module.css';
import { Button } from './Basics';
import { CopyIcon } from './Cards';
import { Icon } from './Icon';
import { useBlobUrl } from '../hooks/data';
import { useOverlay } from '../hooks/layout';

export interface PassDoc {
  id: string;
  title: string;
  mime: string;
  blobKey: string;
  saved: boolean;
  locked: boolean;
  codeKind?: 'static' | 'dynamic';
  url?: string;
  app?: string;
  link: boolean;
}

type Page =
  | { kind: 'image'; doc: PassDoc }
  | { kind: 'ref' }
  | { kind: 'file'; doc: PassDoc }
  | { kind: 'link'; doc: PassDoc };

function pagesOf(docs: PassDoc[], bookingRef?: string): Page[] {
  const files = docs.filter((d) => !d.link);
  const shown = (d: PassDoc) => d.saved && !d.locked && d.mime.startsWith('image/');
  return [
    ...files.filter((d) => d.codeKind === 'static' && shown(d)).map((doc) => ({ kind: 'image' as const, doc })),
    ...(bookingRef ? [{ kind: 'ref' as const }] : []),
    ...files.filter((d) => d.codeKind !== 'static' && shown(d)).map((doc) => ({ kind: 'image' as const, doc })),
    ...files.filter((d) => !shown(d)).map((doc) => ({ kind: 'file' as const, doc })),
    ...docs.filter((d) => d.link).sort((a, b) => Number(b.codeKind === 'dynamic') - Number(a.codeKind === 'dynamic')).map((doc) => ({ kind: 'link' as const, doc })),
  ];
}

function PassImage({ doc }: { doc: PassDoc }) {
  const url = useBlobUrl(doc.blobKey);
  return (
    <figure className={s.imgWrap}>
      {url ? <img src={url} alt={doc.title} className={s.img} /> : <span className={s.loading} />}
      <figcaption className={s.cap}>
        {doc.codeKind === 'static' && <span className={s.badge}>票码</span>}
        {doc.title}
      </figcaption>
    </figure>
  );
}

export function PassViewer({
  open,
  onClose,
  title,
  subtitle,
  bookingRef,
  docs,
  onCopyRef,
  onOpenDoc,
  onOpenLink,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  bookingRef?: string;
  docs: PassDoc[];
  onCopyRef: () => void;
  /** 打开 PDF、加密文件等需要完整查看页的资料 */
  onOpenDoc: (id: string) => void;
  onOpenLink: (url: string) => void;
}) {
  const { panelRef, titleId } = useOverlay(open, onClose);
  const track = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);

  // 出示时保持屏幕常亮
  useEffect(() => {
    if (!open) return;
    let lock: { release: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (open) setCur(0);
  }, [open]);

  if (!open) return null;
  const pages = pagesOf(docs, bookingRef);
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return createPortal(
    <div ref={panelRef} className={s.wrap} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className={s.head}>
        <div className={s.headText}>
          <h2 id={titleId} className={s.title}>{title}</h2>
          {subtitle && <p className={s.sub}>{subtitle}</p>}
        </div>
        <button type="button" className={s.close} onClick={onClose} aria-label="关闭">
          <Icon name="Plus" className={s.x} />
        </button>
      </header>

      {pages.length === 0 ? (
        <div className={s.empty}>
          <p>这一项还没有预订编号或凭证。</p>
        </div>
      ) : (
        <div
          ref={track}
          className={s.track}
          onScroll={(e) => {
            const el = e.currentTarget;
            setCur(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
        >
          {pages.map((pg, i) => (
            <section key={i} className={s.page} aria-label={`第 ${i + 1} 页，共 ${pages.length} 页`}>
              {pg.kind === 'image' && <PassImage doc={pg.doc} />}
              {pg.kind === 'ref' && (
                <div className={s.refBox}>
                  <p className={s.refLabel}>预订编号</p>
                  <p className={s.ref}>{bookingRef}</p>
                  <CopyIcon onClick={onCopyRef} label="复制预订编号" />
                </div>
              )}
              {pg.kind === 'file' && (
                <div className={s.card}>
                  <Icon name={pg.doc.locked ? 'Lock' : 'FileText'} size="lg" />
                  <p className={s.cardTitle}>{pg.doc.title}</p>
                  <p className={s.cardText}>
                    {!pg.doc.saved ? '文件不在这台手机上，请重新添加。' : pg.doc.locked ? '已加密，打开时输入密码。' : 'PDF 文件，在查看页里打开。'}
                  </p>
                  {pg.doc.saved && (
                    <Button variant="outline" onClick={() => onOpenDoc(pg.doc.id)}>
                      打开
                    </Button>
                  )}
                </div>
              )}
              {pg.kind === 'link' && (
                <div className={s.card}>
                  <Icon name={pg.doc.codeKind === 'dynamic' ? 'Ticket' : 'Globe'} size="lg" />
                  <p className={s.cardTitle}>{pg.doc.title}</p>
                  <p className={s.cardText}>
                    {pg.doc.codeKind === 'dynamic'
                      ? `动态票码，请在${pg.doc.app ? `「${pg.doc.app}」` : '官方 App '}里现场打开，需要联网。`
                      : '网页订单，需要联网才能打开。'}
                  </p>
                  {pg.doc.url && (
                    <Button variant="outline" icon="ExternalLink" onClick={() => onOpenLink(pg.doc.url!)}>
                      打开链接
                    </Button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <footer className={s.foot}>
        {pages.length > 1 && (
          <div className={s.dots} role="tablist" aria-label="切换">
            {pages.map((_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === cur} aria-label={`第 ${i + 1} 页`} className={i === cur ? s.dotOn : s.dot} onClick={() => go(i)} />
            ))}
          </div>
        )}
        <p className={s.tip}>扫码时把屏幕调亮；左右滑动切换</p>
      </footer>
    </div>,
    document.body,
  );
}
