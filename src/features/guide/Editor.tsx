// 第五页：编辑模式（手机 E01–E04 / 电脑 W05）。
// 点一个亮点或封面 → 编辑面板：电脑在右侧，手机是底部弹层。同一份组件、同一份草稿，切换屏宽不会丢掉正在输入的内容。
// 文字在离开输入框或关闭面板时保存；保存状态以真实写入结果为准（由页面的 SaveBadge 显示）。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import g from './Guide.module.css';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Basics';
import { Sheet } from '../../components/Layout';
import { GuidePhoto } from './parts';
import { CATEGORY_LABEL, LIMITS, moveId, moveTo, type Highlight } from '../../domain/guide';
import { CATEGORY_ICON, CategoryTiles } from './Tiles';
import type { Day, Item } from '../../domain/types';

export { useWide } from './hooks';

/** 编辑面板外壳：电脑右侧固定面板，手机底部弹层 */
export function EditPanel({ open, wide, title, onClose, children }: { open: boolean; wide: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  if (!wide)
    return (
      <Sheet open onClose={onClose} title={title}>
        <div className={g.sheetBody}>{children}</div>
      </Sheet>
    );
  return (
    <aside className={g.panel} aria-label={title}>
      <div className={g.panelHead}>
        <p className={g.panelEyebrow}>Inspector / Edit</p>
        <h2 className={g.panelTitle}>{title}</h2>
        <button type="button" className={g.iconBtn} aria-label="关闭编辑面板" onClick={onClose}>
          <Icon name="X" />
        </button>
      </div>
      <div className={g.panelBody}>{children}</div>
    </aside>
  );
}

/** 还没保存的草稿放在组件外面：电脑面板和手机弹层互换（改变窗口宽度）时，正在输入的内容不会丢 */
const drafts = new Map<string, string>();

/** 有草稿的文字框：输入时只改草稿，离开输入框时保存；dirty 状态报给页面，用来提醒离开前没保存 */
function DraftField({
  draftKey,
  label,
  value,
  max,
  multiline,
  placeholder,
  required,
  onCommit,
  onDirty,
}: {
  draftKey: string;
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  placeholder?: string;
  required?: boolean;
  onCommit: (v: string) => void;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  const [draft, setDraftState] = useState(() => drafts.get(draftKey) ?? value);
  const setDraft = (v: string) => {
    if (v === value) drafts.delete(draftKey);
    else drafts.set(draftKey, v);
    setDraftState(v);
  };
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current && !drafts.has(draftKey)) setDraftState(value);
  }, [value, draftKey]);
  useEffect(() => onDirty(label, draft.trim() !== value.trim()), [draft, value, label, onDirty]);
  useEffect(() => () => onDirty(label, false), [label, onDirty]);
  const commit = () => {
    focused.current = false;
    const v = Array.from(draft.trim()).slice(0, max).join('');
    drafts.delete(draftKey);
    if (required && !v) return setDraftState(value);
    if (v !== value) onCommit(v);
  };
  const common = {
    value: draft,
    'aria-label': label,
    placeholder,
    onFocus: (e: { currentTarget: HTMLElement }) => {
      focused.current = true;
      const el = e.currentTarget;
      setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
    },
    onBlur: commit,
  };
  return (
    <label className={g.field}>
      <span className={g.fieldHead}>
        {label}
        <span className={g.fieldCount}>
          {Array.from(draft).length}/{max}
        </span>
      </span>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => setDraft(Array.from(e.target.value).slice(0, max).join(''))} />
      ) : (
        <input
          {...common}
          onChange={(e) => setDraft(Array.from(e.target.value.replace(/[\r\n]+/g, ' ')).slice(0, max).join(''))}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      )}
    </label>
  );
}

