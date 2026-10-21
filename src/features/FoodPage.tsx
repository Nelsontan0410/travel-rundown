// 2026-10-21 美食专区：一份旅程的备选美食库。原定那一餐吃不成时，从这里挑一家「改去这家」。
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import p from './Page.module.css';
import TripUnavailable from './TripUnavailable';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader, Sheet, Dialog } from '../components/Layout';
import { Button, Card, EmptyState, FilterChips, InfoBanner, SectionTitle } from '../components/Basics';
import { Field, FormActions, SwitchRow, TextInput } from '../components/Form';
import { FoodCard, FoodList, PlannedMealRow, foodStyles as fs, type FoodCardView } from '../components/Food';
import { useSettings, useTripData, type TripData } from '../hooks/data';
import { useFoods } from '../hooks/food';
import { addFood, deleteFood, importFoods, setFoodMark, swapMealTo, updateFood } from '../db/food';
import {
  filterFoods, foodAlternatives, foodCities, foodPlace, FOOD_KIND_LABEL, FOOD_KINDS, MEAL_LABEL, MEALS, plannedMeals, sameCity,
  type FoodFilter, type FoodInput, type FoodKind, type FoodMark, type FoodSpot,
} from '../domain/food';
import { foodPrompt, parseFoodMd } from '../importer/food';
import { placeLink, placeQuery } from '../links/maps';
import { copyWithToast, openExternal } from '../links/openLink';
import { SEP } from '../domain/format';
import type { MealKind } from '../domain/types';
import { toast } from '../store/ui';

const ALL = '';

function view(f: FoodSpot, mark: FoodMark | undefined, reasons?: string[]): FoodCardView {
  return {
    name: f.name,
    localName: f.place?.localName,
    tags: [FOOD_KIND_LABEL[f.kind], f.cuisine, f.city].filter((x): x is string => !!x),
    reasons,
    meals: f.meals?.length ? f.meals.map((m) => MEAL_LABEL[m]).join('、') : undefined,
    mustTry: f.mustTry,
    price: f.price,
    hours: f.hours,
    reserve: f.reserve,
    note: f.note,
    ate: mark?.ate,
    fav: mark?.fav,
  };
}

/** 一家店在哪个时区导航：同城那天的时区，没有就用第一天 */
function tzFor(td: TripData, f: FoodSpot): string {
  return td.days.find((d) => f.dayIndexes?.includes(d.index))?.tz ?? td.days.find((d) => sameCity(d.city, f.city))?.tz ?? td.days[0]?.tz ?? td.trip.homeTz;
}

const list = (s: string) => s.split(/[；;、,，\n]/).map((x) => x.trim()).filter(Boolean);

