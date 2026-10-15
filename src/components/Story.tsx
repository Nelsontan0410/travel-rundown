// 旅程介绍页的可复用展示件：照片框、视差大图（首屏照片环在 PhotoRing.tsx）。
import type { CSSProperties, ReactNode } from 'react';
import s from './Story.module.css';

export interface PhotoSrc {
  src: string;
  alt: string;
  /** 拍摄地点或季节与行程不完全一致时的如实说明，显示在照片角落 */
  caption?: string;
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
