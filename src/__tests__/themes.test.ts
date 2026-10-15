// 修订 2026-10：五套主题的文字对比度（WCAG AA）。tokens.css 改色时这里会拦住看不清的组合。
import { describe, expect, it } from 'vitest';
// vitest 会把 .css 当样式处理（?raw 拿到空串），这里直接读文件
// @ts-ignore 项目没装 node 类型
import { readFileSync } from 'node:fs';

const css: string = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

function block(sel: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`${sel.replace(/[[\]"=]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`, 'g');
  for (const m of css.matchAll(re)) for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) out[d[1]] = d[2];
  return out;
}
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const classic = block(':root');
// 四季共用块：选择器列表以 autumn 结尾，单独匹配 autumn 时会先命中它，再命中 autumn 自己的块
const themes: Record<string, Record<string, string>> = { classic };
const shared = block(':root[data-theme="autumn"]');
for (const t of ['winter', 'spring', 'summer', 'autumn']) themes[t] = { ...classic, ...shared, ...block(`:root[data-theme="${t}"]`) };

// [前景, 背景, 最低对比度]
const PAIRS: [string, string, number][] = [
  ['--color-text', '--color-page', 4.5],
  ['--color-text', '--color-surface', 4.5],
  ['--color-text-2', '--color-surface', 4.5],
  ['--color-text-2', '--color-page', 4.5],
  ['--color-primary', '--color-surface', 4.5],
  ['--color-accent-text', '--color-page', 4.5],
  ['--color-accent-text', '--color-surface', 4.5],
  ['--color-on-leather', '--color-leather', 4.5],
  ['--color-on-leather-2', '--color-leather', 3],
  ['--color-success-ink', '--color-success-soft', 4.5],
  ['--color-warning-ink', '--color-warning-soft', 4.5],
  ['--color-text-3', '--color-surface', 3],
];

describe('主题对比度', () => {
  for (const [name, vars] of Object.entries(themes)) {
    it(name, () => {
      for (const [fg, bg, min] of PAIRS) {
        expect(vars[fg], `${name} ${fg}`).toBeTruthy();
        expect(vars[bg], `${name} ${bg}`).toBeTruthy();
        expect(ratio(vars[fg], vars[bg]), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
      }
    });
  }
});
