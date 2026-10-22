// 2026-10-23 新增 / 编辑美食（同一个表单）。照片在浏览器里检查、缩到 1600px 再存，另存 480px 缩略图。
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import d from './Database.module.css';
import { FoodShell } from './FoodShell';
import { useFullPhoto } from './photos';
import { backToGallery } from './DatabasePage';
import { BackHeader, Dialog } from '../../components/Layout';
import { Button, InfoBanner } from '../../components/Basics';
import { Field, TextInput } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { useFoodEntry, useFoodTrip } from '../../hooks/food';
import { addFoodEntry, updateFoodEntry, type PhotoChange } from '../../db/food';
import { FOOD_CATEGORIES, FOOD_CURRENCIES, FOOD_LIMITS, validateFood, type FoodCategory, type FoodDraft, type FoodEntry } from '../../domain/food';
import { clampFocus, DEFAULT_FOCUS, focusStyle, type Focus } from '../../domain/guide';
import { makeThumb, PHOTO_ACCEPT, PhotoError, processPhoto, storageErrorText } from '../../lib/photo';
import { pickFile } from '../../lib/files';
import { toast } from '../../store/ui';

export default function FoodFormPage() {
  const { foodId } = useParams();
  const nav = useNavigate();
  const entry = useFoodEntry(foodId);
  if (foodId && entry === undefined) return <FoodShell><div className={d.page} /></FoodShell>;
  if (foodId && entry === null)
    return (
      <FoodShell>
        <div className={d.page}>
          <BackHeader title="编辑美食" onBack={() => backToGallery(nav)} />
          <main className={d.main}>
            <div className={d.empty}>
              <p className={d.emptyTitle}>找不到这道美食</p>
              <p className={d.emptyText}>可能已经被删除了。</p>
              <Button onClick={() => nav('/food/database', { replace: true })}>回到美食资料库</Button>
            </div>
          </main>
        </div>
      </FoodShell>
    );
  return <FoodForm key={entry?.id ?? 'new'} initial={entry ?? undefined} />;
}

interface FormState {
  name: string;
  category: FoodCategory | '';
  restaurantName: string;
  address: string;
  phone: string;
  currency: string;
  min: string;
  max: string;
  coords: string;
  description: string;
}

const fromEntry = (f?: FoodEntry): FormState => ({
  name: f?.name ?? '',
  category: f?.category ?? '',
  restaurantName: f?.restaurantName ?? '',
  address: f?.address ?? '',
  phone: f?.phone ?? '',
  currency: f?.budget?.currency ?? '',
  min: f?.budget?.min !== undefined ? String(f.budget.min) : '',
  max: f?.budget?.max !== undefined ? String(f.budget.max) : '',
  coords: f?.lat !== undefined && f?.lng !== undefined ? `${f.lat}, ${f.lng}` : '',
  description: f?.description ?? '',
});

/** 「22.8170, 108.3665」→ 坐标；空着 = 没有；格式不对 = NaN（校验时报错） */
function parseCoords(s: string): { lat?: number; lng?: number } {
  const t = s.trim();
  if (!t) return {};
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : { lat: NaN, lng: NaN };
}
const amount = (s: string) => (s.trim() ? Number(s.replace(/[,，\s]/g, '')) : undefined);

function toDraft(v: FormState, focus: Focus | undefined): Partial<FoodDraft> {
  const min = amount(v.min);
  const max = amount(v.max);
  return {
    name: v.name,
    category: (v.category || undefined) as FoodCategory | undefined,
    restaurantName: v.restaurantName,
    address: v.address,
    phone: v.phone,
    description: v.description,
    ...parseCoords(v.coords),
    budget: min !== undefined || max !== undefined ? { currency: v.currency, min, max } : undefined,
    photoFocus: focus,
  };
}

/** 新照片（还没存）：处理好的原图 + 缩略图 */
type NewPhoto = { blob: Blob; thumb?: Blob; url: string };

