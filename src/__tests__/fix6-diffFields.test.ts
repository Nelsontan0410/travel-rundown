// 审查修复 #6（2026-10-21）：重新导入预览和确认导入用同一份字段——导入会覆盖的内容，预览都要报出来
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import md from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { db } from '../db/schema';
import { loadDiffOld, saveImport } from '../db/repo';
import { diffImport, flattenParsed, importContent } from '../importer/diff';
import hokkaido from '../../qa/fixtures/hokkaido.md?raw';
import hokkaidoNoMarks from '../../qa/fixtures/hokkaido-nomarks.md?raw';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function reimport(md2: string) {
  const tripId = await saveImport(parseMd(md), md);
  const r2 = parseMd(md2);
  const d = diffImport(await loadDiffOld(tripId), flattenParsed(r2.days));
  return { tripId, r2, d };
}

describe('#6 预览不漏报', () => {
  it('只改地址：预览显示「地点」有变化，确认后地址更新', async () => {
    const md2 = md.replace('- 地址: 小樽市港町 | 小樽市港町', '- 地址: 小樽市港町 1-1 | 小樽市港町1-1');
    const { tripId, r2, d } = await reimport(md2);
    expect(d.changed).toEqual([{ key: expect.stringContaining('小樽运河'), title: '小樽运河', fields: ['地点'] }]);
    expect(d.unchanged).toBeGreaterThan(0);
    await saveImport(r2, md2, tripId);
    const it2 = (await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.title === '小樽运河')!;
    expect(it2.place?.address).toBe('小樽市港町 1-1');
  });

  it('必逛清单、备选方案、餐别以外的字段改动也会报出来', async () => {
    const md2 = md
      .replace('  - 音乐盒堂\n', '  - 音乐盒堂\n  - 小樽洋果子铺\n')
      .replace('- 备选: 下雪太大就改去小樽艺术村室内展', '- 备选: 下雪就去室内')
      .replace('- 必吃: 海胆丼、帝王蟹', '- 必吃: 海胆丼');
    const { d } = await reimport(md2);
    const by = Object.fromEntries(d.changed.map((c) => [c.title, c.fields]));
    expect(by['小樽运河']).toEqual(expect.arrayContaining(['必逛 / 必吃', '备选方案']));
    expect(by['三角市场海鲜丼']).toEqual(['必逛 / 必吃']);
  });

  it('没有改动：一项都不报（含真实北海道行程）', async () => {
    for (const src of [md, hokkaido, hokkaidoNoMarks]) {
      await Promise.all(db.tables.map((t) => t.clear()));
      const tripId = await saveImport(parseMd(src), src);
      const d = diffImport(await loadDiffOld(tripId), flattenParsed(parseMd(src).days));
      expect(d.changed).toEqual([]);
      expect(d.added).toEqual([]);
      expect(d.removed).toEqual([]);
    }
  });

  it('确认导入写入的每一个内容字段都在比较范围内（单一来源）', async () => {
    const tripId = await saveImport(parseMd(md), md);
    const stored = await db.items.where('tripId').equals(tripId).toArray();
    const parsed = parseMd(md).days.flatMap((d) => d.items);
    for (const p of parsed) {
      const s = stored.find((x) => x.key === p.key)!;
      // 导入写进去的 = 解析结果 + id/tripId/dayId；去掉这几个和行号、顺序后，正好是比较用的内容
      const { id: _i, tripId: _t, dayId: _d, ...written } = s;
      void _i; void _t; void _d;
      expect(importContent(written)).toEqual(importContent(p));
    }
  });
});
