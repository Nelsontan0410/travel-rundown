// 旅程介绍页首屏：照片明信片沿椭圆环缓慢转动，中间是旅程标题。
// 运动全部交给 CSS（transform 动画、每张卡用负延迟错开相位），React 不逐帧更新；
// 暂停用 animation-play-state，恢复时从原位置继续。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import s from './PhotoRing.module.css';
import { Icon } from './Icon';

export interface RingPhoto {
  id: string;
  thumb: string;
  alt: string;
  caption?: string;
}

/** 卡片自身的轻微倾斜（度），按序号循环，看起来像随手摆的明信片 */
const LEAN = [-4, 3, -2, 5, -5, 2, 4, -3];

export function PhotoRing({
  photos,
  count,
  countMobile,
  seconds = 55,
  hub,
  children,
}: {
  photos: RingPhoto[];
  /** 电脑 / 平板上环上放几张 */
  count: number;
  /** 手机上环上放几张（取前几张） */
  countMobile: number;
  /** 转一圈的秒数 */
  seconds?: number;
  /** 手机上环中央的小标记 */
  hub?: ReactNode;
  /** 中央文案：电脑 / 平板在环中央，手机在环下方 */
  children: ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());

  // 离开视口、切到后台时暂停；卸载时释放监听
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const shown = photos.slice(0, count);
  const paused = userPaused || offscreen || hidden;
  const vars = { '--n': shown.length, '--nm': Math.min(countMobile, shown.length), '--T': `${seconds}s` } as CSSProperties;

  return (
    <div ref={stage} className={`${s.stage} ${shown.length <= 5 ? s.few : shown.length > 12 ? s.many : ''}`} style={vars} data-paused={paused || undefined}>
      <div className={s.track}>
        <ul className={s.ring} aria-label={`旅程照片，共 ${photos.length} 张`} tabIndex={0}>
          {shown.map((p, i) => (
            <li
              key={p.id}
              className={`${s.slot} ${i >= countMobile ? s.wideOnly : ''}`}
              style={{ '--i': i, '--lean': `${LEAN[i % LEAN.length]}deg` } as CSSProperties}
            >
              <div className={s.x}>
                <figure className={s.card}>
                  {broken.has(p.id) ? (
                    <span className={s.missing} role="img" aria-label={`${p.alt}（图片加载失败）`}>
                      <Icon name="Mountain" size="sm" />
                    </span>
                  ) : (
                    <img
                      src={p.thumb}
                      alt={p.alt}
                      loading={i < 6 ? 'eager' : 'lazy'}
                      decoding="async"
                      width={400}
                      height={500}
                      onError={() => setBroken((b) => new Set(b).add(p.id))}
                    />
                  )}
                  {p.caption && <figcaption className={s.cap}>{p.caption}</figcaption>}
                </figure>
              </div>
            </li>
          ))}
        </ul>
        {hub && <div className={s.hub}>{hub}</div>}
      </div>
      <div className={s.center}>{children}</div>
      <button
        type="button"
        className={s.toggle}
        onClick={() => setUserPaused((v) => !v)}
        aria-pressed={userPaused}
        aria-label={userPaused ? '继续转动照片' : '暂停转动照片'}
      >
        <span className={`${s.glyph} ${userPaused ? s.glyphPlay : ''}`} aria-hidden />
        <span>{userPaused ? '继续' : '暂停'}</span>
      </button>
    </div>
  );
}

/** 只有一张照片：一张静止的明信片，不复制成一圈 */
export function SoloPostcard({ photo }: { photo: RingPhoto }) {
  const [broken, setBroken] = useState(false);
  return (
    <figure className={s.solo}>
      {broken ? (
        <span className={s.missing} role="img" aria-label={`${photo.alt}（图片加载失败）`}>
          <Icon name="Mountain" />
        </span>
      ) : (
        <img src={photo.thumb} alt={photo.alt} decoding="async" width={400} height={500} onError={() => setBroken(true)} />
      )}
      {photo.caption && <figcaption className={s.cap}>{photo.caption}</figcaption>}
    </figure>
  );
}