function FoodForm({ initial }: { initial?: FoodEntry }) {
  const foodTrip = useFoodTrip();
  const nav = useNavigate();
  const [v, setV] = useState<FormState>(() => fromEntry(initial));
  const [focus, setFocus] = useState<Focus | undefined>(initial?.photoFocus);
  const [photo, setPhoto] = useState<NewPhoto | null>(null);
  const [removed, setRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const [errs, setErrs] = useState<ReturnType<typeof validateFood>>({});
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const curUrl = useFullPhoto(removed ? undefined : initial?.photoKey);
  const shown = photo?.url ?? (removed ? undefined : curUrl ?? undefined);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const initialJson = useMemo(() => JSON.stringify([fromEntry(initial), initial?.photoFocus ?? null]), [initial]);
  const dirty = !!photo || removed || JSON.stringify([v, focus ?? null]) !== initialJson;

  // 关闭或刷新页面时，有没保存的修改先提醒
  useEffect(() => {
    if (!dirty || saving) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, saving]);

  const set = <K extends keyof FormState>(k: K, val: FormState[K]) => {
    setV((cur) => ({ ...cur, [k]: val }));
    setSaveErr('');
  };

  const choosePhoto = async () => {
    setPhotoErr('');
    const file = await pickFile(PHOTO_ACCEPT);
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setPhotoErr('请选择 JPG、PNG 或 WebP 照片');
      return;
    }
    setPhotoBusy(true);
    try {
      const blob = await processPhoto(file);
      const thumb = await makeThumb(blob);
      setPhoto({ blob, thumb, url: URL.createObjectURL(blob) });
      setRemoved(false);
      setFocus(undefined);
    } catch (e) {
      setPhotoErr(e instanceof PhotoError ? e.message : '处理照片失败，请再试一次');
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = () => {
    setPhoto(null);
    setRemoved(!!initial?.photoKey);
    setFocus(undefined);
  };

  // 拖动照片调整在正方形格子里的位置（不改原图）
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const f = focus ?? DEFAULT_FOCUS;
  const down = (e: RPointerEvent) => {
    if (!shown) return;
    drag.current = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const dr = drag.current;
    const r = box.current?.getBoundingClientRect();
    if (!dr || !r) return;
    const k = 1.4 / Math.max(1, f.zoom);
    setFocus(clampFocus({ ...f, x: dr.fx - ((e.clientX - dr.x) / r.width) * k, y: dr.fy - ((e.clientY - dr.y) / r.height) * k }));
  };

  const leave = () => backToGallery(nav);
  const cancel = () => (dirty ? setConfirmLeave(true) : leave());

  const save = async () => {
    const draft = toDraft(v, focus && JSON.stringify(focus) !== JSON.stringify(DEFAULT_FOCUS) ? focus : undefined);
    const e = validateFood(draft);
    setErrs(e);
    if (Object.keys(e).length) {
      setSaveErr('还有资料没填好，请看红字提示');
      return;
    }
    setSaving(true);
    setSaveErr('');
    const change: PhotoChange = photo ? { blob: photo.blob, thumb: photo.thumb } : removed ? null : undefined;
    try {
      if (initial) await updateFoodEntry(initial.id, draft, change);
      else await addFoodEntry(foodTrip?.id ?? '', draft, change);
      toast(initial ? '已保存' : `已新增「${draft.name?.trim()}」`);
      leave();
    } catch (err) {
      setSaveErr(storageErrorText(err) ?? `保存失败：${(err as Error).message || '请再试一次'}`);
      setSaving(false);
    }
  };

  return (
    <FoodShell>
      <div className={d.page}>
        <BackHeader title={initial ? '编辑美食' : '新增美食'} onBack={cancel} />
        <main className={d.main}>
          <form
            className={d.form}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <section className={d.section}>
              <h2 className={d.sectionTitle}>美食照片</h2>
              <div className={d.photoRow}>
                <div
                  ref={box}
                  className={`${d.photoBox} ${shown ? d.photoOn : ''}`}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={() => (drag.current = null)}
                  onPointerCancel={() => (drag.current = null)}
                >
                  {shown ? (
                    <img src={shown} alt="美食照片预览" draggable={false} style={focusStyle(f) as CSSProperties} />
                  ) : (
                    <span className={d.photoHint}>
                      <Icon name="Camera" />
                      {photoBusy ? '处理中…' : '还没有照片'}
                    </span>
                  )}
                </div>
                <div className={d.photoCtl}>
                  <Button variant="outline" size="sm" icon="Upload" disabled={photoBusy || saving} onClick={() => void choosePhoto()}>
                    {photoBusy ? '处理中…' : shown ? '更换照片' : '上传美食照片'}
                  </Button>
                  {shown && (
                    <Button variant="outline" size="sm" icon="Trash2" disabled={photoBusy || saving} onClick={removePhoto}>
                      移除照片
                    </Button>
                  )}
                  {shown && (
                    <label className={d.zoom}>
                      <span>放大</span>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={f.zoom}
                        onChange={(e) => setFocus(clampFocus({ ...f, zoom: Number(e.target.value) }))}
                        aria-label="照片放大"
                      />
                    </label>
                  )}
                  <p className={d.photoNote}>{shown ? '拖动照片调整在正方形格子里的位置，原图不会被裁掉。' : '支持 JPG / PNG / WebP。'}</p>
                </div>
              </div>
              {photoErr && <p className={d.err} role="alert">{photoErr}</p>}
            </section>

            <section className={d.section}>
              <h2 className={d.sectionTitle}>基本资料</h2>
              <Field label="美食名称 *" error={errs.name}>
                <TextInput value={v.name} maxLength={FOOD_LIMITS.name} placeholder="例如：南宁老友粉" aria-invalid={!!errs.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <div className={d.field}>
                <span className={d.label}>分类 *</span>
                <div className={d.segment} role="radiogroup" aria-label="分类">
                  {FOOD_CATEGORIES.map((c) => (
                    <button key={c.key} type="button" role="radio" aria-checked={v.category === c.key} className={`${d.seg} ${v.category === c.key ? d.segOn : ''}`} onClick={() => set('category', c.key)}>
                      {c.label}
                    </button>
                  ))}
                </div>
                {errs.category && <span className={d.err} role="alert">{errs.category}</span>}
              </div>
              <Field label="店名 *" error={errs.restaurantName}>
                <TextInput value={v.restaurantName} maxLength={FOOD_LIMITS.restaurant} placeholder="例如：舒记粉店" aria-invalid={!!errs.restaurantName} onChange={(e) => set('restaurantName', e.target.value)} />
              </Field>
              <Field label="地址 *" error={errs.address} hint="完整地址，中英文、数字、符号都可以">
                <textarea className={d.textarea} rows={2} value={v.address} maxLength={FOOD_LIMITS.address} placeholder="例如：广西南宁市兴宁区民生路 12 号" aria-invalid={!!errs.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="地图坐标（可选）" error={errs.coords} hint="有坐标时导航更准，格式：纬度, 经度">
                <TextInput value={v.coords} inputMode="decimal" placeholder="例如：22.8170, 108.3665" aria-invalid={!!errs.coords} onChange={(e) => set('coords', e.target.value)} />
              </Field>
            </section>

            <section className={d.section}>
              <h2 className={d.sectionTitle}>其他资料</h2>
              <Field label="电话（可选）" error={errs.phone}>
                <TextInput type="tel" inputMode="tel" autoComplete="off" value={v.phone} maxLength={FOOD_LIMITS.phone} placeholder="例如：+86 771 123 4567" aria-invalid={!!errs.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <div className={d.field}>
                <span className={d.label}>预算 · 每人（可选）</span>
                <div className={d.budgetRow}>
                  <select className={d.select} value={v.currency} onChange={(e) => set('currency', e.target.value)} aria-label="币种">
                    <option value="">币种</option>
                    {FOOD_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <TextInput inputMode="decimal" value={v.min} placeholder="最低" aria-label="最低预算" onChange={(e) => set('min', e.target.value)} />
                  <span className={d.dash}>–</span>
                  <TextInput inputMode="decimal" value={v.max} placeholder="最高" aria-label="最高预算" onChange={(e) => set('max', e.target.value)} />
                </div>
                {errs.budget && <span className={d.err} role="alert">{errs.budget}</span>}
              </div>
              <Field label="美食形容（可选）" hint="口味、特色、招牌食材、推荐原因、注意事项……">
                <textarea className={d.textarea} rows={6} value={v.description} maxLength={FOOD_LIMITS.description} placeholder="例如：酸辣带劲的老友汤底，配酸笋和豆豉，建议早上去" onChange={(e) => set('description', e.target.value)} />
              </Field>
            </section>

            {saveErr && <InfoBanner variant="warning">{saveErr}</InfoBanner>}
            <div className={d.actions}>
              <Button variant="outline" disabled={saving} onClick={cancel}>
                取消
              </Button>
              <Button type="submit" disabled={saving || photoBusy}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          </form>
        </main>
        <Dialog
          open={confirmLeave}
          onClose={() => setConfirmLeave(false)}
          title="放弃这些修改？"
          text="还有修改没有保存，离开后会丢失。"
          actions={
            <>
              <Button variant="outline" onClick={() => setConfirmLeave(false)}>
                继续编辑
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmLeave(false);
                  leave();
                }}
              >
                放弃修改
              </Button>
            </>
          }
        />
      </div>
    </FoodShell>
  );
}