/** 编辑单个亮点（E03 / W05 右侧面板） */
export function HighlightEditor({
  h,
  items,
  days,
  onPatch,
  onPhoto,
  onDelete,
  onDirty,
  order,
}: {
  h: Highlight;
  items: Item[];
  days: Day[];
  onPatch: (p: Partial<Pick<Highlight, 'title' | 'desc' | 'category' | 'dayIndex' | 'hidden'>>) => void;
  onPhoto: () => void;
  onDelete: () => void;
  onDirty: (key: string, dirty: boolean) => void;
  /** 顺序：拖动不方便时的替代（手机上行内放不下上下箭头，放在这里） */
  order?: { pos: number; total: number; onMove: (dir: -1 | 1) => void };
}) {
  const linked = h.itemId ? items.find((i) => i.id === h.itemId) : undefined;
  return (
    <div className={g.editor} data-editor={h.id}>
      <div className={g.editorPhoto}>
        <GuidePhoto ratio photoKey={h.photoKey} focus={h.focus} alt={h.title} className={g.editorImg} fallback={<span>还没有照片</span>} />
        <button type="button" className={g.photoEdit} onClick={onPhoto}>
          <Icon name="Camera" size="sm" />
          {h.photoKey ? '更换照片' : '添加照片'}
        </button>
      </div>
      <DraftField draftKey={`${h.id}:title`} label="亮点标题" required value={h.title} max={LIMITS.title} onCommit={(v) => onPatch({ title: v })} onDirty={onDirty} />
      <DraftField draftKey={`${h.id}:desc`} label="简短描述" multiline placeholder="一两句话就好（可选）" value={h.desc ?? ''} max={LIMITS.desc} onCommit={(v) => onPatch({ desc: v })} onDirty={onDirty} />
      <div className={g.field}>
        <span className={g.fieldHead}>类别</span>
        <CategoryTiles value={h.category} onPick={(c) => onPatch({ category: c })} />
      </div>
      <label className={g.field}>
        <span className={g.fieldHead}>对应日期</span>
        <select value={h.dayIndex ?? ''} onChange={(e) => onPatch({ dayIndex: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">不指定</option>
          {days.map((d) => (
            <option key={d.id} value={d.index}>
              Day {d.index} · {d.title || d.city}
            </option>
          ))}
        </select>
      </label>
      <div className={g.field}>
        <span className={g.fieldHead}>关联的行程项目</span>
        <p className={g.linked}>
          {!h.itemId ? '没有关联（手动创建）' : linked ? `「${linked.title}」` : '原行程里这一项已经不存在，这条亮点仍然保留。'}
        </p>
      </div>
      {order && order.total > 1 && (
        <div className={g.orderRow}>
          <span>
            顺序：第 {order.pos + 1} / {order.total} 个
          </span>
          <span className={g.tipTools}>
            <button type="button" className={g.tool} disabled={order.pos === 0} onClick={() => order.onMove(-1)}>
              <Icon name="ChevronUp" size="sm" />
              上移
            </button>
            <button type="button" className={g.tool} disabled={order.pos === order.total - 1} onClick={() => order.onMove(1)}>
              <Icon name="ChevronDown" size="sm" />
              下移
            </button>
          </span>
        </div>
      )}
      <button type="button" role="switch" aria-checked={!h.hidden} className={g.switchRow} onClick={() => onPatch({ hidden: !h.hidden })}>
        <span>在页面上显示</span>
        <span className={`${g.switch} ${h.hidden ? '' : g.switchOn}`} aria-hidden />
      </button>
      <p className={g.note}>修改标题、照片和说明只影响旅行亮点本身，原行程保持不变。</p>
      <Button variant="outline" icon="Trash2" className={g.dangerBtn} onClick={onDelete}>
        删除这条亮点
      </Button>
    </div>
  );
}

/** 编辑封面（E01） */
export function CoverEditor({
  photoKey,
  place,
  dates,
  days,
  intro,
  onPhoto,
  onIntro,
  onDirty,
}: {
  photoKey?: string;
  place: string;
  dates: string;
  days: string;
  intro: string;
  onPhoto: () => void;
  onIntro: (v: string) => void;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  return (
    <div className={g.editor}>
      <div className={g.editorPhoto}>
        <GuidePhoto photoKey={photoKey} alt="封面" className={g.editorImg} fallback={<span>还没有封面照片</span>} />
        <button type="button" className={g.photoEdit} onClick={onPhoto}>
          <Icon name="Camera" size="sm" />
          {photoKey ? '更换封面' : '添加封面照片'}
        </button>
      </div>
      <dl className={g.readonly}>
        <div>
          <dt>目的地名称</dt>
          <dd>{place}</dd>
        </div>
        <div>
          <dt>日期</dt>
          <dd>{dates}</dd>
        </div>
        <div>
          <dt>行程天数</dt>
          <dd>{days}</dd>
        </div>
      </dl>
      <p className={g.note}>目的地、日期和天数来自你的行程，要改请到「旅程设置」或重新导入。</p>
      <DraftField draftKey="cover:intro" label="简介" multiline placeholder="写一两句话介绍这趟旅行（可选）" value={intro} max={LIMITS.intro} onCommit={onIntro} onDirty={onDirty} />
    </div>
  );
}

/** 管理亮点（E02）：拖动排序、上移下移、显示开关；点一行打开编辑 */
export function ManageList({
  list,
  selected,
  onOpen,
  onReorder,
  onToggle,
}: {
  list: Highlight[];
  selected?: string;
  onOpen: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onToggle: (h: Highlight) => void;
}) {
  const ids = list.map((h) => h.id);
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const start = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, over: ids.indexOf(id) });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    let over = ids.length - 1;
    for (let i = 0; i < ids.length; i++) {
      const r = refs.current.get(ids[i])?.getBoundingClientRect();
      if (!r) continue;
      // 一行（手机）或网格（电脑）都按「指针在卡片中线之前」判断
      const before = r.width > window.innerWidth * 0.6 ? e.clientY < r.top + r.height / 2 : e.clientY < r.bottom && (e.clientY < r.top || e.clientX < r.left + r.width / 2);
      if (before) {
        over = i;
        break;
      }
    }
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const end = () => {
    if (drag && drag.over !== ids.indexOf(drag.id)) onReorder(moveTo(ids, drag.id, drag.over));
    setDrag(null);
  };
  return (
    <ol className={g.manage}>
      {list.map((h, i) => (
        <li
          key={h.id}
          data-hl={h.id}
          ref={(el) => {
            if (el) refs.current.set(h.id, el);
            else refs.current.delete(h.id);
          }}
          className={[g.mRow, h.hidden ? g.mHidden : '', selected === h.id ? g.mSelected : '', drag?.id === h.id ? g.mDrag : '', drag && drag.id !== h.id && drag.over === i ? g.mOver : ''].join(' ')}
        >
          <button
            type="button"
            className={`${g.tool} ${g.grip}`}
            aria-label={`拖动「${h.title}」调整顺序`}
            onPointerDown={(e) => start(h.id, e)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => setDrag(null)}
          >
            <Icon name="GripVertical" size="sm" />
          </button>
          <button type="button" className={g.mOpen} aria-label={`编辑「${h.title}」`} onClick={() => onOpen(h.id)}>
            <GuidePhoto thumb photoKey={h.photoKey} focus={h.focus} alt="" className={g.mThumb} fallback={<Icon name={CATEGORY_ICON[h.category]} size="sm" />} />
            <span className={g.mText}>
              <strong data-hl-title>{h.title}</strong>
              <small>
                {CATEGORY_LABEL[h.category]}
                {h.dayIndex !== undefined ? ` · Day ${h.dayIndex}` : ''}
                {h.hidden ? ' · 已隐藏' : ''}
              </small>
            </span>
          </button>
          <span className={g.mMove}>
            <button type="button" className={g.tool} disabled={i === 0} aria-label={`上移「${h.title}」`} onClick={() => onReorder(moveId(ids, h.id, -1))}>
              <Icon name="ChevronUp" size="sm" />
            </button>
            <button type="button" className={g.tool} disabled={i === ids.length - 1} aria-label={`下移「${h.title}」`} onClick={() => onReorder(moveId(ids, h.id, 1))}>
              <Icon name="ChevronDown" size="sm" />
            </button>
          </span>
          <button type="button" role="switch" aria-checked={!h.hidden} aria-label={`显示「${h.title}」`} className={`${g.switch} ${h.hidden ? '' : g.switchOn}`} onClick={() => onToggle(h)} />
        </li>
      ))}
    </ol>
  );
}
