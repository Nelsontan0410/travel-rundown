import { describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { fmtDate, fmtMoney, parseDateAny, parseMoney, findDates } from '../domain/format';
import { ledgerSummary, mustDoProgress, itemSubtitle } from '../domain/rules';
import { migrateItemV2 } from '../domain/migrate';
import { navLink, placeQuery } from '../links/maps';
import { encryptBlob, decryptBlob, WrongPasswordError } from '../lib/crypto';
import { DEFAULT_SETTINGS, type Item } from '../domain/types';

const r = parseMd(md);
const all = r.days.flatMap((d) => d.items);

describe('v2 日期与金额', () => {
  it('parses DD-MM-YYYY, ISO and 1-JAN-2027, never US order', () => {
    expect(parseDateAny('13-01-2027')).toBe('2027-01-13');
    expect(parseDateAny('1/2/2027')).toBe('2027-02-01');
    expect(parseDateAny('2027-01-13')).toBe('2027-01-13');
    expect(parseDateAny('1-JAN-2027')).toBe('2027-01-01');
    expect(parseDateAny('5 March 2027')).toBe('2027-03-05');
    expect(parseDateAny('01-13-2027')).toBe('');
    expect(parseDateAny('31-02-2027')).toBe('');
    expect(findDates('13-01-2027 ~ 16-01-2027')).toEqual(['2027-01-13', '2027-01-16']);
  });
  it('formats 1-JAN-2027', () => expect(fmtDate('2027-01-01')).toBe('1-JAN-2027'));
  it('money in sen, MYR', () => {
    expect(parseMoney('RM 8,000')).toBe(800000);
    expect(parseMoney('12.5')).toBe(1250);
    expect(parseMoney('abc')).toBeNull();
    expect(fmtMoney(123450)).toBe('RM 1,234.50');
  });
});

describe('v2 解析', () => {
  it('no warnings, title is destination, budget only', () => {
    expect(r.warnings).toEqual([]);
    expect(r.trip).toMatchObject({ title: '北海道，日本', destination: '日本', startDate: '2027-01-13', endDate: '2027-01-16', budget: 800000 });
    expect(r.days.map((d) => d.date)).toEqual(['2027-01-13', '2027-01-14', '2027-01-15', '2027-01-16']);
  });
  it('flight fields', () => {
    expect(all[0]).toMatchObject({ type: 'flight', flight: { number: 'XX 123', airline: '示例航空', terminal: 'KLIA T1' }, fixed: true });
  });
  it('lodging dates', () => {
    const l = all.find((i) => i.type === 'lodging')!;
    expect(l.lodging).toEqual({ checkIn: '2027-01-13', checkOut: '2027-01-15', roomType: '双人房' });
  });
  it('transit mode', () => expect(all[1].transit).toEqual({ mode: 'JR', line: '快速 Airport' }));
  it('meal kind from field, title or time', () => {
    const meals = all.filter((i) => i.type === 'meal');
    expect(meals.map((m) => m.meal)).toEqual(['dinner', 'breakfast', 'lunch']);
    expect(meals[0].mustDo).toEqual(['鸡腿汤咖喱', '炸蔬菜']);
    expect(meals[2].mustDo).toEqual(['海胆丼', '帝王蟹']);
  });
  it('must-do as nested list, and alt after it still parsed', () => {
    const s = all.find((i) => i.title === '小樽运河')!;
    expect(s.mustDo).toEqual(['运河散步道拍照', '北一硝子三号馆', '音乐盒堂']);
    expect(s.alt).toContain('艺术村');
    expect(all.find((i) => i.title === '白色恋人公园')!.mustDo).toEqual(['巧克力工厂参观', '手作饼干']);
  });
  it('accepts Chinese type names', () => {
    const x = parseMd('# 东京，日本\n- 日期: 1-JAN-2027\n## Day 1 | 01-01-2027 | 东京 | Asia/Tokyo\n### [午餐] 12:00 拉面\n### 【景点】 浅草寺\n');
    expect(x.days[0].items.map((i) => [i.type, i.meal])).toEqual([['meal', 'lunch'], ['spot', undefined]]);
  });
  it('v1 meta still migrates', () => {
    const it0 = migrateItemV2({ type: 'lodging', meta: { 退房日期: '2027-01-14', 房型: '和室', 早餐: '含' } } as unknown as Item);
    expect(it0.lodging).toEqual({ checkOut: '2027-01-14', roomType: '和室' });
    expect(it0.meta).toEqual({ 早餐: '含' });
  });
  it('subtitles by type', () => {
    expect(itemSubtitle(all[0] as Item)).toBe('XX 123 · 到 新千岁机场');
    expect(itemSubtitle(all.find((i) => i.title === '小樽运河') as Item)).toBe('必逛 3 项 · 小樽運河');
  });
});

describe('v2 导航链接由 App 生成', () => {
  it('search by local name + address', () => {
    const s = all.find((i) => i.type === 'lodging')!;
    expect(placeQuery(s.place!)).toBe('札幌駅前ホテル 札幌市北区北7条西');
    expect(navLink(s, 'Asia/Tokyo', DEFAULT_SETTINGS)).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('札幌駅前ホテル 札幌市北区北7条西')}`,
    );
  });
  it('transit → directions; China uses amap', () => {
    expect(navLink(all[1], 'Asia/Tokyo')).toContain('/maps/dir/?api=1&destination=');
    expect(navLink({ type: 'spot', title: '外滩' }, 'Asia/Shanghai')).toContain('uri.amap.com');
  });
});

describe('v2 账本与清单', () => {
  it('summary', () => {
    const s = ledgerSummary(800000, [
      { amount: 5000, category: 'meal' },
      { amount: 12000, category: 'ticket' },
      { amount: 3000, category: 'meal' },
    ]);
    expect(s).toMatchObject({ spent: 20000, left: 780000 });
    expect(s.byCategory[0]).toEqual({ category: 'ticket', amount: 12000 });
  });
  it('must-do progress ignores stale ticks', () => {
    expect(mustDoProgress({ mustDo: ['a', 'b', 'c'] }, ['a', 'x'])).toEqual({ done: 1, total: 3 });
  });
});

describe('v2 证明加密', () => {
  it('round trip, wrong password rejected', async () => {
    const plain = new Blob(['hello boarding pass'], { type: 'text/plain' });
    const { blob, lock } = await encryptBlob(plain, 'pass1234', '生日');
    expect(lock.hint).toBe('生日');
    expect(await blob.text()).not.toContain('boarding');
    const back = await decryptBlob(blob, lock, 'pass1234', 'text/plain');
    expect(await back.text()).toBe('hello boarding pass');
    await expect(decryptBlob(blob, lock, 'wrong', 'text/plain')).rejects.toBeInstanceOf(WrongPasswordError);
  });
});

import { shiftDraft } from '../importer/shift';
describe('v2 预览改日期', () => {
  it('shifts every date and rebuilds keys', () => {
    const s = shiftDraft(r, '2027-03-01');
    expect([s.trip.startDate, s.trip.endDate]).toEqual(['2027-03-01', '2027-03-04']);
    expect(s.days[0].items[0].key.startsWith('2027-03-01|flight|')).toBe(true);
    expect(s.days[0].items.find((i) => i.type === 'lodging')!.lodging!.checkOut).toBe('2027-03-03');
  });
});

describe('v2 导入拦截', () => {
  it('blocks content that is not in the App format', () => {
    const bad = parseMd('# 北海道冬季旅程 Rundown\n\n## 行程总览\n- 1月9日 至 1月19日\n\n## 每日行程\n\n### 1月9日 | 新加坡出发\n- 航班 NH844\n');
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.errors.join()).toContain('没有');
  });
  it('valid sample has no errors', () => expect(r.errors).toEqual([]));
});
