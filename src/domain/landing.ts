// 旅程介绍页（Landing）：只从已导入的行程里整理内容，不编造营业时间、价格、评价或预订状态。
// 照片也一样：认不出对应地点或菜式就不配图，不拿别处的照片凑数。
import type { Day, Item } from './types';
import { matchMedia, mediaById, type LandingMedia } from './landingMedia';

export interface LandingHighlight {
  itemId: string;
  title: string;
  dayIndex: number;
  place?: string;
  /** 必逛 / 必体验里的前几项 */
  scenes: string[];
  note?: string;
  media?: LandingMedia;
}

export interface LandingDay {
  dayId: string;
  index: number;
  date: string;
  city: string;
  title?: string;
  /** 当天主要景点，按顺序 */
  route: string[];
  line: string;
  lodging?: string;
  pace: string;
  media?: LandingMedia;
  items: { id: string; time?: string; title: string; type: Item['type'] }[];
}

export interface LandingFood {
  itemId: string;
  name: string;
  detail: string;
  venue?: string;
  dayIndex: number;
  media?: LandingMedia;
}

export interface LandingMoment {
  itemId: string;
  caption: string;
  place: string;
  dayIndex: number;
  media: LandingMedia;
}

export interface LandingBrief {
  label: string;
  value: string;
}

export interface LandingContent {
  title: string;
  place: string;
  country?: string;
  theme: string;
  intro: string[];
  stats: { days: number; cities: number; spots: number; meals: number };
  montage: LandingMedia[];
  highlights: LandingHighlight[];
  days: LandingDay[];
  food: LandingFood[];
  interlude?: { media: LandingMedia; line: string; dayIndex: number };
  moments: LandingMoment[];
  brief: LandingBrief[];
  closing?: LandingMedia;
}

const MOMENT_WORDS = ['夜景', '日落', '拍照', '雪景', '散步', '街景', '灯', '倒影', '全景', '湖景', '晨景', '漫步', '取景', '合影'];
const GENERIC_MEAL = /^(早餐|午餐|晚餐|小吃|酒店早餐|简单早餐)$/;
/** 寄存行李、退房、办手续这类不是「景点」的安排，不放进亮点和路线 */
const LOGISTICS = /行李|退房|办理手续|寄存|整理|休息|伴手礼|采购|机场/;
/** 便利店、面包这类随手解决的一餐，不放进美食页 */
const PLAIN_FOOD = /便利店|面包|零食|简餐|饭团|三明治|自助/;

function textOf(it: Item, day?: Day): string {
  return [it.title, it.place?.name, it.place?.localName, it.toPlace?.name, ...(it.mustDo ?? []), day?.city].filter(Boolean).join(' ');
}

/** 先只看行程项自己的文字，认不出来再带上当天城市 */
function sceneOf(it: Item, day?: Day): LandingMedia | undefined {
  return matchMedia(textOf(it), 'scene') ?? matchMedia(textOf(it, day), 'scene');
}

function splitCities(city: string): string[] {
  return city.split(/\s*[・·、,，/／]\s*/).map((c) => c.trim()).filter(Boolean);
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}


