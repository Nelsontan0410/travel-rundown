#!/usr/bin/env node
// 数据与逻辑护栏。两道检查：
// 1) 锁定区文件内容哈希必须与 .guard/protected.lock.json 一致（B 线任何改动都会失败）
// 2) 相对基线分支，components / features 的 TSX 改动里不得出现逻辑行（import 数据层、hooks、await、db.）
// 用法：node scripts/guard.mjs            校验
//       node scripts/guard.mjs --update   重新生成锁（只有 A 线可以执行）
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const LOCK = join(ROOT, '.guard/protected.lock.json');
const PROTECTED = [
  'src/domain', 'src/db', 'src/importer', 'src/store', 'src/links', 'src/lib',
  'src/hooks', 'src/__tests__', 'qa/fixtures',
  'package.json', 'vite.config.ts', 'tsconfig.json', 'netlify.toml',
];
const EXEMPT = new Set(['src/hooks/layout.ts']); // B 线唯一可新增的 hooks 文件

function walk(p, out = []) {
  const abs = join(ROOT, p);
  if (!existsSync(abs)) return out;
  if (statSync(abs).isFile()) return out.push(p), out;
  for (const n of readdirSync(abs)) walk(join(p, n), out);
  return out;
}
const files = [...new Set(PROTECTED.flatMap((p) => walk(p)))].filter((f) => !EXEMPT.has(f)).sort();
const hash = (f) => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex');
const current = Object.fromEntries(files.map((f) => [f, hash(f)]));

if (process.argv.includes('--update')) {
  writeFileSync(LOCK, JSON.stringify(current, null, 2) + '\n');
  console.log(`锁已更新：${files.length} 个文件`);
  process.exit(0);
}

const errors = [];
const locked = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
for (const f of new Set([...Object.keys(locked), ...Object.keys(current)])) {
  if (!(f in current)) errors.push(`被删除：${f}`);
  else if (!(f in locked)) errors.push(`未登记的新文件：${f}`);
  else if (locked[f] !== current[f]) errors.push(`被修改：${f}`);
}

// 2) 逻辑行检查（只看相对基线的新增/删除行）
const base = process.env.GUARD_BASE || 'origin/main';
let diff = '';
const branch = (() => { try { return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); } catch { return ''; } })();
const isB = process.env.GUARD_LINE === 'B' || /responsive|codex|ui/i.test(branch); // A 线分支不做逻辑行检查
try {
  if (!isB) throw new Error('skip');
  const mb = execSync(`git merge-base HEAD ${base}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  diff = execSync(`git diff ${mb} -U0 -- 'src/components/*.tsx' 'src/features/*.tsx' 'src/features/*.ts' 'src/App.tsx' 'src/main.tsx'`, { encoding: 'utf8' });
} catch { /* 无基线（本地首次）时跳过 */ }
const LOGIC = [
  /^\s*import .*from ['"]\.\.?\/(\.\.\/)?(db|importer|store|domain|hooks|lib|links)\b/,
  /\buse(State|Effect|Memo|Callback|Ref|LiveQuery|UI|TripData|Trips|Settings|CurrentTripId)\b\s*\(/,
  /\bawait\b|\basync\b|\bdb\./,
  /\b(saveImport|setItemStatus|addDoc|restoreBackup|exportBackup|deleteTrip|parseMd|checkTrip|diffImport)\b/,
  /^\s*(const|let|function)\s+(on|handle)[A-Z]/,
];
let file = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) file = line.slice(6);
  else if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
    const body = line.slice(1);
    if (LOGIC.some((r) => r.test(body))) errors.push(`${file} 出现逻辑行：${line.trim().slice(0, 90)}`);
  }
}

if (errors.length) {
  console.error('✗ 护栏未通过（B 线不得改动数据结构和底层逻辑）：');
  for (const e of errors) console.error('  - ' + e);
  console.error('\n如确实需要：写进 PR「给另一条线」，由 A 线处理。不要自己改。');
  process.exit(1);
}
console.log(`✓ 护栏通过：${files.length} 个锁定文件未变，TSX 无逻辑改动`);
