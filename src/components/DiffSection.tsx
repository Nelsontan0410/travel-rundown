import { useState } from 'react';
import s from './DiffSection.module.css';
import { InfoBanner } from './Basics';
import type { ImportDiff } from '../importer/diff';

interface Props {
  diff: ImportDiff;
  /** 用户接受的改名（旧 key → 新 key） */
  accepted: Set<string>;
  onToggleRename: (oldKey: string) => void;
}

function Group({ label, count, children, warn }: { label: string; count: number; children: React.ReactNode; warn?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className={s.group}>
      <button type="button" className={s.head} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={warn ? s.warn : undefined}>{label}</span>
        <span className={s.count}>{count}</span>
      </button>
      {open && children}
    </div>
  );
}

/** 重新导入预览：新增 / 修改 / 删除 / 疑似改名 */
export default function DiffSection({ diff, accepted, onToggleRename }: Props) {
  return (
    <div className={s.wrap}>
      <h3 className={s.title}>与现有行程对比</h3>
      {diff.removedWithData.length > 0 && (
        <InfoBanner variant="warning">
          有 {diff.removedWithData.length} 项带有完成状态或证明的行程项将被删除，其证明会回到「未关联」
        </InfoBanner>
      )}
      <Group label="疑似改名（标题改了，是同一项吗？）" count={diff.renamed.length}>
        <div className={s.group}>
          {diff.renamed.map((r) => (
            <label key={r.oldKey} className={s.rename}>
              <input type="checkbox" checked={accepted.has(r.oldKey)} onChange={() => onToggleRename(r.oldKey)} />
              <span>
                {r.oldTitle} → {r.newTitle}（{r.reason === 'same-start' ? '开始时间相同' : '标题相近'}）
              </span>
            </label>
          ))}
          <span className={s.count}>勾选后保留这一项的完成状态和证明；不勾选则视为删除旧项、新增新项。</span>
        </div>
      </Group>
      <Group label="新增" count={diff.added.length}>
        <ul className={s.list}>{diff.added.map((i) => <li key={i.key}>{i.date} {i.title}</li>)}</ul>
      </Group>
      <Group label="修改" count={diff.changed.length}>
        <ul className={s.list}>{diff.changed.map((c) => <li key={c.key}>{c.title}：{c.fields.join('、')}</li>)}</ul>
      </Group>
      <Group label="删除" count={diff.removed.length} warn={diff.removedWithData.length > 0}>
        <ul className={s.list}>
          {diff.removed.map((i) => (
            <li key={i.key}>{i.date} {i.title}{i.hasUserData ? '（有状态或证明）' : ''}</li>
          ))}
        </ul>
      </Group>
      <span className={s.count}>未变化 {diff.unchanged} 项</span>
    </div>
  );
}
