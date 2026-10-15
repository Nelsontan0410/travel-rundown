// 2026-10-15：导入后在 App 里编辑或新增一项。所有字段都能改：类型、日期、时间、地点（含当地语言名和地址）、
// 终点、航班 / 住宿 / 交通 / 餐饮专属信息、必逛 / 必吃、订单、预订状态、备选、备注、其他自定义信息。
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import p from './Page.module.css';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader, Dialog } from '../components/Layout';
import { Button, FilterChips, SectionTitle } from '../components/Basics';
import { Field, SwitchRow, TextInput } from '../components/Form';
import { db } from '../db/schema';
import { addItem, deleteItem, moveItem, updateItem, type ItemPatch } from '../db/repo';
import { useTripData } from '../hooks/data';
import { fmtMonthDay, SEP } from '../domain/format';
import { MEAL_LABEL, TYPE_LABEL } from '../domain/rules';
import { toast } from '../store/ui';
import type { BookingStatus, Item, ItemType, MealKind } from '../domain/types';

const TYPES = (Object.keys(TYPE_LABEL) as ItemType[]).map((value) => ({ value, label: TYPE_LABEL[value] }));
const MEALS = (Object.keys(MEAL_LABEL) as MealKind[]).map((value) => ({ value, label: MEAL_LABEL[value] }));
const STATUS: { value: 'none' | BookingStatus; label: string }[] = [
  { value: 'none', label: '不标注' },
  { value: 'confirmed', label: '已确认' },
  { value: 'pending', label: '待确认' },
];

interface Form {
  type: ItemType;
  dayId: string;
  title: string;
  start: string;
  end: string;
  nextDay: boolean;
  timeNote: string;
  fixed: boolean;
  placeName: string;
  placeLocal: string;
  address: string;
  localAddress: string;
  toName: string;
  toLocal: string;
  flightNo: string;
  airline: string;
  terminal: string;
  seat: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  mode: string;
  line: string;
  meal: MealKind | '';
  mustDo: string;
  bookingRef: string;
  status: 'none' | BookingStatus;
  alt: string;
  note: string;
  navUrl: string;
  meta: [string, string][];
}

function toForm(it: Partial<Item>, dayId: string): Form {
  return {
    type: it.type ?? 'spot',
    dayId,
    title: it.title ?? '',
    start: it.start ?? '',
    end: it.end ?? '',
    nextDay: !!it.endDayOffset,
    timeNote: it.timeNote ?? '',
    fixed: !!it.fixed,
    placeName: it.place?.name ?? '',
    placeLocal: it.place?.localName ?? '',
    address: it.place?.address ?? '',
    localAddress: it.place?.localAddress ?? '',
    toName: it.toPlace?.name ?? '',
    toLocal: it.toPlace?.localName ?? '',
    flightNo: it.flight?.number ?? '',
    airline: it.flight?.airline ?? '',
    terminal: it.flight?.terminal ?? '',
    seat: it.flight?.seat ?? '',
    checkIn: it.lodging?.checkIn ?? '',
    checkOut: it.lodging?.checkOut ?? '',
    roomType: it.lodging?.roomType ?? '',
    mode: it.transit?.mode ?? '',
    line: it.transit?.line ?? '',
    meal: it.meal ?? '',
    mustDo: (it.mustDo ?? []).join('\n'),
    bookingRef: it.bookingRef ?? '',
    status: it.bookingStatus ?? 'none',
    alt: it.alt ?? '',
    note: it.note ?? '',
    navUrl: it.navUrl ?? '',
    meta: Object.entries(it.meta ?? {}),
  };
}

function toPatch(f: Form): ItemPatch & { type: ItemType; title: string } {
  const u = (s: string) => s.trim() || undefined;
  return {
    type: f.type,
    dayId: f.dayId,
    title: f.title.trim(),
    start: u(f.start),
    end: f.start ? u(f.end) : undefined,
    endDayOffset: f.start && f.end && f.nextDay ? 1 : undefined,
    timeNote: f.start ? undefined : u(f.timeNote),
    fixed: f.fixed || undefined,
    place: { name: f.placeName.trim(), localName: u(f.placeLocal), address: u(f.address), localAddress: u(f.localAddress) },
    toPlace: { name: f.toName.trim(), localName: u(f.toLocal) },
    flight: { number: u(f.flightNo), airline: u(f.airline), terminal: u(f.terminal), seat: u(f.seat) },
    lodging: { checkIn: u(f.checkIn), checkOut: u(f.checkOut), roomType: u(f.roomType) },
    transit: { mode: u(f.mode), line: u(f.line) },
    meal: f.meal || undefined,
    mustDo: f.mustDo.split(/\n|；|;/).map((s) => s.trim()).filter(Boolean),
    bookingRef: u(f.bookingRef),
    bookingStatus: f.status === 'none' ? undefined : f.status,
    alt: u(f.alt),
    note: u(f.note),
    navUrl: u(f.navUrl),
    meta: Object.fromEntries(f.meta.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()])),
  };
}

