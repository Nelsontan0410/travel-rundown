// 旅程介绍页首屏的照片环：和介绍页其他段落用同一份照片源（buildLanding 认出来的照片 + 用户自己的封面），
// 这里只负责统一读取、去重、排序，并决定环上放几张。不新增任何存储字段，也不写死某个旅程的照片。
import type { LandingContent } from './landing';
import type { LandingMedia } from './landingMedia';
import type { TripTheme } from './types';

export interface GalleryPhoto {
  /** 稳定 ID：图库照片用图库 id，用户封面固定为 cover */
  id: string;
  /** 原图（相册视图用） */
  src: string;
  /** 环上卡片用的小图；没有小图时等于原图 */
  thumb: string;
  alt: string;
  caption?: string;
}

/** 环上最多放几张：电脑 / 平板 16 张，手机 8 张；其余在「旅程相册」里都能看到 */
export const RING_MAX = 16;
export const RING_MAX_MOBILE = 8;

export type RingMode = 'none' | 'single' | 'ring';

export interface GalleryPlan {
  photos: GalleryPhoto[];
  mode: RingMode;
  /** 环上实际显示的张数（电脑 / 平板） */
  ring: number;
  /** 手机上环上显示的张数 */
  ringMobile: number;
  /** 有照片没在手机环上出现时，需要相册视图兜底 */
  needsAlbum: boolean;
}

/** 首屏背景图：整张铺在照片环后面，中央淡出成纸面，标题始终在浅底上 */
export interface LandingBackdrop {
  id: string;
  src: string;
  /** 手机用的小图 */
  srcSmall: string;
  /** 照片来源说明（显示在照片来源页） */
  note: string;
}

// 用户提供的日本冬季拼贴（AI 生成插画，含企鹅、富士山、浅草、涩谷、小樽等）。
// 只给「日本 + 冬季 + 去北海道或富士山」的旅程用，别的旅程不套这张图。
const BACKDROPS: (LandingBackdrop & { places: string[]; months: number[] })[] = [
  {
    id: 'japan-winter',
    src: '/landing/backdrop/japan-winter.webp',
    srcSmall: '/landing/backdrop/japan-winter-800.webp',
    note: '旅程介绍页首屏的「日本冬季」背景拼贴由你提供，是 AI 生成的插画，不是实拍照片。',
    places: ['北海道', '札幌', '小樽', '富士'],
    months: [11, 12, 1, 2, 3],
  },
];
export const BACKDROP_NOTES = BACKDROPS.map((b) => ({ id: b.id, src: b.srcSmall, note: b.note }));

/** 按旅程的地点和出发月份挑背景图；对不上就没有背景，只用纸面 */
export function landingBackdrop(L: LandingContent, startDate: string): LandingBackdrop | undefined {
  const month = Number(startDate.slice(5, 7));
  const text = [L.place, L.country ?? '', ...L.days.map((d) => `${d.city} ${d.title ?? ''}`)].join(' ');
  const hit = BACKDROPS.find((b) => b.months.includes(month) && (L.country ?? '').includes('日本') && b.places.some((p) => text.includes(p)));
  if (!hit) return undefined;
  const { id, src, srcSmall, note } = hit;
  return { id, src, srcSmall, note };
}

const fromMedia =(m: LandingMedia): GalleryPhoto => ({
  id: m.id,
  src: m.file,
  thumb: m.file.replace(/^\/landing\/([^/]+)\.jpg$/, '/landing/thumb/$1.webp'),
  alt: m.alt,
  caption: m.caption,
});

/**
 * 介绍页上出现过的所有照片，按「首屏 → 亮点 → 每天 → 美食 → 瞬间 → 收尾」的顺序去重。
 * 选了季节主题时，同季节真实拍摄的照片排前面（稳定排序，其余顺序不变）。
 */
export function landingGallery(
  L: LandingContent,
  opts: { cover?: string; theme?: TripTheme } = {},
): GalleryPlan {
  const media: (LandingMedia | undefined)[] = [
    ...L.montage,
    ...L.highlights.map((h) => h.media),
    ...L.days.map((d) => d.media),
    L.interlude?.media,
    ...L.food.map((f) => f.media),
    ...L.moments.map((m) => m.media),
    L.closing,
  ];
  const seen = new Set<string>();
  let lib: LandingMedia[] = [];
  for (const m of media) {
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    lib.push(m);
  }
  const season = opts.theme && opts.theme !== 'classic' ? opts.theme : undefined;
  if (season) lib = [...lib.filter((m) => m.season === season), ...lib.filter((m) => m.season !== season)];

  const photos: GalleryPhoto[] = [
    ...(opts.cover ? [{ id: 'cover', src: opts.cover, thumb: opts.cover, alt: `${L.place} 封面` }] : []),
    ...lib.map(fromMedia),
  ];
  const n = photos.length;
  const mode: RingMode = n === 0 ? 'none' : n === 1 ? 'single' : 'ring';
  const ring = mode === 'ring' ? Math.min(n, RING_MAX) : 0;
  const ringMobile = mode === 'ring' ? Math.min(n, RING_MAX_MOBILE) : 0;
  return { photos, mode, ring, ringMobile, needsAlbum: n > RING_MAX_MOBILE };
}
