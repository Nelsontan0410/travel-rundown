import { describe, expect, it } from 'vitest';
import { parseMd } from '../importer/parseMd';
import { buildPrompt } from '../importer/promptTemplate';

const SAMPLE = `# 东京 7 天
- 日期: 2026-11-03 ~ 2026-11-09
- 出发地时区: Asia/Singapore
- 目的地: 日本

## Day 1 | 2026-11-03 | 东京 | Asia/Tokyo | 抵达与入住

### [flight] 08:30-16:10 新加坡 → 东京成田
- 地点: 新加坡樟宜机场 | Changi Airport
- 终点: 成田国际机场 | 成田国際空港
- 导航: https://www.google.com/maps/dir/?api=1&destination=Changi+Airport
- 订单: ABC123
- 航班号: XX123

### [lodging] 18:00 新宿 XX 酒店
- 地址: 东京都新宿区… | 東京都新宿区…
- 导航: https://www.google.com/maps/dir/?api=1&destination=x
- 订单: 1234567
- 预订状态: 已确认
- 退房时间: 11:00

## Day 2 | 2026-11-04 | 东京 | Asia/Tokyo

### [spot] 09:30-11:00 浅草寺
- 导航: http://bad.link
- 备注: 早点去，人少

### [bogus] 浅草寺
### [transit] 23:30-06:10+1 夜车
`;

describe('parseMd', () => {
  const r = parseMd(SAMPLE);
  it('reads trip header', () => {
    expect(r.trip).toEqual({
      title: '东京 7 天',
      startDate: '2026-11-03',
      endDate: '2026-11-09',
      homeTz: 'Asia/Singapore',
      destination: '日本',
    });
  });
  it('reads days with theme', () => {
    expect(r.days).toHaveLength(2);
    expect(r.days[0]).toMatchObject({ index: 1, date: '2026-11-03', city: '东京', tz: 'Asia/Tokyo', title: '抵达与入住' });
    expect(r.days[1].title).toBeUndefined();
  });
  it('maps fields', () => {
    const f = r.days[0].items[0];
    expect(f).toMatchObject({
      type: 'flight',
      start: '08:30',
      end: '16:10',
      place: { name: '新加坡樟宜机场', localName: 'Changi Airport' },
      toPlace: { name: '成田国际机场', localName: '成田国際空港' },
      bookingRef: 'ABC123',
      meta: { 航班号: 'XX123' },
    });
    const l = r.days[0].items[1];
    expect(l.place).toEqual({ name: '新宿 XX 酒店', address: '东京都新宿区…', localAddress: '東京都新宿区…' });
    expect(l.bookingStatus).toBe('confirmed');
    expect(l.start).toBe('18:00');
    expect(l.end).toBeUndefined();
  });
  it('warns on bad nav link and unknown type, keeps order', () => {
    const s = r.days[1].items[0];
    expect(s.navUrl).toBeUndefined();
    expect(s.place).toEqual({ name: '浅草寺' });
    expect(r.days[1].items[1].type).toBe('note');
    expect(r.warnings.some((w) => w.message.includes('https'))).toBe(true);
    expect(r.warnings.some((w) => w.message.includes('bogus'))).toBe(true);
  });
  it('parses overnight time', () => {
    expect(r.days[1].items[2]).toMatchObject({ start: '23:30', end: '06:10', endDayOffset: 1 });
  });
  it('makes unique keys', () => {
    const keys = r.days.flatMap((d) => d.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.itemCount).toBe(5);
  });
  it('falls back on missing tz', () => {
    const x = parseMd('# A\n- 日期: 2026-01-01 ~ 2026-01-02\n- 出发地时区: Asia/Singapore\n## Day 1 | 2026-01-01 | 上海\n### [spot] 外滩');
    expect(x.days[0].tz).toBe('Asia/Singapore');
    expect(x.warnings.length).toBe(1);
  });
  it('strips code fences', () => {
    const x = parseMd('```markdown\n# A\n- 出发地时区: Asia/Tokyo\n## Day 1 | 2026-01-01 | X | Asia/Tokyo\n### [spot] B\n```');
    expect(x.itemCount).toBe(1);
  });
});

describe('prompt', () => {
  it('fills nav rules', () => {
    const p = buildPrompt('amap', 'google-maps');
    expect(p).toContain('中国大陆境内的行程项用高德地图链接，其他地区用Google Maps链接。');
    expect(p).toContain('uri.amap.com');
    expect(p).not.toContain('{链接规则}');
    expect(buildPrompt('apple-maps', 'apple-maps')).toContain('所有行程项都用Apple Maps链接。');
  });
});
