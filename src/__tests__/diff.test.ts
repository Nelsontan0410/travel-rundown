import { describe, expect, it } from 'vitest';
import { diffImport, similarity, type DiffNewItem, type DiffOldItem } from '../importer/diff';

const o = (key: string, title: string, o2: Partial<DiffOldItem> = {}): DiffOldItem => ({
  key, type: 'spot', title, date: '2026-11-04', hasUserData: false, ...o2,
});
const n = (key: string, title: string, o2: Partial<DiffNewItem> = {}): DiffNewItem => ({
  key, type: 'spot', title, date: '2026-11-04', ...o2,
});

describe('diffImport', () => {
  it('exact key match, no change', () => {
    const d = diffImport([o('a', '浅草寺')], [n('a', '浅草寺')]);
    expect(d.unchanged).toBe(1);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
  });
  it('detects changed fields', () => {
    const d = diffImport([o('a', '浅草寺', { start: '09:30' })], [n('a', '浅草寺', { start: '10:00', note: 'x' })]);
    expect(d.changed).toEqual([{ key: 'a', title: '浅草寺', fields: ['开始时间', '备注'] }]);
  });
  it('adds a new item without touching others', () => {
    const d = diffImport([o('a', 'A')], [n('a', 'A'), n('b', 'B')]);
    expect(d.added.map((x) => x.key)).toEqual(['b']);
    expect(d.removed).toHaveLength(0);
    expect(d.unchanged).toBe(1);
  });
  it('removes an item and flags user data', () => {
    const d = diffImport([o('a', 'A', { hasUserData: true }), o('b', 'B')], [n('b', 'B')]);
    expect(d.removed.map((x) => x.key)).toEqual(['a']);
    expect(d.removedWithData.map((x) => x.key)).toEqual(['a']);
  });
  it('suspects rename by same start time', () => {
    const d = diffImport([o('k1', '浅草寺参拜', { start: '09:30' })], [n('k2', '浅草寺', { start: '09:30' })]);
    expect(d.renamed).toEqual([{ oldKey: 'k1', newKey: 'k2', oldTitle: '浅草寺参拜', newTitle: '浅草寺', reason: 'same-start' }]);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
  });
  it('suspects rename by similar title when no start time', () => {
    const d = diffImport([o('k1', 'Snow World Toya 雪地摩托')], [n('k2', 'Snow World Toya 雪地摩托体验')]);
    expect(d.renamed[0]?.reason).toBe('similar-title');
  });
  it('does not rename across different type or day', () => {
    const d = diffImport([o('k1', '浅草寺', { start: '09:30' })], [n('k2', '浅草寺', { start: '09:30', type: 'note' }), n('k3', '浅草寺', { start: '09:30', date: '2026-11-05' })]);
    expect(d.renamed).toHaveLength(0);
    expect(d.removed).toHaveLength(1);
    expect(d.added).toHaveLength(2);
  });
  it('ambiguous candidates are not auto-matched', () => {
    const d = diffImport([o('k1', 'A', { start: '09:00' })], [n('k2', 'B', { start: '09:00' }), n('k3', 'C', { start: '09:00' })]);
    expect(d.renamed).toHaveLength(0);
    expect(d.removed).toHaveLength(1);
    expect(d.added).toHaveLength(2);
  });
  it('two olds claiming one new are not auto-matched', () => {
    const d = diffImport([o('k1', 'A', { start: '09:00' }), o('k2', 'B', { start: '09:00' })], [n('k3', 'C', { start: '09:00' })]);
    expect(d.renamed).toHaveLength(0);
  });
  it('similarity basics', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abcd', 'wxyz')).toBe(0);
    expect(similarity('', 'a')).toBe(0);
  });
});