/** 新增 / 编辑一家店 */
function FoodSheet({ open, onClose, td, editing }: { open: boolean; onClose: () => void; td: TripData; editing?: FoodSpot }) {
  const [name, setName] = useState('');
  const [localName, setLocalName] = useState('');
  const [city, setCity] = useState('');
  const [kind, setKind] = useState<FoodKind>('meal');
  const [cuisine, setCuisine] = useState('');
  const [meals, setMeals] = useState<MealKind[]>([]);
  const [address, setAddress] = useState('');
  const [localAddress, setLocalAddress] = useState('');
  const [mustTry, setMustTry] = useState('');
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('');
  const [reserve, setReserve] = useState(false);
  const [url, setUrl] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    const f = editing;
    setName(f?.name ?? '');
    setLocalName(f?.place?.localName ?? '');
    setCity(f?.city ?? '');
    setKind(f?.kind ?? 'meal');
    setCuisine(f?.cuisine ?? '');
    setMeals(f?.meals ?? []);
    setAddress(f?.place?.address ?? '');
    setLocalAddress(f?.place?.localAddress ?? '');
    setMustTry(f?.mustTry?.join('、') ?? '');
    setPrice(f?.price ?? '');
    setHours(f?.hours ?? '');
    setReserve(!!f?.reserve);
    setUrl(f?.url ?? '');
    setDays(f?.dayIndexes ?? []);
    setNote(f?.note ?? '');
    setErr('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) return setErr('请填写店名');
    const data: FoodInput = {
      name,
      kind,
      city: city || undefined,
      cuisine: cuisine || undefined,
      meals,
      place: { name, localName, address, localAddress },
      mustTry: list(mustTry),
      price: price || undefined,
      hours: hours || undefined,
      reserve,
      url: url || undefined,
      dayIndexes: days,
      note: note || undefined,
    };
    try {
      if (editing) await updateFood(editing.id, data);
      else await addFood(td.trip.id, data);
      toast(editing ? '已更新' : '已加入美食专区');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async () => {
    if (!editing) return;
    await deleteFood(editing.id);
    setConfirmDel(false);
    toast('已删除');
    onClose();
  };

  const cities = [...new Set(td.days.map((d) => d.city).filter(Boolean))];
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Sheet open={open} onClose={onClose} title={editing ? '编辑美食' : '加一家店'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="店名" error={err || undefined}>
          <TextInput value={name} maxLength={80} autoFocus={!editing} onChange={(e) => { setName(e.target.value); setErr(''); }} />
        </Field>
        <Field label="当地名称（可选，导航更准）">
          <TextInput value={localName} maxLength={80} onChange={(e) => setLocalName(e.target.value)} />
        </Field>
        <Field label="城市 / 区域">
          <TextInput value={city} maxLength={80} list="food-cities" onChange={(e) => setCity(e.target.value)} />
          <datalist id="food-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className={p.mt12}>
          <FilterChips options={FOOD_KINDS.map((value) => ({ value, label: FOOD_KIND_LABEL[value] }))} value={kind} onChange={setKind} />
        </div>
        <Field label="菜系（可选）">
          <TextInput value={cuisine} maxLength={80} placeholder="拉面、寿司、汤咖喱……" onChange={(e) => setCuisine(e.target.value)} />
        </Field>
        <Field label="适合（不选表示都可以）">
          <div className={fs.check}>
            {MEALS.map((m) => (
              <Button key={m} size="sm" variant={meals.includes(m) ? 'primary' : 'outline'} aria-pressed={meals.includes(m)} onClick={() => setMeals(toggle(meals, m))}>
                {MEAL_LABEL[m]}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="地址（可选）">
          <TextInput value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="当地语言地址（可选）">
          <TextInput value={localAddress} maxLength={300} onChange={(e) => setLocalAddress(e.target.value)} />
        </Field>
        <Field label="必吃（用顿号或逗号分开）">
          <TextInput value={mustTry} onChange={(e) => setMustTry(e.target.value)} />
        </Field>
        <Field label="价位（可选）">
          <TextInput value={price} maxLength={80} placeholder="¥1,500/人" onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="营业时间 / 定休日（可选）">
          <TextInput value={hours} maxLength={300} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <SwitchRow label="需要预约" on={reserve} onChange={setReserve} />
        <Field label="参考链接（可选）">
          <TextInput type="url" value={url} maxLength={300} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
        </Field>
        {td.days.length > 0 && (
          <Field label="打算哪天去（可选）">
            <div className={fs.check}>
              {td.days.map((d) => (
                <Button key={d.id} size="sm" variant={days.includes(d.index) ? 'primary' : 'outline'} aria-pressed={days.includes(d.index)} onClick={() => setDays(toggle(days, d.index))}>
                  Day {d.index}{d.city ? ` ${d.city}` : ''}
                </Button>
              ))}
            </div>
          </Field>
        )}
        <Field label="备注（可选）">
          <TextInput value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormActions>
          {editing && (
            <Button variant="outline" onClick={() => setConfirmDel(true)}>
              删除
            </Button>
          )}
          <Button type="submit">保存</Button>
        </FormActions>
      </form>
      <Dialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="删除这家店？"
        text="只从美食专区删除，不影响行程。"
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmDel(false)}>取消</Button>
            <Button variant="danger" onClick={() => void remove()}>删除</Button>
          </>
        }
      />
    </Sheet>
  );
}

/** 用外部 AI 整理美食清单，再贴回来 */
function ImportSheet({ open, onClose, td }: { open: boolean; onClose: () => void; td: TripData }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const parsed = useMemo(() => (text.trim() ? parseFoodMd(text) : null), [text]);
  const prompt = foodPrompt({ destination: td.trip.destination || td.trip.title, cities: [...new Set(td.days.map((d) => d.city).filter(Boolean))], days: td.days.length });
  const run = async () => {
    if (!parsed?.rows.length) return;
    const r = await importFoods(td.trip.id, parsed.rows);
    toast(`新增 ${r.added} 家${r.updated ? `，更新 ${r.updated} 家` : ''}${r.unchanged ? `，${r.unchanged} 家没变` : ''}`);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="导入美食清单">
      <p className={p.lead}>① 复制提示词，贴到 ChatGPT / Claude 等 AI；② 把 AI 回复的清单整段贴到下面。同名同城的店会更新，不会重复。</p>
      <div className={p.mt12}>
        <Button block variant="outline" icon="Copy" onClick={() => void copyWithToast(prompt, '提示词已复制')}>
          复制提示词
        </Button>
      </div>
      <div className={p.mt12}>
        <Field label="贴上美食清单（Markdown 或 JSON）">
          <textarea className={fs.textarea} value={text} onChange={(e) => setText(e.target.value)} placeholder={'## 札幌\n### [正餐] 店名 | 当地店名\n- 适合: 午餐、晚餐\n- 必吃: …'} />
        </Field>
      </div>
      {parsed && (
        <div className={p.mt8}>
          <InfoBanner variant={parsed.rows.length ? 'info' : 'warning'}>
            {parsed.rows.length ? `读到 ${parsed.rows.length} 家店` : '还没读到店'}
            {parsed.warnings.length ? `；${parsed.warnings.slice(0, 3).join('；')}${parsed.warnings.length > 3 ? ' …' : ''}` : ''}
          </InfoBanner>
        </div>
      )}
      <FormActions>
        <Button disabled={!parsed?.rows.length} onClick={() => void run()}>
          导入{parsed?.rows.length ? ` ${parsed.rows.length} 家` : ''}
        </Button>
      </FormActions>
    </Sheet>
  );
}

export default function FoodPage() {
  const nav = useNavigate();
  const { tripId } = useParams();
  const [sp, setSp] = useSearchParams();
  const td = useTripData(tripId);
  const fd = useFoods(tripId);
  const settings = useSettings();
  const [filter, setFilter] = useState<FoodFilter>({ hideAte: false });
  const [sheet, setSheet] = useState<'edit' | 'import' | null>(null);
  const [editing, setEditing] = useState<FoodSpot | undefined>();
  const [swap, setSwap] = useState<FoodSpot | undefined>();
  const forId = sp.get('for');

  if (td === null) return <TripUnavailable tripId={tripId ?? ''} title="美食专区" />;
  if (!td || !fd) return <Screen tab="food" header={<BackHeader title="美食专区" />}>{null}</Screen>;

  const meal = forId ? td.items.find((i) => i.id === forId && i.type === 'meal') : undefined;
  const mealDay = meal ? td.dayById.get(meal.dayId) : undefined;
  const marks = fd.marks;
  const openEdit = (f?: FoodSpot) => {
    setEditing(f);
    setSheet('edit');
  };
  const navTo = (f: FoodSpot) => openExternal(placeLink(foodPlace(f), tzFor(td, f), settings), placeQuery(foodPlace(f)));
  const card = (f: FoodSpot, reasons?: string[]) => (
    <FoodCard
      key={f.id}
      food={view(f, marks.get(f.id), reasons)}
      onNav={() => navTo(f)}
      onLink={f.url ? () => openExternal(f.url!) : undefined}
      onAte={() => void setFoodMark(td.trip.id, f.id, { ate: !marks.get(f.id)?.ate })}
      onFav={() => void setFoodMark(td.trip.id, f.id, { fav: !marks.get(f.id)?.fav })}
      onEdit={() => openEdit(f)}
      primary={meal ? { label: '改去这家', onClick: () => setSwap(f) } : undefined}
    />
  );
  const doSwap = async () => {
    if (!meal || !swap) return;
    try {
      await swapMealTo(meal.id, swap.id);
      toast(`已改去「${swap.name}」，原计划写在备选方案里`);
      setSwap(undefined);
      nav(`/item/${meal.id}`, { replace: true });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const cities = foodCities(fd.foods, td.days);
  const planned = plannedMeals(td.items, td.days);
  const alts = meal ? foodAlternatives(meal, mealDay, fd.foods, marks) : [];
  const near = alts.filter((a) => a.nearby);
  const far = alts.filter((a) => !a.nearby);
  const shown = filterFoods(fd.foods, marks, filter);

  return (
    <>
      <TripThemeScope theme={td.trip.theme} />
      <Screen
        tab="food"
        header={
          <BackHeader
            title={meal ? '换一家吃' : '美食专区'}
            onBack={meal ? () => setSp({}, { replace: true }) : undefined}
            right={{ icon: 'FileUp', label: '导入美食清单', onClick: () => setSheet('import') }}
          />
        }
        bottom={
          <Button block icon="Plus" onClick={() => openEdit()}>
            加一家店
          </Button>
        }
      >
        {meal ? (
          <>
            <Card className={fs.banner}>
              <p className={p.lead}>
                原定：Day {mealDay?.index}
                {mealDay?.city ? `${SEP}${mealDay.city}` : ''}
                {meal.meal ? `${SEP}${MEAL_LABEL[meal.meal]}` : ''}
              </p>
              <strong>{meal.title}</strong>
              <div className={p.mt8}>
                <Button variant="link" onClick={() => setSp({}, { replace: true })}>看全部美食</Button>
              </div>
            </Card>
            {!fd.foods.length ? (
              <EmptyState title="美食专区还是空的" text="先导入一份 AI 整理的美食清单，或者自己加几家店。" action={<Button onClick={() => setSheet('import')}>导入美食清单</Button>} />
            ) : !alts.length ? (
              <EmptyState compact title="没有其他备选" text="专区里的店都吃过了，或者就是原定这家。" />
            ) : (
              <>
                <SectionTitle>{near.length ? `附近 ${near.length} 家` : '附近没有备选'}</SectionTitle>
                <FoodList>{near.map((a) => card(a.food, a.reasons))}</FoodList>
                {far.length > 0 && (
                  <>
                    <SectionTitle>其他城市 / 没写城市</SectionTitle>
                    <FoodList>{far.map((a) => card(a.food, a.reasons))}</FoodList>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <p className={p.lead}>
              {td.trip.title}
              {SEP}原定的餐吃不成时，从这里挑备选，不用当场找。
            </p>
            {planned.length > 0 && (
              <details className={p.mt12}>
                <summary>行程里的 {planned.length} 餐</summary>
                <Card>
                  {planned.map(({ item, day }) => {
                    const n = foodAlternatives(item, day, fd.foods, marks).filter((a) => a.nearby).length;
                    return (
                      <PlannedMealRow
                        key={item.id}
                        title={item.title}
                        sub={[day ? `Day ${day.index}` : '', day?.city, item.meal ? MEAL_LABEL[item.meal] : '', item.start].filter(Boolean).join(SEP)}
                        count={n ? `${n} 家备选` : '换一家'}
                        onClick={() => setSp({ for: item.id })}
                      />
                    );
                  })}
                </Card>
              </details>
            )}
            {!fd.foods.length ? (
              <EmptyState
                title="还没有收录美食"
                text="复制提示词让 AI 按你的行程整理一份备选美食清单，贴回来就能用；也可以自己一家家加。"
                action={<Button onClick={() => setSheet('import')}>导入美食清单</Button>}
              />
            ) : (
              <>
                <div className={`${fs.filters} ${p.mt12}`}>
                  <TextInput className={fs.search} type="search" placeholder="搜索店名、菜系、必吃" value={filter.q ?? ''} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
                  {cities.length > 1 && (
                    <FilterChips options={[{ value: ALL, label: '全部城市' }, ...cities.map((c) => ({ value: c, label: c }))]} value={filter.city ?? ALL} onChange={(c) => setFilter({ ...filter, city: c || undefined })} />
                  )}
                  <FilterChips
                    options={[{ value: ALL, label: '全部' }, ...MEALS.map((m) => ({ value: m as string, label: MEAL_LABEL[m] }))]}
                    value={filter.meal ?? ALL}
                    onChange={(m) => setFilter({ ...filter, meal: (m || undefined) as MealKind | undefined })}
                  />
                  <div className={fs.toggles}>
                    <Button size="sm" variant={filter.favOnly ? 'primary' : 'outline'} icon="Star" aria-pressed={!!filter.favOnly} onClick={() => setFilter({ ...filter, favOnly: !filter.favOnly })}>
                      只看收藏
                    </Button>
                    <Button size="sm" variant={filter.hideAte ? 'primary' : 'outline'} aria-pressed={!!filter.hideAte} onClick={() => setFilter({ ...filter, hideAte: !filter.hideAte })}>
                      隐藏吃过的
                    </Button>
                  </div>
                </div>
                <SectionTitle>
                  {shown.length === fd.foods.length ? `共 ${fd.foods.length} 家` : `${shown.length} / ${fd.foods.length} 家`}
                </SectionTitle>
                {shown.length ? <FoodList>{shown.map((f) => card(f))}</FoodList> : <EmptyState compact title="没有符合的店" text="换个筛选条件试试。" />}
              </>
            )}
          </>
        )}
      </Screen>
      <FoodSheet open={sheet === 'edit'} onClose={() => setSheet(null)} td={td} editing={editing} />
      <ImportSheet open={sheet === 'import'} onClose={() => setSheet(null)} td={td} />
      <Dialog
        open={!!swap}
        onClose={() => setSwap(undefined)}
        title={`改去「${swap?.name ?? ''}」？`}
        text={`这一餐的店名、地点、必吃会换成这家；原计划「${meal?.title ?? ''}」写进备选方案，也会收进美食专区。完成状态和关联资料保留。`}
        actions={
          <>
            <Button variant="outline" onClick={() => setSwap(undefined)}>取消</Button>
            <Button onClick={() => void doSwap()}>改去这家</Button>
          </>
        }
      />
    </>
  );
}
