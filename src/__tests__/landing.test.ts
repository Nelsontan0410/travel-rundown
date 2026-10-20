import { describe, expect, it } from 'vitest';
import md from '../../qa/fixtures/hokkaido-nomarks.md?raw';
import { parseMd } from '../importer/parseMd';
import { buildLanding } from '../domain/landing';
import { matchMedia, LANDING_MEDIA, LANDING_CREDITS } from '../domain/landingMedia';
const PUBLIC_JPG = Object.keys(import.meta.glob('/public/landing/*.jpg'));
import type { Day, Item } from '../domain/types';

function fromMd(text: string) {
  const r = parseMd(text);
  const days: Day[] = r.days.map((d, i) => ({ id: `d${i}`, tripId: 't', index: d.index, date: d.date, tz: d.tz, city: d.city, title: d.title, note: d.note }));
  const items: Item[] = r.days.flatMap((d, i) => d.items.map((it, j) => ({ ...it, id: `i${i}-${j}`, tripId: 't', dayId: `d${i}` }) as Item));
  return { trip: r.trip, days, items };
}

describe('旅程介绍页内容', () => {
  const { trip, days, items } = fromMd(md);
  const L = buildLanding(trip, days, items);

  it('标题、统计来自行程本身', () => {
    expect(L.place).toBe('东京・富士山・北海道');
    expect(L.country).toBe('日本');
    expect(L.stats.days).toBe(10);
    expect(L.days).toHaveLength(10);
    expect(L.stats.spots).toBeGreaterThan(20);
  });
  it('亮点 3–5 个、每天最多一个，文字都来自必逛清单', () => {
    expect(L.highlights.length).toBeGreaterThanOrEqual(3);
    expect(L.highlights.length).toBeLessThanOrEqual(5);
    expect(new Set(L.highlights.map((h) => h.dayIndex)).size).toBe(L.highlights.length);
    for (const h of L.highlights) {
      const src = items.find((i) => i.id === h.itemId)!;
      for (const sc of h.scenes) expect(src.mustDo).toContain(sc);
    }
  });
  it('美食只取写了必吃或店名的餐饮，不收「早餐」这类空项', () => {
    expect(L.food.length).toBeGreaterThan(2);
    expect(L.food.some((f) => /^(早餐|午餐|晚餐)$/.test(f.name))).toBe(false);
    // 照片只配真的对得上的菜：成吉思汗配烤羊肉照片；神户牛没有对应照片就不配，不拿羊肉冒充
    expect(matchMedia('北海道成吉思汗羊肉烧烤', 'food')?.id).toBe('grill');
    for (const f of L.food) {
      if (!f.media) continue;
      const src = items.find((i) => i.id === f.itemId)!;
      const text = [src.title, src.place?.name, ...(src.mustDo ?? [])].join(' ');
      expect(f.media.keywords.some((k) => text.includes(k))).toBe(true);
    }
    expect(L.food.find((f) => f.name === '神户牛')?.media).toBeUndefined();
  });
  it('首屏 4–6 张图，不重复', () => {
    expect(L.montage.length).toBeGreaterThanOrEqual(4);
    expect(L.montage.length).toBeLessThanOrEqual(6);
    expect(new Set(L.montage.map((m) => m.id)).size).toBe(L.montage.length);
  });
  it('出发前速览只用真实数据（交通方式、待确认项）', () => {
    const labels = L.brief.map((b) => b.label);
    expect(labels).toContain('怎么移动');
    expect(L.brief.find((b) => b.label === '还要确认')?.value).toMatch(/东京前往富士山站/);
  });
  it('图片匹配：富士、小樽、温泉', () => {
    expect(matchMedia('新仓山浅间公园与忠灵塔', 'scene')?.id).toBe('fuji-lake');
    expect(matchMedia('小樽运河夜景', 'scene')?.id).toBe('canal-night');
    expect(matchMedia('丰平峡温泉', 'scene')?.id).toBe('onsen');
    expect(new Set(LANDING_MEDIA.map((x) => x.id)).size).toBe(LANDING_MEDIA.length);
  });
  it('空行程也不报错', () => {
    const E = buildLanding({ title: '首尔，韩国', startDate: '2027-01-01', endDate: '2027-01-01' }, [], []);
    // 没有能对上的照片就不放照片（首屏只出文字），不拿日本的图凑韩国
    expect(E.montage).toEqual([]);
    expect(E.closing).toBeUndefined();
    expect(E.days).toEqual([]);
  });
  it('每张照片都有署名、许可证和原图链接，文件确实存在', () => {
    expect(LANDING_CREDITS).toHaveLength(LANDING_MEDIA.length);
    for (const m of LANDING_MEDIA) {
      expect(m.sample).toBe(false);
      expect(m.credit?.author).toBeTruthy();
      expect(m.credit?.license_url).toMatch(/^https?:\/\/creativecommons\.org\//);
      expect(m.credit?.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(PUBLIC_JPG).toContain(`/public${m.file}`);
    }
  });
  it('拍摄地点或季节对不上的照片，都带如实说明', () => {
    for (const id of ['onsen', 'lake-volcano', 'crab', 'sweets']) {
      expect(LANDING_MEDIA.find((m) => m.id === id)?.caption).toBeTruthy();
    }
  });
});
