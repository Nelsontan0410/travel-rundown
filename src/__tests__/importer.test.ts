// 修订 2026-10 · ISSUE-004：MD / JSON / CSV / 文字导入、字段映射、预览修正
import { describe, expect, it } from 'vitest';
import nomarks from '../../qa/fixtures/hokkaido-nomarks.md?raw';
import { detectFormat, parseCsv, parseImport, readDate } from '../importer/structured';
import { CSV_TEMPLATE, JSON_TEMPLATE } from '../importer/templates';
import { mapUnmapped, setDayDate, setItemType, setTripTitle } from '../importer/corrections';
import { canonField } from '../importer/mapping';

describe('格式判断', () => {
  it('按文件名和内容判断', () => {
    expect(detectFormat('{"a":1}')).toBe('json');
    expect(detectFormat('[]', 'x.json')).toBe('json');
    expect(detectFormat('date,title,type\n2027-01-01,a,spot')).toBe('csv');
    expect(detectFormat('x', 'a.csv')).toBe('csv');
    expect(detectFormat('# 北海道，日本\n## Day 1 | 13-01-2027', 'a.md')).toBe('md');
    expect(detectFormat('东京・富士山，日本\nDay 1 | 10-01-2027 | 东京')).toBe('text');
  });
});

describe('字段别名（Layer 2）', () => {
  it('Place / Location / 地点 落到同一字段', () => {
    for (const k of ['Place', 'location', '地点', 'Venue', 'where']) expect(canonField(k)).toBe('地点');
    for (const k of ['Notes', 'remark', '备注', 'Description']) expect(canonField(k)).toBe('备注');
    expect(canonField('title', 'trip')).toBe('旅程标题');
    expect(canonField('title', 'day')).toBe('当天主题');
    expect(canonField('title')).toBe('标题');
    expect(canonField('pax')).toBe('人数');
  });
});

describe('日期不静默误解', () => {
  it('ISO 无歧义；日和月都 ≤12 时标出另一种理解', () => {
    expect(readDate('2027-01-13')).toEqual({ iso: '2027-01-13' });
    expect(readDate('13-01-2027').iso).toBe('2027-01-13');
    expect(readDate('13-01-2027').alt).toBeUndefined();
    const amb = readDate('03-04-2027');
    expect(amb.iso).toBe('2027-04-03');
    expect(amb.alt).toBe('2027-03-04');
    expect(readDate('04/25/2027').iso).toBe('2027-04-25');
    expect(readDate('04/25/2027').note).toMatch(/月-日-年/);
  });
});

describe('JSON 官方模板', () => {
  const { result, format } = parseImport(JSON_TEMPLATE, 'trip.json');
  it('精准映射到天和活动', () => {
    expect(format).toBe('json');
    expect(result.errors).toEqual([]);
    expect(result.trip.title).toBe('北海道，日本');
    expect(result.trip.startDate).toBe('2027-01-13');
    expect(result.trip.participants).toBe(2);
    expect(result.trip.budget).toBe(800000);
    expect(result.trip.homeTz).toBe('Asia/Kuala_Lumpur');
    expect(result.days).toHaveLength(2);
    const [fl, lo] = result.days[0].items;
    expect(fl.type).toBe('flight');
    expect(fl.start).toBe('08:30');
    expect(fl.flight?.number).toBe('XX 123');
    expect(fl.place?.localName).toBe('Kuala Lumpur International Airport');
    expect(fl.toPlace?.name).toBe('新千岁机场');
    expect(fl.bookingStatus).toBe('confirmed');
    expect(fl.fixed).toBe(true);
    expect(lo.lodging?.checkOut).toBe('2027-01-14');
    const spot = result.days[1].items[0];
    expect(spot.mustDo).toEqual(['运河散步', '音乐盒堂']);
    expect(spot.note).toBe('雪天路滑');
    expect(result.days[1].items[1].meal).toBe('lunch');
    expect(result.mapping?.unmapped).toEqual([]);
    expect(result.mapping?.flags).toEqual([]);
  });
});

describe('JSON 非标准写法', () => {
  it('别名、扁平活动列表、未知字段保留并列出', () => {
    const json = JSON.stringify({
      name: '首尔，韩国',
      itinerary: [
        { date: '2027-03-01', type: 'attraction', time: '09:00-11:00', activity: '景福宫', location: '景福宫', weather: '晴' },
        { date: '2027-03-01', type: 'restaurant', time: '12:00', activity: '土俗村参鸡汤', remarks: '排队' },
        { date: '2027-03-02', type: 'zzz', activity: '自由活动' },
      ],
    });
    const { result } = parseImport(json);
    expect(result.trip.title).toBe('首尔，韩国');
    expect(result.days).toHaveLength(2);
    const [a, b] = result.days[0].items;
    expect(a.type).toBe('spot');
    expect([a.start, a.end]).toEqual(['09:00', '11:00']);
    expect(a.place?.name).toBe('景福宫');
    expect(a.meta?.weather).toBe('晴');
    expect(b.type).toBe('meal');
    expect(b.note).toBe('排队');
    expect(result.mapping?.unmapped.map((u) => u.field)).toContain('weather');
    // 认不出的类型：标成需要确认，不静默当成别的
    expect(result.mapping?.flags.some((f) => f.kind === 'type' && f.raw === 'zzz')).toBe(true);
  });
  it('坏 JSON 给出明确错误', () => {
    const { result } = parseImport('{"trip": ');
    expect(result.errors[0]).toMatch(/JSON 格式有误/);
  });
  it('有歧义的日期标出来', () => {
    const { result } = parseImport(JSON.stringify({ trip: { title: 'A，B' }, days: [{ date: '03-04-2027', activities: [{ type: 'spot', title: 'x' }] }] }));
    expect(result.mapping?.flags.find((f) => f.kind === 'ambiguous-date')).toMatchObject({ iso: '2027-04-03', alt: '2027-03-04' });
  });
});

