// 2026-11-18：「复制给 AI 修改」—— AI 原样输出（放在代码块里）时，贴回来能读成同一份行程
import { describe, expect, it } from 'vitest';
import hokkaido from '../../qa/fixtures/hokkaido.md?raw';
import { parseMd } from '../importer/parseMd';
import { buildEditPrompt } from '../importer/editPrompt';

describe('复制给 AI 修改', () => {
  it('提示词里带完整行程；AI 原样返回的代码块能直接导入', () => {
    const prompt = buildEditPrompt(hokkaido);
    expect(prompt).toContain(hokkaido.trim());
    expect(prompt).toContain('【我要的修改】');
    const block = prompt.slice(prompt.indexOf('```text'), prompt.indexOf('```', prompt.indexOf('```text') + 3) + 3);
    const a = parseMd(hokkaido);
    const b = parseMd(block);
    expect(b.trip.title).toBe(a.trip.title);
    expect(b.days.length).toBe(a.days.length);
    expect(b.days.flatMap((d) => d.items.map((i) => i.title))).toEqual(a.days.flatMap((d) => d.items.map((i) => i.title)));
  });
});
