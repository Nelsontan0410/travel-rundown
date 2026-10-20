import { describe, expect, it } from 'vitest';
import md from '../../qa/fixtures/hokkaido-nomarks.md?raw';
import { parseMd } from '../importer/parseMd';
import { buildLanding, type LandingContent } from '../domain/landing';
import { landingBackdrop, landingGallery, RING_MAX, RING_MAX_MOBILE } from '../domain/landingGallery';
import { LANDING_MEDIA } from '../domain/landingMedia';
import type { Day, Item } from '../domain/types';

const THUMBS = Object.keys(import.meta.glob('/public/landing/thumb/*.webp'));

function fromMd(text: string) {
  const r = parseMd(text);
  const days: Day[] = r.days.map((d, i) => ({ id: `d${i}`, tripId: 't', index: d.index, date: d.date, tz: d.tz, city: d.city, title: d.title, note: d.note }));
  const items: Item[] = r.days.flatMap((d, i) => d.items.map((it, j) => ({ ...it, id: `i${i}-${j}`, tripId: 't', dayId: `d${i}` }) as Item));
  return { trip: r.trip, days, items };
}

/** 只放 k 张照片的介绍页内容（其余段落为空），用来测数量边界 */
const withPhotos = (k: number): LandingContent => ({
  title: 't', place: '测试', theme: '', intro: [],
  stats: { days: 1, cities: 1, spots: 0, meals: 0 },
  montage: LANDING_MEDIA.slice(0, k), highlights: [], days: [], food: [], moments: [], brief: [],
});

describe('首屏照片环的照片源', () => {
  const { trip, days, items } = fromMd(md);
  const L = buildLanding(trip, days, items);
  const g = landingGallery(L);

  it('和介绍页其他段落同一份照片：每张都在页面上出现过，且不重复', () => {
    const used = new Set([
      ...L.montage, ...L.highlights.map((h) => h.media), ...L.days.map((d) => d.media),
      L.interlude?.media, ...L.food.map((f) => f.media), ...L.moments.map((m) => m.media), L.closing,
    ].filter(Boolean).map((m) => m!.id));
    expect(g.photos.length).toBe(used.size);
    expect(new Set(g.photos.map((p) => p.id)).size).toBe(g.photos.length);
    for (const p of g.photos) expect(used.has(p.id)).toBe(true);
  });

  it('顺序稳定：首屏蒙太奇的照片排最前', () => {
    expect(g.photos.slice(0, L.montage.length).map((p) => p.id)).toEqual(L.montage.map((m) => m.id));
    expect(landingGallery(L).photos.map((p) => p.id)).toEqual(g.photos.map((p) => p.id));
  });

  it('每张图库照片都有对应的小图文件', () => {
    for (const p of g.photos) expect(THUMBS).toContain(`/public${p.thumb}`);
    for (const m of LANDING_MEDIA) expect(THUMBS).toContain(`/public/landing/thumb/${m.id}.webp`);
  });

  it('用户封面排第一，用原图', () => {
    const c = landingGallery(L, { cover: 'blob:x' });
    expect(c.photos[0]).toMatchObject({ id: 'cover', src: 'blob:x', thumb: 'blob:x' });
    expect(c.photos.length).toBe(g.photos.length + 1);
  });

  it('季节主题只调整顺序，不增减照片', () => {
    const w = landingGallery(L, { theme: 'winter' });
    expect([...w.photos.map((p) => p.id)].sort()).toEqual([...g.photos.map((p) => p.id)].sort());
    const firstOther = w.photos.findIndex((p) => LANDING_MEDIA.find((m) => m.id === p.id)?.season !== 'winter');
    expect(w.photos.slice(firstOther).some((p) => LANDING_MEDIA.find((m) => m.id === p.id)?.season === 'winter')).toBe(false);
  });

  it.each([
    [0, 'none', 0, 0, false],
    [1, 'single', 0, 0, false],
    [3, 'ring', 3, 3, false],
    [6, 'ring', 6, 6, false],
    [12, 'ring', 12, RING_MAX_MOBILE, true],
    [18, 'ring', RING_MAX, RING_MAX_MOBILE, true],
  ] as const)('%i 张照片 → %s，环上 %i 张（手机 %i 张），相册兜底 %s', (k, mode, ring, mobile, album) => {
    const p = landingGallery(withPhotos(k));
    expect(p.photos).toHaveLength(k);
    expect(p.mode).toBe(mode);
    expect(p.ring).toBe(ring);
    expect(p.ringMobile).toBe(mobile);
    expect(p.needsAlbum).toBe(album);
  });

  it('16 张以上加封面也不超过环的上限，多出来的都在 photos 里', () => {
    const p = landingGallery(withPhotos(18), { cover: 'blob:c' });
    expect(p.photos).toHaveLength(19);
    expect(p.ring).toBe(RING_MAX);
  });

  it('背景图：北海道冬季旅程有，其他旅程没有', () => {
    expect(trip.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(landingBackdrop(L, trip.startDate)?.id).toBe('japan-winter');
    expect(landingBackdrop(L, '2027-07-10')).toBeUndefined();
    expect(landingBackdrop({ ...L, place: '首尔', country: '韩国', days: [] }, trip.startDate)).toBeUndefined();
    expect(landingBackdrop(withPhotos(3), trip.startDate)).toBeUndefined();
  });
});
