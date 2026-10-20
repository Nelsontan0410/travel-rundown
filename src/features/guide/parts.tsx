// 旅行亮点的通用小部件：保存状态、直接编辑文字、照片、照片选择与调整、添加亮点
import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import g from './Guide.module.css';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Basics';
import { Sheet } from '../../components/Layout';
import { useBlobUrl } from '../../hooks/data';
import { CATEGORIES, CATEGORY_LABEL, candidatesFrom, clampFocus, DEFAULT_FOCUS, focusStyle, LIMITS, type Candidate, type Focus, type Highlight, type HighlightCategory } from '../../domain/guide';
import { PHOTO_ACCEPT, PhotoError, processPhoto } from '../../lib/photo';
import { pickFile } from '../../lib/files';
import type { Day, Item } from '../../domain/types';

// ———————— 保存状态：以真实写入结果为准 ————————
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function useSaver() {
  const [state, setState] = useState<SaveState>('idle');
  const [msg, setMsg] = useState('');
  const last = useRef<(() => Promise<unknown>) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    last.current = fn;
    clearTimeout(timer.current);
    setState('saving');
    try {
      await fn();
      setState('saved');
      setMsg('');
      timer.current = setTimeout(() => setState('idle'), 2500);
      return true;
    } catch (e) {
      setState('error');
      setMsg(e instanceof Error ? e.message : '保存失败');
      return false;
    }
  }, []);
  const retry = useCallback(() => {
    if (last.current) void run(last.current);
  }, [run]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { state, msg, run, retry };
}

export function SaveBadge({ state, msg, onRetry }: { state: SaveState; msg: string; onRetry: () => void }) {
  if (state === 'idle') return <span className={g.save} aria-live="polite" />;
  return (
    <span className={`${g.save} ${state === 'error' ? g.saveErr : ''}`} role="status" aria-live="polite">
      {state === 'saving' && '保存中…'}
      {state === 'saved' && '已保存'}
      {state === 'error' && (
        <>
          {msg || '保存失败'}，
          <button type="button" className={g.linkBtn} onClick={onRetry}>
            重试
          </button>
        </>
      )}
    </span>
  );
}

// ———————— 直接编辑文字 ————————
export function EditableText({
  value,
  onCommit,
  max,
  placeholder,
  editing,
  multiline,
  className,
  as: Tag = 'p',
  label,
  required,
}: {
  value: string;
  onCommit: (v: string) => void | Promise<unknown>;
  max: number;
  placeholder: string;
  editing: boolean;
  multiline?: boolean;
  className?: string;
  as?: 'p' | 'h2' | 'h3' | 'span';
  label: string;
  /** 不允许清空（标题） */
  required?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [focus, setFocus] = useState(false);
  const start = useRef(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focus) setDraft(value);
  }, [value, focus]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);
  if (!editing) return value ? <Tag className={className}>{value}</Tag> : null;
  const dirty = draft !== start.current;
  const done = () => {
    setFocus(false);
    const next = Array.from(draft.trim()).slice(0, max).join('');
    if (required && !next) {
      setDraft(start.current);
      return;
    }
    if (next !== value) void onCommit(next);
    setDraft(next);
  };
  return (
    <div className={g.editWrap}>
      <textarea
        ref={ref}
        className={`${g.editInput} ${className ?? ''}`}
        value={draft}
        rows={1}
        aria-label={label}
        placeholder={placeholder}
        onFocus={() => {
          start.current = value;
          setFocus(true);
          // 手机键盘弹出后把正在输入的位置留在可见区域
          setTimeout(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
        }}
        onChange={(e) => {
          const v = e.target.value.replace(multiline ? /\r/g : /[\r\n]+/g, multiline ? '' : ' ');
          setDraft(Array.from(v).slice(0, max).join(''));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(start.current);
            ref.current?.blur();
          }
          if (e.key === 'Enter' && !multiline) {
            e.preventDefault();
            ref.current?.blur();
          }
        }}
        onBlur={done}
      />
      {focus && (
        <span className={g.counter}>
          {Array.from(draft).length}/{max}
          {dirty && (
            <button
              type="button"
              className={g.linkBtn}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDraft(start.current)}
            >
              还原
            </button>
          )}
        </span>
      )}
      {required && <span className={g.srOnly}>标题不能为空</span>}
    </div>
  );
}

