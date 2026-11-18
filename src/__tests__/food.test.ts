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

describe('高德：用店名搜索、手机直接开 App', () => {
  it('高德搜索词 = 城市 + 店名（不再用地址搜出一排门牌）', async () => {
    const { foodNavUrl } = await import('../domain/food');
    const u = foodNavUrl({ restaurantName: '甘家界柠檬鸭(三街两巷水街店)', address: '广西壮族自治区南宁市西乡塘区永宁街华兴里1-4号' })!;
    expect(new URL(u).searchParams.get('keyword')).toBe('南宁 甘家界柠檬鸭(三街两巷水街店)');
    expect(foodNavUrl({ restaurantName: '舒记老友粉', address: '南宁市兴宁区中山路' })).toContain(encodeURIComponent('南宁 舒记老友粉'));
  });
  it('店名里已经有城市就不重复；没店名退回地址；没地址没坐标不导航', async () => {
    const { foodNavUrl, cityOfAddress } = await import('../domain/food');
    expect(new URL(foodNavUrl({ restaurantName: '南宁老友粉', address: '南宁市兴宁区中山路' })!).searchParams.get('keyword')).toBe('南宁老友粉');
    expect(new URL(foodNavUrl({ restaurantName: '', address: '南宁市兴宁区中山路' })!).searchParams.get('keyword')).toBe('南宁市兴宁区中山路');
    expect(foodNavUrl({ restaurantName: '舒记老友粉', address: '' })).toBeUndefined();
    expect(cityOfAddress('广西壮族自治区南宁市西乡塘区永宁街华兴里1-4号')).toBe('南宁');
    expect(cityOfAddress('北京市朝阳区建国路')).toBe('北京');
    expect(cityOfAddress('广东省广州市天河区')).toBe('广州');
    expect(cityOfAddress('中山路 12 号')).toBeUndefined();
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

describe('高德：行程里的地点也用「城市 + 准确店名」搜（2026-11-19）', () => {
  const place = { name: '甘家界柠檬鸭（三街两巷水街店）', localName: '甘家界柠檬鸭', address: '南宁 · 中国' };
  const kw = (u: string | undefined) => new URL(u!).searchParams.get('keyword');
  it('取带分店名的那个，全角括号换半角，城市从「南宁 · 中国」读出', async () => {
    const { navLink, placeLink, amapPlaceQuery, cityOfAddress } = await import('../links/maps');
    expect(amapPlaceQuery(place)).toBe('南宁 甘家界柠檬鸭(三街两巷水街店)');
    expect(kw(navLink({ type: 'meal', title: '晚餐：甘家界柠檬鸭', place }, 'Asia/Shanghai'))).toBe('南宁 甘家界柠檬鸭(三街两巷水街店)');
    expect(kw(placeLink(place, 'Asia/Shanghai'))).toBe('南宁 甘家界柠檬鸭(三街两巷水街店)');
    expect(cityOfAddress('南宁，中国')).toBe('南宁');
    expect(cityOfAddress('广西壮族自治区南宁市西乡塘区永宁街华兴里1-4号')).toBe('南宁');
    expect(cityOfAddress('中山路 12 号')).toBeUndefined();
  });
  it('交通终点同样；英文店名退回原来的搜索词；Google 不受影响', async () => {
    const { navLink, amapPlaceQuery } = await import('../links/maps');
    const u = navLink({ type: 'transit', title: '去吃饭', place: { name: '酒店' }, toPlace: place }, 'Asia/Shanghai');
    expect(kw(u)).toBe('南宁 甘家界柠檬鸭(三街两巷水街店)');
    expect(amapPlaceQuery({ name: 'Ichiran Shibuya', address: 'Tokyo' })).toBe('Ichiran Shibuya Tokyo');
    const { DEFAULT_SETTINGS } = await import('../domain/types');
    const g = navLink({ type: 'meal', title: 'x', place }, 'Asia/Shanghai', { ...DEFAULT_SETTINGS, navInChina: 'google-maps' })!;
    expect(g).toContain('google.com/maps');
    expect(decodeURIComponent(g)).toContain('query=甘家界柠檬鸭');
  });
});
