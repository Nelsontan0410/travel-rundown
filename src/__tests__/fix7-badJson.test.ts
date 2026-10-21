// 审查修复 #7（2026-10-21）：结构不对的 JSON 走正常的错误提示，不抛出未处理的异常
import { describe, expect, it } from 'vitest';
import { parseImport } from '../importer/structured';

const bad = ['{"days":[null]}', '[null]', '{"days":"x"}', '{"days":[1]}', '{"days":["Day 1"]}', '{"days":[[1]]}', '{"days":[{"date":"2027-01-13","activities":[]}, null]}', '{}', 'null'];

describe('#7 异常 JSON', () => {
  for (const text of bad) {
    it(`${text} → 友好报错，不崩溃`, () => {
      let r: ReturnType<typeof parseImport> | undefined;
      expect(() => (r = parseImport(text, 'trip.json'))).not.toThrow();
      expect(r!.result.errors.length).toBeGreaterThan(0);
      expect(r!.result.itemCount).toBe(0);
    });
  }

  it('days 里不是对象的那一天，报出是第几个、现在是什么', () => {
    expect(parseImport('{"days":[{"date":"2027-01-13"}, null]}', 'trip.json').result.errors[0]).toBe('days[1] 应该是一个对象 { … }，现在是空值（null）');
    expect(parseImport('{"days":[1]}', 'trip.json').result.errors[0]).toBe('days[0] 应该是一个对象 { … }，现在是数字');
    expect(parseImport('{"days":"x"}', 'trip.json').result.errors[0]).toBe('days 应该是一个数组 [ … ]，现在是文字');
  });

  it('活动列表里夹着 null：照旧当成备注，不影响其他内容', () => {
    const r = parseImport('{"trip":{"title":"T","startDate":"2027-01-13"},"days":[{"date":"2027-01-13","activities":[null,{"type":"spot","time":"10:00","title":"A"}]}]}', 'trip.json');
    expect(r.result.errors).toEqual([]);
    expect(r.result.days[0].items.map((i) => i.title)).toContain('A');
  });
});
