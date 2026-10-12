import { describe, expect, it } from 'vitest';
import md from '../../qa/fixtures/hokkaido.md?raw';
import { parseMd } from '../importer/parseMd';
import { diffImport, flattenParsed } from '../importer/diff';

// A0：北海道行程（qa/fixtures/hokkaido.md，订单号已打码）整条链路
const r = parseMd(md);

describe('A0 hokkaido fixture', () => {
  it('parses without warnings', () => {
    expect(r.warnings).toEqual([]);
  });
  it('11 days, 2027-01-09 ~ 2027-01-19', () => {
    expect(r.days).toHaveLength(11);
    expect(r.trip.startDate).toBe('2027-01-09');
    expect(r.trip.endDate).toBe('2027-01-19');
  });
  it('cross-day flights keep +1', () => {
    const f = r.days[0].items[0];
    expect(f.type).toBe('flight');
    expect(f.endDayOffset).toBe(1);
    expect(r.days[10].items.at(-1)?.endDayOffset).toBe(1);
  });
  it('snow mobile has timeNote, alt and no start', () => {
    const it = r.days[5].items.find((i) => i.title.includes('Snow World'))!;
    expect(it.start).toBeUndefined();
    expect(it.timeNote).toBe('早上');
    expect(it.alt).toContain('取消洞爷湖段');
  });
  it('fixed items include flights, car returns and kaiseki', () => {
    const fixed = r.days.flatMap((d) => d.items).filter((i) => i.fixed).map((i) => i.title);
    expect(fixed.length).toBeGreaterThanOrEqual(8);
    expect(fixed.some((t) => t.includes('怀石'))).toBe(true);
  });
  it('unconfirmed lodging stays pending', () => {
    const l = r.days[7].items.find((i) => i.type === 'lodging')!;
    expect(l.bookingStatus).toBe('pending');
  });
  it('item keys are unique and re-import of same md is a no-op', () => {
    const flat = flattenParsed(r.days);
    expect(new Set(flat.map((i) => i.key)).size).toBe(flat.length);
    const d = diffImport(flat.map((i) => ({ ...i, hasUserData: false })), flat);
    expect(d.added.length + d.removed.length + d.changed.length + d.renamed.length).toBe(0);
  });
});
