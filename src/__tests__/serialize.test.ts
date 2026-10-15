// 2026-10-15：App 内编辑后写回的 MD 能被 parseMd 原样读回
import { describe, expect, it } from 'vitest';
import nomarks from '../../qa/fixtures/hokkaido-nomarks.md?raw';
import hokkaido from '../../qa/fixtures/hokkaido.md?raw';
import sample from '../../qa/sample-v2.md?raw';
import { parseMd } from '../importer/parseMd';
import { tripToMd } from '../importer/serialize';
import type { Day, Item, Trip } from '../domain/types';

function load(text: string) {
  const r = parseMd(text);
  const trip: Trip = { id: 't', ...r.trip, translate: { app: 'google-translate', from: 'auto', to: 'zh-CN' }, sourceMd: text, importedAt: '', updatedAt: '' } as Trip;
  const days: Day[] = r.days.map((d, i) => ({ id: `d${i}`, tripId: 't', index: d.index, date: d.date, tz: d.tz, city: d.city, title: d.title, note: d.note }));
  const items: Item[] = r.days.flatMap((d, i) => d.items.map((it, j) => ({ ...it, id: `i${i}-${j}`, tripId: 't', dayId: `d${i}` }) as Item));
  return { r, trip, days, items };
}
const strip = (it: Item) => {
  const { src: _s, id: _i, ...rest } = it;
  void _s; void _i;
  return rest;
};

describe('写回 MD', () => {
  for (const [name, text] of [['hokkaido-nomarks', nomarks], ['hokkaido', hokkaido], ['sample-v2', sample]] as const) {
    it(`${name}：读回来一样`, () => {
      const a = load(text);
      const { md, src } = tripToMd(a.trip, a.days, a.items);
      const b = load(md);
      expect(b.r.warnings.filter((w) => !/目的地/.test(w.message))).toEqual([]);
      for (const k of ['title', 'startDate', 'endDate', 'homeTz', 'budget', 'participants', 'destination'] as const) expect(b.trip[k], k).toEqual(a.trip[k]);
      expect(b.days.map(({ id: _, ...d }) => d)).toEqual(a.days.map(({ id: _, ...d }) => d));
      expect(b.items.map(strip)).toEqual(a.items.map(strip));
      // 原文行号指向自己的 ### 行
      const lines = md.split('\n');
      for (const it of a.items) {
        const r = src.get(it.id)!;
        expect(lines[r.from - 1]).toContain(it.title);
      }
    });
  }
});