export function buildLanding(trip: { title: string; destination?: string; startDate: string; endDate: string }, days: Day[], items: Item[]): LandingContent {
  const dayById = new Map(days.map((d) => [d.id, d]));
  const dayIdx = (it: Item) => dayById.get(it.dayId)?.index ?? 0;
  const segs = trip.title.split(/\s*[，,]\s*/).filter(Boolean);
  const country = trip.destination ?? (segs.length > 1 ? segs[segs.length - 1] : undefined);
  const place = segs.length > 1 ? segs.slice(0, -1).join('，') : trip.title;

  const spots = items.filter((i) => i.type === 'spot');
  const meals = items.filter((i) => i.type === 'meal');
  const cities = uniq(days.flatMap((d) => splitCities(d.city)));
  const spotNames = uniq(spots.map((s) => s.place?.name ?? s.title));

  // —— 亮点：必逛最多的景点，每天最多一个，图片尽量不重复
  const usedMedia = new Set<string>();
  const score = (s: Item) => (s.mustDo?.length ?? 0) + (sceneOf(s, dayById.get(s.dayId)) ? 2 : 0);
  const ranked = [...spots]
    .filter((s) => s.mustDo?.length && !LOGISTICS.test(s.title))
    .sort((a, b) => score(b) - score(a) || dayIdx(a) - dayIdx(b));
  const highlights: LandingHighlight[] = [];
  const hlDays = new Set<number>();
  for (const s of ranked) {
    if (highlights.length >= 5) break;
    if (hlDays.has(dayIdx(s))) continue;
    const mm = sceneOf(s, dayById.get(s.dayId));
    if (mm && usedMedia.has(mm.id)) continue;
    const media = mm;
    if (media) usedMedia.add(media.id);
    hlDays.add(dayIdx(s));
    highlights.push({
      itemId: s.id,
      title: s.title,
      dayIndex: dayIdx(s),
      place: s.place?.localName && s.place.localName !== s.title ? s.place.localName : undefined,
      scenes: s.mustDo!.slice(0, 4),
      note: s.note,
      media,
    });
  }
  highlights.sort((a, b) => a.dayIndex - b.dayIndex);

  // —— 每天概览
  const outDays: LandingDay[] = days.map((d) => {
    const its = items.filter((x) => x.dayId === d.id);
    const ds = its.filter((x) => x.type === 'spot' && !LOGISTICS.test(x.title));
    const route = uniq(ds.map((x) => x.title)).slice(0, 4);
    const lodging = its.find((x) => x.type === 'lodging');
    const timed = its.map((x) => x.start).filter(Boolean).sort() as string[];
    const active = its.filter((x) => x.type !== 'note').length;
    const pace = [timed[0] ? `${timed[0]} 开始` : '', `${active} 项安排`].filter(Boolean).join('，');
    const mm = matchMedia([d.title, ...ds.map((x) => textOf(x))].join(' '), 'scene') ?? matchMedia(d.city, 'scene');
    const media = mm;
    const firstNoted = ds.find((x) => x.mustDo?.length);
    const line = d.note
      ?? (firstNoted ? `${firstNoted.title}：${firstNoted.mustDo!.slice(0, 3).join('、')}` : route.length ? route.join('，') : '移动与休整的一天');
    return {
      dayId: d.id,
      index: d.index,
      date: d.date,
      city: d.city,
      title: d.title,
      route,
      line,
      lodging: lodging ? lodging.place?.name ?? lodging.title : undefined,
      pace,
      media,
      items: its.filter((x) => x.type !== 'note').map((x) => ({ id: x.id, time: x.start ?? x.timeNote, title: x.title, type: x.type })),
    };
  });

  // —— 美食：写了必吃（且不是便利店这类）或能认出菜系的餐饮，按有特色程度挑 6 样，再按日期排
  const cands = meals
    .map((it) => {
      const dishes = (it.mustDo ?? []).filter((d) => !PLAIN_FOOD.test(d));
      const fm = matchMedia(textOf(it), 'food');
      const venue = it.place?.name && !/机场|空港|站$|駅$/.test(it.place.name) ? it.place.name : undefined;
      if (!dishes.length && !(fm && venue)) return null;
      if (GENERIC_MEAL.test(it.title) && !dishes.length) return null;
      const sc = (fm ? 3 : 0) + (venue ? 1 : 0) + Math.min(dishes.length, 2) + (it.meal === 'dinner' ? 1 : 0);
      return { it, dishes, fm, venue, sc };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.sc - a.sc);
  const food: LandingFood[] = [];
  const foodUsed = new Set<string>();
  for (const c of cands) {
    if (food.length >= 6) break;
    const name = c.dishes[0] ?? c.it.title;
    if (food.some((f) => f.name === name)) continue;
    const media = c.fm && !foodUsed.has(c.fm.id) ? c.fm : undefined;
    if (media) foodUsed.add(media.id);
    const rest = c.dishes.slice(1, 4);
    const detail = rest.length ? `同一顿还有${rest.join('、')}` : c.it.note ?? c.it.title;
    const venue = c.venue && c.venue !== name && c.venue !== detail ? c.venue : undefined;
    food.push({ itemId: c.it.id, name, detail, venue, dayIndex: dayIdx(c.it), media });
  }
  food.sort((a, b) => a.dayIndex - b.dayIndex);

  // —— 值得留住的瞬间：必逛里提到夜景、拍照、雪景、散步……
  const moments: LandingMoment[] = [];
  for (const s of spots) {
    if (moments.length >= 6) break;
    const hit = (s.mustDo ?? []).find((t) => MOMENT_WORDS.some((w) => t.includes(w)));
    const media = sceneOf(s, dayById.get(s.dayId));
    if (!hit || !media) continue;
    if (moments.some((x) => x.place === (s.place?.name ?? s.title) || x.dayIndex === dayIdx(s) || x.media?.id === media.id)) continue;
    moments.push({
      itemId: s.id,
      caption: hit,
      place: s.place?.name ?? s.title,
      dayIndex: dayIdx(s),
      media,
    });
  }

  // —— 出发前速览
  const brief: LandingBrief[] = [];
  const modeCount = new Map<string, number>();
  for (const t of items.filter((i) => i.type === 'transit')) {
    for (const mode of (t.transit?.mode ?? '').split(/\s*[/／、]\s*/).filter(Boolean)) modeCount.set(mode, (modeCount.get(mode) ?? 0) + 1);
  }
  const modes = [...modeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  if (modes.length) brief.push({ label: '怎么移动', value: modes.join('、') });
  const flights = items.filter((i) => i.type === 'flight');
  if (flights.length) brief.push({ label: '航班', value: `${flights.length} 段：${flights.map((f) => f.title).join('；')}` });
  const lodgings = uniq(items.filter((i) => i.type === 'lodging').map((l) => dayById.get(l.dayId)?.city.split(/[・·]/).pop()?.trim() || l.title));
  if (lodgings.length) brief.push({ label: '住在哪里', value: lodgings.join(' → ') });
  const perDay = days.length ? Math.round(items.filter((i) => i.type !== 'note').length / days.length) : 0;
  const earliest = items.map((i) => i.start).filter(Boolean).sort()[0];
  if (perDay) brief.push({ label: '行程节奏', value: `平均每天 ${perDay} 项${earliest ? `，最早 ${earliest} 出门` : ''}` });
  const pending = items.filter((i) => i.bookingStatus === 'pending');
  if (pending.length) brief.push({ label: '还要确认', value: pending.slice(0, 5).map((p) => p.title).join('、') + (pending.length > 5 ? ` 等 ${pending.length} 项` : '') });

  // —— 首屏蒙太奇：亮点 + 美食，4–6 张不重复
  // —— 首屏蒙太奇：亮点 + 每天 + 第一道美食里认出来的照片，最多 6 张不重复（认不出就没有）
  const ids = (xs: (LandingMedia | undefined)[]) => xs.filter((m): m is LandingMedia => !!m).map((m) => m.id);
  const montage = uniq([...ids(highlights.map((h) => h.media)), ...ids(outDays.map((d) => d.media)), ...ids(food.slice(0, 1).map((f) => f.media))])
    .slice(0, 6)
    .map(mediaById);

  const hlMedia = new Set(ids(highlights.map((h) => h.media)));
  const mid = outDays.length / 2;
  const interDay = outDays
    .filter((d) => d.media)
    .sort((a, b) => Number(hlMedia.has(a.media!.id)) - Number(hlMedia.has(b.media!.id)) || Math.abs(a.index - mid) - Math.abs(b.index - mid))[0];
  const interlude = interDay ? { media: interDay.media!, line: interDay.title ?? interDay.city, dayIndex: interDay.index } : undefined;

  const top = highlights.slice(0, 3).map((h) => h.title);
  const first = splitCities(days[0]?.city ?? '')[0];
  const last = splitCities(days[days.length - 1]?.city ?? '').pop();
  const theme = top.length
    ? `${first && last && first !== last ? `从${first}到${last}，` : ''}${top.join('、')}`
    : cities.slice(0, 4).join('、');
  const intro = [
    `${days.length} 天，走过 ${cities.length} 座城市和地区：${cities.slice(0, 6).join('、')}${cities.length > 6 ? ' 等' : ''}。`,
    spotNames.length ? `${spotNames.length} 个景点${food.length ? `，${food.length} 样想吃的东西` : ''}，都已经排进每天的路线里。` : '',
  ].filter(Boolean);

  return {
    title: trip.title,
    place,
    country,
    theme,
    intro,
    stats: { days: days.length, cities: cities.length, spots: spotNames.length, meals: meals.length },
    montage,
    highlights,
    days: outDays,
    food,
    interlude,
    moments,
    brief,
    closing: [...highlights].reverse().find((h) => h.media && h.media.id !== montage[0]?.id)?.media ?? montage[montage.length - 1],
  };
}