// ———————— 照片 ————————
/** 显示一张存在本机的照片；找不到文件时给出清楚的占位而不是坏图 */
export function GuidePhoto({ photoKey, focus, alt, className, fallback }: { photoKey?: string; focus?: Focus; alt: string; className?: string; fallback?: ReactNode }) {
  const url = useBlobUrl(photoKey);
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [url]);
  if (!photoKey || bad || !url) {
    return <div className={`${g.photoEmpty} ${className ?? ''}`}>{fallback ?? null}</div>;
  }
  return (
    <div className={`${g.photoBox} ${className ?? ''}`}>
      <img src={url} alt={alt} style={focusStyle(focus)} onError={() => setBad(true)} draggable={false} />
    </div>
  );
}

// ———————— 选照片 + 调整位置 ————————
export function PhotoSheet({
  open,
  title,
  currentKey,
  currentFocus,
  aspect,
  onSave,
  onRemove,
  onClose,
}: {
  open: boolean;
  title: string;
  currentKey?: string;
  currentFocus?: Focus;
  aspect: string;
  onSave: (blob: Blob | undefined, focus: Focus) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | undefined>();
  const [url, setUrl] = useState<string | undefined>();
  const [focus, setFocus] = useState<Focus>(DEFAULT_FOCUS);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const curUrl = useBlobUrl(open ? currentKey : undefined);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  useEffect(() => {
    if (open) {
      setBlob(undefined);
      setErr('');
      setBusy(false);
      setFocus(currentFocus ?? DEFAULT_FOCUS);
    }
  }, [open, currentFocus]);
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  const shown = url ?? curUrl;

  const choose = async () => {
    setErr('');
    const f = await pickFile(PHOTO_ACCEPT);
    if (!f) return;
    setBusy(true);
    try {
      setBlob(await processPhoto(f));
      setFocus(DEFAULT_FOCUS);
    } catch (e) {
      setErr(e instanceof PhotoError ? e.message : '处理照片失败，请再试一次');
    } finally {
      setBusy(false);
    }
  };
  const down = (e: RPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, fx: focus.x, fy: focus.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const r = box.current?.getBoundingClientRect();
    if (!d || !r) return;
    const k = 1.4 / Math.max(1, focus.zoom);
    setFocus((f) => clampFocus({ ...f, x: d.fx - ((e.clientX - d.x) / r.width) * k, y: d.fy - ((e.clientY - d.y) / r.height) * k }));
  };
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await onSave(blob, focus);
      onClose();
    } catch (e) {
      setErr(e instanceof Error && e.message ? `保存失败：${e.message}` : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  const canSave = !!blob || (!!currentKey && JSON.stringify(focus) !== JSON.stringify(currentFocus ?? DEFAULT_FOCUS));
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={g.sheetBody}>
        <div
          ref={box}
          className={`${g.cropBox} ${shown ? g.cropOn : ''}`}
          style={{ aspectRatio: aspect }}
          onPointerDown={shown ? down : undefined}
          onPointerMove={shown ? move : undefined}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {shown ? <img src={shown} alt="预览" style={focusStyle(focus)} draggable={false} /> : <span className={g.cropHint}>还没有照片</span>}
        </div>
        {shown && (
          <>
            <p className={g.hint}>拖动照片调整显示位置</p>
            <label className={g.zoom}>
              放大
              <input type="range" min={1} max={3} step={0.05} value={focus.zoom} aria-label="放大" onChange={(e) => setFocus(clampFocus({ ...focus, zoom: Number(e.target.value) }))} />
            </label>
          </>
        )}
        {err && (
          <p className={g.err} role="alert">
            {err}
          </p>
        )}
        <div className={g.sheetBtns}>
          <Button variant="outline" icon="Image" disabled={busy} onClick={() => void choose()}>
            {shown ? '换一张' : '从相册选择'}
          </Button>
          {currentKey && onRemove && !blob && (
            <Button
              variant="outline"
              icon="Trash2"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                onRemove().then(onClose, () => setErr('移除失败，请重试')).finally(() => setBusy(false));
              }}
            >
              移除照片
            </Button>
          )}
        </div>
        <div className={g.sheetBtns}>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !canSave} onClick={() => void save()}>
            {busy ? '处理中…' : '确认'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

// ———————— 添加亮点 ————————
export function AddSheet({
  open,
  days,
  items,
  highlights,
  onClose,
  onPickItem,
  onCreate,
}: {
  open: boolean;
  days: Day[];
  items: Item[];
  highlights: Highlight[];
  onClose: () => void;
  onPickItem: (c: Candidate) => Promise<unknown>;
  onCreate: (v: { title: string; category: HighlightCategory; desc: string; dayIndex?: number; photo?: Blob }) => Promise<unknown>;
}) {
  const [mode, setMode] = useState<'choose' | 'rundown' | 'manual'>('choose');
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<HighlightCategory>('spot');
  const [desc, setDesc] = useState('');
  const [day, setDay] = useState<number | undefined>();
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [url, setUrl] = useState<string | undefined>();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setMode('choose');
      setQ('');
      setTitle('');
      setCat('spot');
      setDesc('');
      setDay(undefined);
      setPhoto(undefined);
      setErr('');
      setBusy(false);
    }
  }, [open]);
  useEffect(() => {
    if (!photo) return setUrl(undefined);
    const u = URL.createObjectURL(photo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  const cands = candidatesFrom(days, items, highlights, q);
  const pickPhoto = async () => {
    setErr('');
    const f = await pickFile(PHOTO_ACCEPT);
    if (!f) return;
    try {
      setPhoto(await processPhoto(f));
    } catch (e) {
      setErr(e instanceof PhotoError ? e.message : '处理照片失败，请再试一次');
    }
  };
  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      onClose();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : '添加失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={mode === 'choose' ? '添加亮点' : mode === 'rundown' ? '从行程里选' : '手动创建'}>
      <div className={g.sheetBody}>
        {mode === 'choose' && (
          <div className={g.choice}>
            <button type="button" className={g.choiceBtn} onClick={() => setMode('rundown')}>
              <Icon name="CalendarDays" />
              <span>
                <strong>从行程里选</strong>
                <small>选已有的景点、餐厅，自动带上标题、类别和日期</small>
              </span>
            </button>
            <button type="button" className={g.choiceBtn} onClick={() => setMode('manual')}>
              <Icon name="Pencil" />
              <span>
                <strong>手动创建</strong>
                <small>自己写标题，选类别，传照片</small>
              </span>
            </button>
          </div>
        )}
        {mode === 'rundown' && (
          <>
            <label className={g.search}>
              <Icon name="Search" size="sm" />
              <input type="search" value={q} placeholder="搜索行程里的地点或餐厅" aria-label="搜索" onChange={(e) => setQ(e.target.value)} />
            </label>
            <ul className={g.candList}>
              {cands.length === 0 && <li className={g.hint}>{q ? '没有找到匹配的项目' : '行程里还没有可选的景点或餐厅'}</li>}
              {cands.map((c) => (
                <li key={c.itemId}>
                  <button type="button" className={g.cand} disabled={busy || c.used} onClick={() => void guard(() => onPickItem(c))}>
                    <span className={g.candTitle}>{c.title}</span>
                    <span className={g.candMeta}>
                      Day {c.dayIndex} · {CATEGORY_LABEL[c.category]}
                      {c.used && ' · 已添加'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="outline" onClick={() => setMode('choose')}>
              返回
            </Button>
          </>
        )}
        {mode === 'manual' && (
          <>
            <label className={g.field}>
              标题
              <input value={title} maxLength={LIMITS.title} placeholder="例如：青秀山" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className={g.chips} role="group" aria-label="类别">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={`${g.chip} ${cat === c ? g.chipOn : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <label className={g.field}>
              简短描述（可选）
              <textarea value={desc} maxLength={LIMITS.desc} rows={2} placeholder="一两句话就好" onChange={(e) => setDesc(e.target.value)} />
            </label>
            <label className={g.field}>
              对应日期（可选）
              <select value={day ?? ''} onChange={(e) => setDay(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">不指定</option>
                {days.map((d) => (
                  <option key={d.id} value={d.index}>
                    Day {d.index} · {d.title || d.city}
                  </option>
                ))}
              </select>
            </label>
            <div className={g.photoPick}>
              {url ? <img src={url} alt="已选照片" /> : <span className={g.hint}>照片（可选）</span>}
              <Button variant="outline" size="sm" icon="Image" onClick={() => void pickPhoto()}>
                {photo ? '换一张' : '选照片'}
              </Button>
            </div>
            {err && (
              <p className={g.err} role="alert">
                {err}
              </p>
            )}
            <div className={g.sheetBtns}>
              <Button variant="outline" onClick={() => setMode('choose')}>
                返回
              </Button>
              <Button disabled={busy || !title.trim()} onClick={() => void guard(() => onCreate({ title, category: cat, desc, dayIndex: day, photo }))}>
                {busy ? '添加中…' : '添加'}
              </Button>
            </div>
          </>
        )}
        {mode !== 'manual' && err && (
          <p className={g.err} role="alert">
            {err}
          </p>
        )}
      </div>
    </Sheet>
  );
}
