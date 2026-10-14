// 旅程介绍页的可复用展示件：照片框、首屏蒙太奇、视差大图。
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import s from './Story.module.css';

export interface PhotoSrc {
  src: string;
  alt: string;
  /** 拍摄地点或季节与行程不完全一致时的如实说明，显示在照片角落 */
  caption?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** 固定比例的照片框：预留空间不跳动，hover 轻微放大；有说明就标在角落 */
export function Photo({
  photo,
  ratio,
  eager,
  className,
  tilt,
  children,
}: {
  photo: PhotoSrc;
  ratio: string;
  eager?: boolean;
  className?: string;
  tilt?: number;
  children?: ReactNode;
}) {
  return (
    <figure className={`${s.photo} ${className ?? ''}`} style={{ aspectRatio: ratio, ...(tilt ? { '--tilt': `${tilt}deg` } : {}) } as CSSProperties}>
      <img src={photo.src} alt={photo.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchpriority: 'high' } : {})} />
      {photo.caption && <span className={s.caption}>{photo.caption}</span>}
      {children}
    </figure>
  );
}

/** 首屏：慢速缩放、平移 + 交叉淡入，旧图留在底下直到新图完全显现，不会白闪 */
export function Montage({ photos, interval = 6500 }: { photos: PhotoSrc[]; interval?: number }) {
  const [cur, setCur] = useState(0);
  const [still] = useState(prefersReducedMotion);
  useEffect(() => {
    if (still || photos.length < 2) return;
    const t = window.setInterval(() => setCur((c) => (c + 1) % photos.length), interval);
    return () => window.clearInterval(t);
  }, [still, photos.length, interval]);
  const prev = (cur - 1 + photos.length) % photos.length;
  return (
    <div className={`${s.montage} ${still ? s.still : ''}`} aria-roledescription="图片轮播" aria-label="目的地照片">
      {photos.map((p, i) => (
        <img
          key={p.src + i}
          src={p.src}
          alt={i === cur ? p.alt : ''}
          aria-hidden={i !== cur}
          className={`${s.frame} ${i === cur ? s.on : ''} ${i === prev && photos.length > 1 ? s.prev : ''} ${i % 2 ? s.panL : s.panR}`}
          loading={i < 2 ? 'eager' : 'lazy'}
          decoding="async"
          {...(i === 0 ? { fetchpriority: 'high' } : {})}
        />
      ))}
      {photos[cur]?.caption && <span className={`${s.caption} ${s.captionHero}`}>{photos[cur].caption}</span>}
      <div className={s.dots} aria-hidden>
        {photos.map((p, i) => (
          <span key={p.src + i} className={i === cur ? s.dotOn : ''} />
        ))}
      </div>
    </div>
  );
}

/** 宽幅大图：滚动时画面比外框移动得慢一点（纯 CSS 滚动驱动，浏览器不支持时就是静止的大图） */
export function Parallax({ photo, children }: { photo: PhotoSrc; children?: ReactNode }) {
  return (
    <div className={s.parallax}>
      <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
      {photo.caption && <span className={s.caption}>{photo.caption}</span>}
      {children}
    </div>
  );
}
