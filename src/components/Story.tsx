// 旅程介绍页的可复用展示件：照片框、首屏蒙太奇、滚动淡入、视差大图。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import s from './Story.module.css';

export interface PhotoSrc {
  src: string;
  alt: string;
  sample?: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** 固定比例的照片框：预留空间不跳动，hover 轻微放大；示意图会标出来 */
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
      {photo.sample && <span className={s.sample}>示意图</span>}
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
      {photos[cur]?.sample && <span className={`${s.sample} ${s.sampleHero}`}>示意图</span>}
      <div className={s.dots} aria-hidden>
        {photos.map((p, i) => (
          <span key={p.src + i} className={i === cur ? s.dotOn : ''} />
        ))}
      </div>
    </div>
  );
}

/** 给容器里所有 [data-reveal] 加上进场淡入；减少动态效果时直接显示 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])')];
    els.forEach((el) => el.setAttribute('data-revealed', ''));
    if (!els.length) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add(s.shown));
      return;
    }
    els.forEach((el) => el.classList.add(s.hidden));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(s.shown);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
  return ref;
}

/** 宽幅大图的轻微视差（±32px），只用在少量大图上；不劫持滚动 */
export function Parallax({ photo, children }: { photo: PhotoSrc; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const b = box.current;
      const i = img.current;
      if (!b || !i) return;
      const r = b.getBoundingClientRect();
      const p = (r.top + r.height / 2 - window.innerHeight / 2) / (window.innerHeight + r.height);
      i.style.transform = `translate3d(0, ${(-p * 64).toFixed(1)}px, 0) scale(1.12)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={box} className={s.parallax}>
      <img ref={img} src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
      {photo.sample && <span className={s.sample}>示意图</span>}
      {children}
    </div>
  );
}
