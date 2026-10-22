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

describe('高德：只用地址搜索、手机直接开 App', () => {
  it('高德搜索词只有地址，不带店名', async () => {
    const { foodNavUrl } = await import('../domain/food');
    const u = foodNavUrl({ restaurantName: '舒记老友粉', address: '南宁市兴宁区中山路' })!;
    expect(new URL(u).searchParams.get('keyword')).toBe('南宁市兴宁区中山路');
  });
  it('Android → intent 拉起高德 App，没装就回网页版', async () => {
    const { amapAppUrl } = await import('../links/maps');
    const web = 'https://uri.amap.com/search?keyword=%E5%8D%97%E5%AE%81&callnative=1';
    const a = amapAppUrl(web, 'android')!;
    expect(a.startsWith('intent://poi?')).toBe(true);
    expect(a).toContain('keywords=%E5%8D%97%E5%AE%81');
    expect(a).toContain('scheme=androidamap;package=com.autonavi.minimap');
    expect(a).toContain(`S.browser_fallback_url=${encodeURIComponent(web)}`);
  });
  it('iOS → iosamap://；坐标标点带 dev=1（WGS-84）', async () => {
    const { amapAppUrl } = await import('../links/maps');
    expect(amapAppUrl('https://uri.amap.com/search?keyword=x&callnative=1', 'ios')).toBe('iosamap://poi?sourceApplication=tongxing8&name=x');
    expect(amapAppUrl('https://uri.amap.com/marker?position=108.366,22.817&name=a&coordinate=wgs84&callnative=1', 'ios')).toContain('viewMap?sourceApplication=tongxing8&poiname=a&lat=22.817&lon=108.366&dev=1');
  });
  it('电脑或非高德链接不改', async () => {
    const { amapAppUrl, mobileOs } = await import('../links/maps');
    expect(amapAppUrl('https://uri.amap.com/search?keyword=x', 'other')).toBeUndefined();
    expect(amapAppUrl('https://www.google.com/maps/search/?api=1&query=x', 'android')).toBeUndefined();
    expect(mobileOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
    expect(mobileOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
  });
});