describe('CSV', () => {
  it('BOM、引号、引号里的换行和逗号', () => {
    const rows = parseCsv('﻿a,b,c\n1,"x, y","line1\nline2"\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'line1\nline2'],
    ]);
  });
  it('官方模板每行一个活动，按天归组', () => {
    const { result, format } = parseImport(CSV_TEMPLATE, 'trip.csv');
    expect(format).toBe('csv');
    expect(result.errors).toEqual([]);
    expect(result.trip.title).toBe('北海道，日本');
    expect(result.trip.participants).toBe(2);
    expect(result.days.map((d) => d.date)).toEqual(['2027-01-13', '2027-01-14']);
    expect(result.days[0].items.map((i) => i.type)).toEqual(['flight', 'lodging']);
    const spot = result.days[1].items[0];
    expect(spot.place?.localName).toBe('小樽運河');
    expect(spot.mustDo).toEqual(['运河散步', '音乐盒堂']);
    expect(spot.note).toBe('雪天路滑， 穿防滑鞋');
    expect(result.mapping?.dropped).toEqual([]);
  });
  it('缺日期的行不丢：列在「没导入的内容」里', () => {
    const { result } = parseImport('date,title,type\n2027-01-01,A,spot\n,B,spot\n', 'x.csv');
    expect(result.itemCount).toBe(1);
    expect(result.mapping?.dropped[0]).toMatchObject({ where: '第 3 行' });
  });
});

describe('MD 兼容 + 新别名', () => {
  it('现有格式照常识别', () => {
    const { result } = parseImport(nomarks);
    expect(result.errors).toEqual([]);
    expect(result.days).toHaveLength(10);
  });
  it('英文字段名和「时间」字段', () => {
    const { result } = parseImport('# 台北，台湾\n- 日期: 01-02-2027 ~ 01-02-2027\n## Day 1 | 01-02-2027 | 台北 | Asia/Taipei\n### [spot] 101 大楼\n- Location: 台北 101\n- Time: 10:00-12:00\n- Notes: 买票\n- 人数: 3\n');
    const it0 = result.days[0].items[0];
    expect(it0.place?.name).toBe('台北 101');
    expect([it0.start, it0.end]).toEqual(['10:00', '12:00']);
    expect(it0.note).toBe('买票');
  });
  it('旅程层「人数」', () => {
    const { result } = parseImport('# 台北，台湾\n- 日期: 01-02-2027 ~ 01-02-2027\n- 人数: 3 人\n## Day 1 | 01-02-2027 | 台北 | Asia/Taipei\n### [spot] 101\n');
    expect(result.trip.participants).toBe(3);
  });
});

describe('预览修正（Layer 3）', () => {
  const base = parseImport(JSON.stringify({ days: [{ activities: [{ type: '??', title: '自由活动', weather: '晴' }] }] })).result;
  it('缺日期会阻止导入，补上后放行', () => {
    expect(base.errors.length).toBeGreaterThan(0);
    const fixed = setDayDate(base, 0, '2027-05-01');
    expect(fixed.days[0].date).toBe('2027-05-01');
    expect(fixed.trip.startDate).toBe('2027-05-01');
    expect(fixed.errors.some((e) => /没有日期|行程日期/.test(e))).toBe(false);
    // 类型也补上之后才完全放行
    const typeFlag = fixed.mapping!.flags.find((f) => f.kind === 'type')!;
    expect(setItemType(fixed, 0, 0, 'note', typeFlag.id).errors).toEqual([]);
    expect(fixed.days[0].items[0].key).toMatch(/^2027-05-01\|/);
  });
  it('补标题、改类型、改字段映射', () => {
    let r = setTripTitle(base, '大阪，日本');
    expect(r.trip.title).toBe('大阪，日本');
    expect(r.mapping?.flags.some((f) => f.kind === 'title')).toBe(false);
    const flag = r.mapping!.flags.find((f) => f.kind === 'type')!;
    r = setItemType(r, 0, 0, 'spot', flag.id);
    expect(r.days[0].items[0].type).toBe('spot');
    expect(r.mapping?.flags.some((f) => f.kind === 'type')).toBe(false);
    const u = r.mapping!.unmapped[0];
    r = mapUnmapped(r, u.id, 'note');
    expect(r.days[0].items[0].note).toBe('晴');
    expect(r.days[0].items[0].meta).toBeUndefined();
    // 原草稿没被改
    expect(base.trip.title).toBe('未命名旅程');
  });
});
