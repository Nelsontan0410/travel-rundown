// 美食 Gallery 的动画工具：时间轴、缓动曲线、FLIP 计算。只用浏览器原生 Web Animations API，不加依赖。
// 只动 transform / opacity / filter / clip-path，不在每一帧改 top、left、width、height。

export type Box = { x: number; y: number; w: number; h: number };

export const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 每一段各自调校的缓动曲线（不用一个 ease-in-out 套全部） */
export const EASE = {
  /** 照片从格子里浮起：起步快、很快放慢，像被轻轻拿起 */
  lift: 'cubic-bezier(0.2, 0.75, 0.25, 1)',
  /** 浮起后飞进上半屏：先加速、落地前长减速 */
  fly: 'cubic-bezier(0.62, 0, 0.18, 1)',
  /** 其余照片让位 / 归位 */
  reflow: 'cubic-bezier(0.3, 0.85, 0.25, 1)',
  /** 3D 文字入场：指数减速，有重量感、不回弹 */
  type: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** 文字退场：加速离开 */
  typeOut: 'cubic-bezier(0.55, 0, 0.85, 0.35)',
  /** 主图回到格子 */
  land: 'cubic-bezier(0.45, 0, 0.2, 1)',
} as const;

/** 开启动画时间轴（毫秒），对应需求表 */
export const T = {
  open: 1500,
  /** 0–1000：浮起离场（0–500）+ 飞进上半屏（500–1000），同一个元素一条关键帧 */
  heroIn: 1000,
  liftAt: 0.5,
  reflowDelay: 200,
  reflowDur: 700,
  nameDelay: 1000,
  nameDur: 250,
  /** 类别、店名、地址依次进入（1100–1400） */
  infoDelay: [1100, 1150, 1200],
  infoDur: 200,
  textOut: 260,
  /** 返回 / 切换时主图回到格子 */
  heroOut: 600,
  switchOut: 420,
  switchIn: 800,
} as const;

/** 主图（布局在最终位置 hero）要看起来正好在格子 tile 上：等比缩放 + 裁成正方形，不拉伸照片 */
export function heroPose(hero: Box, tile: Box, radius: number): { transform: string; clipPath: string } {
  const side = Math.min(hero.w, hero.h);
  const s = tile.w / side;
  const ix = (hero.w - side) / 2;
  const iy = (hero.h - side) / 2;
  const tx = tile.x - hero.x - s * ix;
  const ty = tile.y - hero.y - s * iy;
  return {
    transform: `translate(${tx}px, ${ty}px) scale(${s})`,
    clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px round ${radius / s}px)`,
  };
}

/** 主图在最终位置（不裁、不缩放） */
export const HERO_REST = { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 0px)' };

/** 浮起时的位置：以格子中心放大一点、往上提一点（Z 轴靠近镜头的感觉） */
export function liftBox(tile: Box, k = 1.16, rise = 14): Box {
  return { x: tile.x - (tile.w * (k - 1)) / 2, y: tile.y - (tile.h * (k - 1)) / 2 - rise, w: tile.w * k, h: tile.h * k };
}

/** 这个框是否在可见范围内（至少露出一半） */
export function visibleIn(b: Box, area: Box): boolean {
  const ix = Math.max(0, Math.min(b.x + b.w, area.x + area.w) - Math.max(b.x, area.x));
  const iy = Math.max(0, Math.min(b.y + b.h, area.y + area.h) - Math.max(b.y, area.y));
  return ix * iy >= (b.w * b.h) / 2;
}

const overlaps = (b: Box, area: Box) => b.x < area.x + area.w && b.x + b.w > area.x && b.y < area.y + area.h && b.y + b.h > area.y;

/** 3D 文字：从屏幕右侧外、带 Y 轴旋转和景深，转正、变清楚、减速停下 */
export const TYPE_IN: Keyframe[] = [
  { transform: 'perspective(900px) translate3d(115vw, 0, -260px) rotateY(-50deg)', filter: 'blur(12px)', opacity: 0 },
  { transform: 'perspective(900px) translate3d(6%, 0, -30px) rotateY(-8deg)', filter: 'blur(2px)', opacity: 1, offset: 0.62 },
  { transform: 'perspective(900px) translate3d(0, 0, 0) rotateY(0deg)', filter: 'blur(0px)', opacity: 1 },
];
export const INFO_IN: Keyframe[] = [
  { transform: 'perspective(800px) translate3d(110vw, 0, -160px) rotateY(-38deg)', filter: 'blur(8px)', opacity: 0 },
  { transform: 'perspective(800px) translate3d(0, 0, 0) rotateY(0deg)', filter: 'blur(0px)', opacity: 1 },
];
/** 退场：沿原来的方向反向离开 */
export const TYPE_OUT: Keyframe[] = [
  { transform: 'perspective(900px) translate3d(0, 0, 0) rotateY(0deg)', filter: 'blur(0px)', opacity: 1 },
  { transform: 'perspective(900px) translate3d(90vw, 0, -200px) rotateY(-42deg)', filter: 'blur(10px)', opacity: 0 },
];

/** 一组同时进行的动画；可以整体取消（换页、组件卸载） */
export class Timeline {
  private list: Animation[] = [];
  cancelled = false;
  add(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | undefined {
    if (!el || this.cancelled || typeof (el as HTMLElement).animate !== 'function') return undefined;
    const a = (el as HTMLElement).animate(frames, { fill: 'both', ...opts });
    this.list.push(a);
    return a;
  }
  /** 等全部结束（被取消也算结束，不抛错） */
  async done(): Promise<void> {
    await Promise.all(this.list.map((a) => a.finished.catch(() => undefined)));
  }
  /** 动画结束后把内联动画效果清掉，元素回到 CSS 本来的样子 */
  clear(): void {
    for (const a of this.list) a.cancel();
    this.list = [];
  }
  cancel(): void {
    this.cancelled = true;
    this.clear();
  }
}

/**
 * 其余照片重排（FLIP）：before 是改布局前各格子的位置，改完布局后调用。
 * 只给可见范围里的格子做动画，几百张也不卡；新出现的格子淡入。
 */
export function flipTiles(tl: Timeline, root: HTMLElement, before: Map<string, Box>, opts: { delay: number; duration: number; skip?: string; stagger?: number }): void {
  const view: Box = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  const tiles = root.querySelectorAll<HTMLElement>('[data-food-id]');
  let i = 0;
  tiles.forEach((el) => {
    const id = el.dataset.foodId!;
    if (id === opts.skip) return;
    const now = boxOf(el);
    const was = before.get(id);
    const inView = overlaps(now, view) || (!!was && overlaps(was, view));
    if (!inView) return;
    const delay = opts.delay + Math.min(i++ * (opts.stagger ?? 14), 160);
    if (!was) {
      tl.add(el, [{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'scale(1)' }], { delay, duration: opts.duration * 0.8, easing: EASE.reflow });
      return;
    }
    const dx = was.x - now.x;
    const dy = was.y - now.y;
    const sc = was.w / (now.w || 1);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sc - 1) < 0.01) return;
    tl.add(el, [{ transform: `translate(${dx}px, ${dy}px) scale(${sc})`, transformOrigin: '0 0' }, { transform: 'translate(0, 0) scale(1)', transformOrigin: '0 0' }], {
      delay,
      duration: opts.duration,
      easing: EASE.reflow,
    });
  });
}

export function measureTiles(root: HTMLElement | null): Map<string, Box> {
  const m = new Map<string, Box>();
  root?.querySelectorAll<HTMLElement>('[data-food-id]').forEach((el) => m.set(el.dataset.foodId!, boxOf(el)));
  return m;
}
