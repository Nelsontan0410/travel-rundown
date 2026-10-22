import { describe, expect, it } from 'vitest';
describe('美食导航按店的位置选地图', () => {
  it('南宁的店用高德（有 App 拉起 App）', async () => {
    const { foodNavUrl } = await import('../domain/food');
    const u = foodNavUrl({ restaurantName: '舒记老友粉', address: '南宁市兴宁区中山路' });
    expect(u).toContain('uri.amap.com/search');
    expect(u).toContain('callnative=1');
  });
  it('只有坐标、在中国大陆 → 高德 marker（WGS-84）', async () => {
    const { foodNavUrl } = await import('../domain/food');
    const u = foodNavUrl({ restaurantName: 'x', address: '', lat: 22.817, lng: 108.366 });
    expect(u).toContain('uri.amap.com/marker?position=108.366,22.817');
    expect(u).toContain('coordinate=wgs84');
  });
  it('香港、新加坡、首尔用 Google', async () => {
    const { foodNavUrl } = await import('../domain/food');
    expect(foodNavUrl({ restaurantName: 'a', address: '香港中环士丹利街' })).toContain('google.com/maps');
    expect(foodNavUrl({ restaurantName: 'b', address: '1 Kadayanallur St, Singapore' })).toContain('google.com/maps');
    expect(foodNavUrl({ restaurantName: 'c', address: '', lat: 37.5665, lng: 126.978 })).toContain('google.com/maps');
  });
  it('跟设置走：中国大陆也选 Google 时就用 Google', async () => {
    const { foodNavUrl } = await import('../domain/food');
    const { DEFAULT_SETTINGS } = await import('../domain/types');
    expect(foodNavUrl({ restaurantName: 'a', address: '广西南宁' }, { ...DEFAULT_SETTINGS, navInChina: 'google-maps' })).toContain('google.com/maps');
  });
});