export default function ItemEditPage() {
  const nav = useNavigate();
  const { itemId, tripId: newTripId } = useParams();
  const [sp] = useSearchParams();
  const item = useLiveQuery(async () => (itemId ? (await db.items.get(itemId)) ?? null : undefined), [itemId]);
  const tripId = item?.tripId ?? newTripId;
  const td = useTripData(tripId);
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const isNew = !itemId;

  useEffect(() => {
    if (f || !td || td.trip.id !== tripId) return;
    if (item) setF(toForm(item, item.dayId));
    else if (isNew) setF(toForm({ type: (sp.get('type') as ItemType) || 'spot' }, sp.get('day') ?? td.days[0]?.id ?? ''));
  }, [item, td]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayItems = useMemo(() => (td && item ? td.items.filter((i) => i.dayId === item.dayId) : []), [td, item]);

  // useTripData 换 tripId 时会先返回上一次的结果（null），这里不据此跳走；新增页没有旅程时才跳
  if (item === null || (isNew && td === null)) return <Navigate to="/itinerary" replace />;
  if (!td || td.trip.id !== tripId || !f) return <Screen tab="itinerary" header={<BackHeader title={isNew ? '新增一项' : '编辑'} />}>{null}</Screen>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const text = (k: keyof Form, label: string, opts: { placeholder?: string; type?: string; hint?: string } = {}) => (
    <Field label={label} hint={opts.hint}>
      <TextInput type={opts.type ?? 'text'} value={f[k] as string} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );
  const save = async () => {
    if (!f.title.trim()) return setErr('标题不能空着');
    if (f.end && !f.start) return setErr('有结束时间时也要填开始时间');
    const patch = toPatch(f);
    if (isNew) {
      const id = await addItem(td.trip.id, f.dayId, patch);
      toast('已新增');
      nav(`/item/${id}`, { replace: true });
    } else {
      await updateItem(item!.id, patch);
      toast('已保存');
      nav(-1);
    }
  };
  const idx = item ? dayItems.findIndex((i) => i.id === item.id) : -1;
  const isTransport = f.type === 'flight' || f.type === 'transit';

  return (
    <>
      <TripThemeScope theme={td.trip.theme} />
      <Screen
        tab="itinerary"
        header={<BackHeader title={isNew ? '新增一项' : '编辑'} />}
        bottom={
          <Button icon="CheckCircle2" onClick={() => void save()}>
            保存
          </Button>
        }
      >
        <form
          className={p.editForm}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <SectionTitle first>基本</SectionTitle>
          <FilterChips options={TYPES} value={f.type} onChange={(v) => set('type', v)} />
          <Field label="标题" error={err || undefined}>
            <TextInput value={f.title} placeholder="例如：小樽运河" onChange={(e) => { set('title', e.target.value); setErr(''); }} />
          </Field>
          <Field label="哪一天">
            <select className={p.select} value={f.dayId} onChange={(e) => set('dayId', e.target.value)}>
              {td.days.map((d) => (
                <option key={d.id} value={d.id}>
                  {`Day ${d.index}${SEP}${fmtMonthDay(d.date)}${SEP}${d.title ?? d.city}`}
                </option>
              ))}
            </select>
          </Field>
          <div className={p.editRow}>
            {text('start', '开始时间', { type: 'time' })}
            {text('end', '结束时间', { type: 'time' })}
          </div>
          {f.start && f.end && <SwitchRow label="结束时间在第二天（+1）" on={f.nextDay} onChange={(v) => set('nextDay', v)} />}
          {!f.start && text('timeNote', '时间说明', { placeholder: '没有准确时间时，例如：上午' })}
          <SwitchRow label="固定时间（航班、预约等）" on={f.fixed} onChange={(v) => set('fixed', v)} />
          {f.type === 'meal' && (
            <Field label="餐别">
              <FilterChips options={MEALS} value={(f.meal || 'lunch') as MealKind} onChange={(v) => set('meal', v)} />
            </Field>
          )}

          <SectionTitle>{isTransport ? '起点' : '地点'}</SectionTitle>
          <div className={p.editRow}>
            {text('placeName', '名称', { placeholder: '中文或常用名' })}
            {text('placeLocal', '当地语言名称', { placeholder: '例如：小樽運河' })}
          </div>
          {text('address', '地址')}
          {text('localAddress', '当地语言地址', { hint: '给司机看的地址卡会用这一行' })}
          {isTransport && (
            <>
              <SectionTitle>终点</SectionTitle>
              <div className={p.editRow}>
                {text('toName', '名称')}
                {text('toLocal', '当地语言名称')}
              </div>
            </>
          )}

          {f.type === 'flight' && (
            <>
              <SectionTitle>航班</SectionTitle>
              <div className={p.editRow}>
                {text('flightNo', '航班号')}
                {text('airline', '航空公司')}
              </div>
              <div className={p.editRow}>
                {text('terminal', '航站楼')}
                {text('seat', '座位')}
              </div>
            </>
          )}
          {f.type === 'lodging' && (
            <>
              <SectionTitle>住宿</SectionTitle>
              <div className={p.editRow}>
                {text('checkIn', '入住日期', { type: 'date' })}
                {text('checkOut', '退房日期', { type: 'date' })}
              </div>
              {text('roomType', '房型')}
            </>
          )}
          {f.type === 'transit' && (
            <>
              <SectionTitle>交通</SectionTitle>
              <div className={p.editRow}>
                {text('mode', '方式', { placeholder: '例如：JR、巴士、租车' })}
                {text('line', '线路')}
              </div>
            </>
          )}
          {(f.type === 'spot' || f.type === 'meal') && (
            <Field label={f.type === 'meal' ? '必吃（一行一项）' : '必逛 / 必体验（一行一项）'} hint="已勾选的项目，文字不变就会保留勾选">
              <textarea className={p.textarea} rows={4} value={f.mustDo} onChange={(e) => set('mustDo', e.target.value)} />
            </Field>
          )}

          <SectionTitle>预订</SectionTitle>
          {text('bookingRef', '预订编号')}
          <Field label="预订状态">
            <FilterChips options={STATUS} value={f.status} onChange={(v) => set('status', v)} />
          </Field>

          <SectionTitle>其他</SectionTitle>
          <Field label="备选方案">
            <textarea className={p.textarea} rows={2} value={f.alt} onChange={(e) => set('alt', e.target.value)} />
          </Field>
          <Field label="备注">
            <textarea className={p.textarea} rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
          {text('navUrl', '导航链接（可选）', { placeholder: 'https://', hint: '一般不用填，App 会按地点自动生成导航' })}
          {f.meta.map(([k, v], i) => (
            <div key={i} className={p.editRow}>
              <Field label="名称">
                <TextInput value={k} onChange={(e) => set('meta', f.meta.map((m, j) => (j === i ? [e.target.value, m[1]] : m)))} />
              </Field>
              <Field label="内容">
                <TextInput value={v} onChange={(e) => set('meta', f.meta.map((m, j) => (j === i ? [m[0], e.target.value] : m)))} />
              </Field>
            </div>
          ))}
          <Button type="button" variant="link" chevron={false} icon="Plus" onClick={() => set('meta', [...f.meta, ['', '']])}>
            加一条其他信息
          </Button>

          {!isNew && (
            <>
              <SectionTitle>位置</SectionTitle>
              <div className={p.btnRow}>
                <Button type="button" variant="outline" disabled={idx <= 0} onClick={() => void moveItem(item!.id, -1).then(() => toast('已上移'))}>
                  上移
                </Button>
                <Button type="button" variant="outline" disabled={idx < 0 || idx >= dayItems.length - 1} onClick={() => void moveItem(item!.id, 1).then(() => toast('已下移'))}>
                  下移
                </Button>
              </div>
              <div className={p.mt24}>
                <Button type="button" block variant="danger" icon="Trash2" onClick={() => setConfirmDel(true)}>
                  删除这一项
                </Button>
              </div>
            </>
          )}
        </form>
        <Dialog
          open={confirmDel}
          onClose={() => setConfirmDel(false)}
          title="删除这一项？"
          text="完成状态会一起删除；关联的证明和账本会保留，只是不再关联到这一项。"
          actions={
            <>
              <Button variant="outline" onClick={() => setConfirmDel(false)}>
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const dayTrip = td.trip.id;
                  void deleteItem(item!.id).then(() => {
                    toast('已删除');
                    nav(`/itinerary/${dayTrip}`, { replace: true });
                  });
                }}
              >
                删除
              </Button>
            </>
          }
        />
      </Screen>
    </>
  );
}
