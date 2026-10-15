// 2026-10 第一批 ③：当地语言地址卡
import { describe, expect, it } from 'vitest';
import { addressCard, addressCopyText, addressTarget, phraseFor } from '../domain/address';

const hotel = { name: '札幌站前酒店', localName: '札幌駅前ホテル', address: '北海道札幌市北区', localAddress: '北海道札幌市北区北7条西' };

describe('地址卡', () => {
  it('当地语言大字，显示语言小字', () => {
    const c = addressCard({ type: 'lodging', place: hotel }, 'Asia/Tokyo')!;
    expect(c).toMatchObject({ role: '住宿', bigName: '札幌駅前ホテル', bigAddress: '北海道札幌市北区北7条西', smallName: '札幌站前酒店', smallAddress: '北海道札幌市北区', hasLocal: true });
    expect(c.phrase.lang).toBe('ja');
    expect(addressCopyText(c)).toBe('札幌駅前ホテル\n北海道札幌市北区北7条西');
  });
  it('交通看终点，航班看出发机场，没有地点就没有地址卡', () => {
    expect(addressTarget({ type: 'transit', place: { name: 'A' }, toPlace: { name: 'B' } })?.place.name).toBe('B');
    expect(addressTarget({ type: 'flight', place: { name: '机场' }, toPlace: { name: '到达' } })).toMatchObject({ role: '出发机场', place: { name: '机场' } });
    expect(addressCard({ type: 'meal' }, 'Asia/Tokyo')).toBeUndefined();
  });
  it('没有当地语言资料时用显示名，并标出来', () => {
    const c = addressCard({ type: 'spot', place: { name: 'Gyeongbokgung' } }, 'Asia/Seoul')!;
    expect(c).toMatchObject({ bigName: 'Gyeongbokgung', hasLocal: false, smallName: undefined });
    expect(c.phrase.lang).toBe('ko');
  });
  it('不认识的地区说英文', () => {
    expect(phraseFor('Europe/Paris').lang).toBe('en');
    expect(phraseFor('Asia/Taipei').lang).toBe('zh');
  });
});
