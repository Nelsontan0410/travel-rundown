// 逐行解析固定格式的行程 md（PRD「导入逻辑」）。不引入 md 语法树。
// 单个行程项出错不会让整份解析失败，只记警告。
import type { BookingStatus, FlightInfo, ItemType, LodgingInfo, MealKind, Place, SourceRange, TransitInfo } from '../domain/types';
import { deviceTz, isValidTz, addDays, findDates, parseDateAny, parseMoney } from '../domain/format';
import { migrateItemV2 } from '../domain/migrate';
import { makeItemKey } from '../domain/itemKey';
import { canonField, typeOf } from './mapping';

export interface ParseWarning {
  line?: number;
  message: string;
}

export interface ItemDraft {
  key: string;
  order: number;
  type: ItemType;
  title: string;
  start?: string;
  end?: string;
  endDayOffset?: number;
  place?: Place;
  toPlace?: Place;
  navUrl?: string;
  bookingRef?: string;
  bookingStatus?: BookingStatus;
  note?: string;
  meta?: Record<string, string>;
  src?: SourceRange;
  alt?: string;
  fixed?: boolean;
  timeNote?: string;
  flight?: FlightInfo;
  lodging?: LodgingInfo;
  transit?: TransitInfo;
  meal?: MealKind;
  mustDo?: string[];
}

export interface DayDraft {
  index: number;
  date: string;
  tz: string;
  city: string;
  title?: string;
  note?: string;
  items: ItemDraft[];
}

export interface TripDraft {
  title: string;
  startDate: string;
  endDate: string;
  homeTz: string;
  destination?: string;
  budget?: number; // 分
  participants?: number;
}

export type ImportFormat = 'md' | 'text' | 'json' | 'csv';

/** 认不出的字段：原样保留（放进行程项的「其他信息」），并在预览里列出来，可以改映射 */
export interface UnmappedField {
  id: string;
  level: 'trip' | 'day' | 'item';
  dayIdx?: number;
  itemIdx?: number;
  field: string;
  value: string;
  line?: number;
}

/** 低可信字段：需要用户在预览里确认或修正 */
export type MappingFlag =
  | { id: string; kind: 'type'; dayIdx: number; itemIdx: number; raw: string; line?: number }
  | { id: string; kind: 'date'; dayIdx: number; raw: string; line?: number }
  | { id: string; kind: 'ambiguous-date'; dayIdx: number; raw: string; iso: string; alt: string }
  | { id: string; kind: 'title'; raw: string };

export interface MappingReport {
  format: ImportFormat;
  unmapped: UnmappedField[];
  flags: MappingFlag[];
  /** 输入里有、但没能变成任何行程项的内容（例如 CSV 里缺标题的行），原样列出 */
  dropped: { where: string; raw: string; reason: string }[];
}

export interface ParseResult {
  trip: TripDraft;
  days: DayDraft[];
  warnings: ParseWarning[];
  /** 致命问题：内容不是 App 的格式，不允许导入（预览页会给出修复提示词） */
  errors: string[];
  itemCount: number;
  mapping?: MappingReport;
}

const TYPES: ItemType[] = ['flight', 'lodging', 'spot', 'transit', 'meal', 'note'];
/** 中文类型名也认（AI 偶尔会写中文） */
const TYPE_ALIAS: Record<string, { type: ItemType; meal?: MealKind }> = {
  机票: { type: 'flight' }, 航班: { type: 'flight' }, 飞机: { type: 'flight' },
  住宿: { type: 'lodging' }, 酒店: { type: 'lodging' }, hotel: { type: 'lodging' },
  景点: { type: 'spot' }, 活动: { type: 'spot' }, 购物: { type: 'spot' }, attraction: { type: 'spot' },
  交通: { type: 'transit' }, transport: { type: 'transit' },
  餐饮: { type: 'meal' }, 用餐: { type: 'meal' }, food: { type: 'meal' },
  早餐: { type: 'meal', meal: 'breakfast' }, 午餐: { type: 'meal', meal: 'lunch' },
  晚餐: { type: 'meal', meal: 'dinner' }, 小吃: { type: 'meal', meal: 'snack' }, 宵夜: { type: 'meal', meal: 'snack' },
  其他: { type: 'note' }, 备注: { type: 'note' }, 提醒: { type: 'note' },
};
const MEAL_WORDS: [RegExp, MealKind][] = [
  [/早餐|早饭|breakfast/i, 'breakfast'],
  [/午餐|午饭|lunch/i, 'lunch'],
  [/晚餐|晚饭|dinner/i, 'dinner'],
  [/小吃|宵夜|下午茶|甜品|snack/i, 'snack'],
];
const LIST_KEYS = ['必逛', '必玩', '必看', '必做', '必体验', '必吃', '必点', '亮点'];
const LIST_SPLIT = /\s*[；;、|｜]\s*|\s+\/\s+/;

function mealFrom(text: string): MealKind | undefined {
  return MEAL_WORDS.find(([re]) => re.test(text))?.[1];
}
const FIELD_RE = /^[-*]\s*([^:：]+?)\s*[:：]\s*(.*)$/;
const ITEM_RE = /^(?:[\[【]\s*([^\]】]*?)\s*[\]】])?\s*(?:(\d{1,2}:\d{2})(?:\s*[-–—~～]\s*(\d{1,2}:\d{2})\s*(\+\s*1)?)?)?\s*(.*)$/;

function pad(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

function validTime(t: string): boolean {
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function splitPipe(v: string): [string, string | undefined] {
  const parts = v.split(/\s*[|｜]\s*/);
  const a = (parts[0] ?? '').trim();
  const b = parts.slice(1).join(' ').trim();
  return [a, b || undefined];
}

const DAY_LINE_RE = /^(?:Day\s*\d+|第\s*\d+\s*天)\s*[|｜]/i;
const TYPED_ITEM_RE = /^[\[【]\s*([^\]】]+?)\s*[\]】]/;
const TOD_RE = /^(凌晨|早上|上午|中午|下午|傍晚|晚上|夜晚)\s*(.+)$/;

/**
 * 从 AI 聊天界面复制出来的文字经常丢掉行首的 # / ## / ###（渲染成了标题样式）。
 * 这里按内容补回来：行号保持不变，所以预览里的原文行号依然准确。
 */
function restoreMarkers(raw: string[]): string[] {
  const known = (t: string) => TYPES.includes(t.toLowerCase() as ItemType) || !!TYPE_ALIAS[t.toLowerCase()] || !!TYPE_ALIAS[t];
  let seenDay = false;
  let hasTitle = raw.some((l) => /^#\s/.test(l.trim()));
  return raw.map((l) => {
    let t = l.trim().replace(/^>\s*/, '');
    if (!t || /^```/.test(t)) return l;
    if (!/^#/.test(t)) t = t.replace(/\*\*/g, '');
    if (/^#/.test(t)) {
      if (/^#{1,6}\s*Day\s*\d+\s*[|｜]/i.test(t)) seenDay = true;
      return t;
    }
    if (DAY_LINE_RE.test(t)) {
      seenDay = true;
      return `## ${t}`;
    }
    if (/^[-*•·]/.test(l.trim()) || /^\s/.test(l)) return l; // 字段、子列表
    const m = t.match(TYPED_ITEM_RE);
    if (m && known(m[1].trim())) return `### ${t}`;
    if (!seenDay && !hasTitle && !/^[-*•·]/.test(t) && !/[:：]\s*\S/.test(t.slice(0, 12))) {
      hasTitle = true;
      return `# ${t}`;
    }
    return l;
  });
}

export function parseMd(input: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const unmapped: UnmappedField[] = [];
  const flags: MappingFlag[] = [];
  const lines = restoreMarkers(input.replace(/\r\n?/g, '\n').split('\n'));

  const trip: TripDraft = { title: '', startDate: '', endDate: '', homeTz: '' };
  let tripTzLine: number | undefined;
  let rawTripTz = '';
  const days: DayDraft[] = [];
  let curDay: DayDraft | null = null;
  let curDayLine = 0;
  let rawDayTz = '';
  let curItem: (ItemDraft & { _line: number }) | null = null;
  let untyped = 0;
  const pendingDayTz: { day: DayDraft; raw: string; line: number }[] = [];
  let listOpen = false; // 「- 必逛:」后面跟着的子列表

  const finishItem = () => {
    curItem = null;
    listOpen = false;
  };

  lines.forEach((rawLine, i) => {
    const ln = i + 1;
    const line = rawLine.trim();
    if (!line || /^```/.test(line)) return;

    // 必逛 / 必吃 子列表：缩进的「- xxx」，或不含冒号的「- xxx」
    if (listOpen && curItem) {
      const sub = rawLine.match(/^\s+[-*•·]\s*(.+)$/) ?? (FIELD_RE.test(line) ? null : line.match(/^[-*•·]\s*(.+)$/));
      const nested = /^\s+[-*•·]/.test(rawLine);
      if (sub && (nested || !FIELD_RE.test(line))) {
        const it = curItem as ItemDraft;
        it.mustDo = [...(it.mustDo ?? []), sub[1].trim()];
        return;
      }
      listOpen = false;
    }

    if (/^#\s/.test(line) || line === '#') {
      finishItem();
      if (!trip.title) trip.title = line.replace(/^#\s*/, '').trim();
      return;
    }

    if (/^##(?!#)/.test(line)) {
      finishItem();
      const segs = line.replace(/^##\s*/, '').split(/\s*[|｜]\s*/).map((s) => s.trim());
      const idxMatch = segs[0]?.match(/\d+/);
      const index = idxMatch ? Number(idxMatch[0]) : days.length + 1;
      const date = parseDateAny(segs[1] ?? '');
      curDay = {
        index,
        date,
        tz: '',
        city: segs[2] ?? '',
        title: segs[4] || undefined,
        items: [],
      };
      if (!date) warnings.push({ line: ln, message: `第 ${ln} 行：Day ${index} 的日期无法识别` });
      rawDayTz = segs[3] ?? '';
      pendingDayTz.push({ day: curDay, raw: rawDayTz, line: ln });
      curDayLine = ln;
      days.push(curDay);
      return;
    }

    if (/^###/.test(line)) {
      finishItem();
      if (!curDay) {
        warnings.push({ line: ln, message: `第 ${ln} 行：行程项不在任何一天下面，已忽略` });
        return;
      }
      const m = line.replace(/^###\s*/, '').match(ITEM_RE);
      const rawType = (m?.[1] ?? '').trim().toLowerCase();
      let type: ItemType = 'note';
      let mealKind: MealKind | undefined;
      const alias = TYPE_ALIAS[rawType] ?? TYPE_ALIAS[(m?.[1] ?? '').trim()];
      const loose = rawType ? typeOf(rawType) : undefined;
      if (TYPES.includes(rawType as ItemType)) type = rawType as ItemType;
      else if (alias) {
        type = alias.type;
        mealKind = alias.meal;
      } else if (loose) {
        type = loose as ItemType;
        mealKind = mealFrom(rawType);
      } else {
        untyped++;
        flags.push({ id: `type-${ln}`, kind: 'type', dayIdx: days.length - 1, itemIdx: curDay.items.length, raw: rawType, line: ln });
        warnings.push({
          line: ln,
          message: rawType ? `第 ${ln} 行：不认识的类型「${rawType}」，已当作 note` : `第 ${ln} 行：缺少类型，已当作 note`,
        });
      }
      let start = m?.[2];
      let end = m?.[3];
      if (start && !validTime(start)) {
        warnings.push({ line: ln, message: `第 ${ln} 行：开始时间无法识别` });
        start = undefined;
        end = undefined;
      }
      if (end && !validTime(end)) {
        warnings.push({ line: ln, message: `第 ${ln} 行：结束时间无法识别` });
        end = undefined;
      }
      let title = (m?.[5] ?? '').trim();
      let timeNote: string | undefined;
      if (!start) {
        const tod = title.match(TOD_RE);
        if (tod) {
          timeNote = tod[1];
          title = tod[2].trim();
        }
      }
      if (!title) {
        warnings.push({ line: ln, message: `第 ${ln} 行：行程项缺少标题` });
        title = '未命名';
      }
      curItem = {
        key: '',
        order: curDay.items.length,
        type,
        title,
        start: start ? pad(start) : undefined,
        end: end ? pad(end) : undefined,
        endDayOffset: end && m?.[4] ? 1 : undefined,
        ...(mealKind ? { meal: mealKind } : {}),
        ...(timeNote ? { timeNote } : {}),
        _line: ln,
      };
      curDay.items.push(curItem);
      return;
    }

    const f = line.match(FIELD_RE);
    if (!f) return; // 其他文字忽略
    const rawKey = f[1].trim();
    const scope = curItem ? 'item' : curDay ? 'day' : 'trip';
    const canon = canonField(rawKey, scope);
    // 统一字段名：各种写法（Location / Place / 地点…）都落到同一个中文字段上；必逛类保留原名
    const key = LIST_KEYS.includes(rawKey) ? rawKey : canon === '必逛' ? '必逛' : (canon ?? rawKey);
    const value = f[2].trim();
    if (curItem && (LIST_KEYS.includes(key) || canon === '必逛')) {
      const it = curItem as ItemDraft;
      const list = value.split(LIST_SPLIT).map((x) => x.trim()).filter(Boolean);
      if (list.length) it.mustDo = [...(it.mustDo ?? []), ...list];
      listOpen = true;
      return;
    }
    if (!value) return;

    if (curItem) {
      const it = curItem as ItemDraft;
      switch (key) {
        case '航班号':
        case '航班':
          it.flight = { ...it.flight, number: value };
          break;
        case '航空公司':
          it.flight = { ...it.flight, airline: value };
          break;
        case '航站楼':
          it.flight = { ...it.flight, terminal: value };
          break;
        case '座位':
          it.flight = { ...it.flight, seat: value };
          break;
        case '入住日期':
        case '退房日期': {
          const d = parseDateAny(value);
          if (!d) {
            warnings.push({ line: ln, message: `第 ${ln} 行：${key}无法识别，请写成 DD-MM-YYYY` });
            break;
          }
          it.lodging = { ...it.lodging, [key === '入住日期' ? 'checkIn' : 'checkOut']: d };
          break;
        }
        case '房型':
          it.lodging = { ...it.lodging, roomType: value };
          break;
        case '方式':
        case '交通方式':
          it.transit = { ...it.transit, mode: value };
          break;
        case '线路':
          it.transit = { ...it.transit, line: value };
          break;
        case '餐别': {
          const mk = mealFrom(value);
          if (mk) it.meal = mk;
          else warnings.push({ line: ln, message: `第 ${ln} 行：餐别只能是早餐、午餐、晚餐或小吃` });
          break;
        }
        case '地点': {
          const [name, localName] = splitPipe(value);
          it.place = { ...(it.place ?? { name: '' }), name: name || it.title, localName };
          break;
        }
        case '地址': {
          const [address, localAddress] = splitPipe(value);
          it.place = { ...(it.place ?? { name: '' }), address: address || undefined, localAddress };
          break;
        }
        case '终点': {
          const [name, localName] = splitPipe(value);
          it.toPlace = { name, localName };
          break;
        }
        case '导航':
          if (/^https:\/\/\S+$/i.test(value)) it.navUrl = value;
          else warnings.push({ line: ln, message: `第 ${ln} 行：导航链接不是 https 链接，已忽略` });
          break;
        case '订单':
          it.bookingRef = value;
          break;
        case '预订状态':
          if (value.includes('已确认')) it.bookingStatus = 'confirmed';
          else if (value.includes('待确认')) it.bookingStatus = 'pending';
          else warnings.push({ line: ln, message: `第 ${ln} 行：预订状态只能是「已确认」或「待确认」` });
          break;
        case '备注':
          it.note = value;
          break;
        case '备选':
          it.alt = value;
          break;
        case '固定':
          if (/^(是|true|yes|y)$/i.test(value)) it.fixed = true;
          else if (/^(否|false|no|n)$/i.test(value)) it.fixed = undefined;
          else warnings.push({ line: ln, message: `第 ${ln} 行：「固定」只能是「是」或「否」，已忽略` });
          break;
        case '时间说明':
          it.timeNote = value;
          break;
        case '时间':
        case '开始':
        case '结束': {
          const tm = value.match(/^(\d{1,2}:\d{2})(?:\s*[-–—~～至]\s*(\d{1,2}:\d{2}))?$/);
          if (tm && validTime(tm[1]) && (!tm[2] || validTime(tm[2]))) {
            if (key === '结束') it.end = pad(tm[1]);
            else {
              it.start = pad(tm[1]);
              if (tm[2]) it.end = pad(tm[2]);
            }
          } else if (key === '时间') it.timeNote = value;
          else {
            it.meta = { ...(it.meta ?? {}), [rawKey]: value };
            unmapped.push({ id: `u-${ln}`, level: 'item', dayIdx: days.length - 1, itemIdx: curDay!.items.length - 1, field: rawKey, value, line: ln });
          }
          break;
        }
        case '当地名':
          it.place = { ...(it.place ?? { name: it.title }), localName: value };
          break;
        case '当地地址':
          it.place = { ...(it.place ?? { name: it.title }), localAddress: value };
          break;
        case '终点当地名':
          it.toPlace = { ...(it.toPlace ?? { name: value }), localName: value };
          break;
        case '标题':
          if (it.title === '未命名') it.title = value;
          else {
            it.meta = { ...(it.meta ?? {}), [rawKey]: value };
            unmapped.push({ id: `u-${ln}`, level: 'item', dayIdx: days.length - 1, itemIdx: curDay!.items.length - 1, field: rawKey, value, line: ln });
          }
          break;
        default:
          it.meta = { ...(it.meta ?? {}), [rawKey]: value };
          unmapped.push({ id: `u-${ln}`, level: 'item', dayIdx: days.length - 1, itemIdx: curDay!.items.length - 1, field: rawKey, value, line: ln });
      }
      return;
    }

    if (curDay) {
      const d = curDay as DayDraft;
      if (key === '备注') d.note = value;
      else if (key === '当天主题' && !d.title) d.title = value;
      else if (key === '城市' && !d.city) d.city = value;
      else if (key === '时区' && !rawDayTz) {
        rawDayTz = value;
        const pend = pendingDayTz[pendingDayTz.length - 1];
        if (pend && pend.day === d) pend.raw = value;
      } else if (key === '日期' && !d.date) d.date = parseDateAny(value);
      else {
        // 认不出的当天字段放进当天备注，不丢
        d.note = d.note ? `${d.note}；${rawKey}：${value}` : `${rawKey}：${value}`;
        unmapped.push({ id: `u-${ln}`, level: 'day', dayIdx: days.length - 1, field: rawKey, value, line: ln });
      }
      return;
    }

    // Trip 基本信息
    if (key === '日期') {
      const ds = findDates(value);
      if (ds[0]) trip.startDate = ds[0];
      trip.endDate = ds[1] ?? ds[0] ?? '';
      if (!ds.length) warnings.push({ line: ln, message: `第 ${ln} 行：行程日期无法识别，请写成 DD-MM-YYYY ~ DD-MM-YYYY` });
    } else if (key === '预算') {
      const v = parseMoney(value);
      if (v === null) warnings.push({ line: ln, message: `第 ${ln} 行：预算只能写数字（单位 MYR）` });
      else trip.budget = v;
    } else if (key === '出发地时区') {
      rawTripTz = value;
      tripTzLine = ln;
    } else if (key === '目的地') {
      trip.destination = value;
    } else if (key === '旅程标题') {
      if (!trip.title) trip.title = value;
    } else if (key === '出发日期') {
      const d = parseDateAny(value);
      if (d) trip.startDate = d;
    } else if (key === '结束日期') {
      const d = parseDateAny(value);
      if (d) trip.endDate = d;
    } else if (key === '人数') {
      const n = Number(value.replace(/[^\d]/g, ''));
      if (Number.isInteger(n) && n > 0 && n < 1000) trip.participants = n;
      else warnings.push({ line: ln, message: `第 ${ln} 行：人数只能写正整数` });
    } else {
      unmapped.push({ id: `u-${ln}`, level: 'trip', field: rawKey, value, line: ln });
    }
  });
  void curDayLine;
  void rawDayTz;

  // 行程项的原文行号：从自己的 ### 行，到下一个标题行的前一个非空行
  const headingLines: number[] = [];
  lines.forEach((l, i) => {
    if (/^#/.test(l.trim())) headingLines.push(i + 1);
  });
  for (const d of days) {
    for (const it of d.items) {
      const from = (it as ItemDraft & { _line: number })._line;
      const nextHead = headingLines.find((h) => h > from) ?? lines.length + 1;
      let to = nextHead - 1;
      while (to > from && !lines[to - 1].trim()) to--;
      it.src = { from, to };
    }
  }

  // 出发地时区
  if (rawTripTz && isValidTz(rawTripTz)) trip.homeTz = rawTripTz;
  else {
    trip.homeTz = deviceTz();
    warnings.push({
      line: tripTzLine,
      message: rawTripTz ? `出发地时区「${rawTripTz}」无法识别，已改用本机时区` : '缺少出发地时区，已改用本机时区',
    });
  }

  if (!trip.title) {
    trip.title = '未命名旅程';
    warnings.push({ message: '缺少行程标题（# 开头的一行）' });
    flags.push({ id: 'title', kind: 'title', raw: '' });
  }
  // 标题就是目的地，例如「北海道，日本」；没写「目的地」时取最后一段当国家/地区
  if (!trip.destination) {
    const segs = trip.title.split(/\s*[，,]\s*/).filter(Boolean);
    if (segs.length > 1) trip.destination = segs[segs.length - 1];
  }

  // Day 时区：缺失时沿用出发地时区并记警告
  for (const p of pendingDayTz) {
    if (p.raw && isValidTz(p.raw)) p.day.tz = p.raw;
    else {
      p.day.tz = trip.homeTz;
      warnings.push({
        line: p.line,
        message: p.raw
          ? `第 ${p.line} 行：Day ${p.day.index} 的时区「${p.raw}」无法识别，已沿用出发地时区`
          : `第 ${p.line} 行：Day ${p.day.index} 缺少时区，已沿用出发地时区`,
      });
    }
  }

  // 日期补齐
  if (!trip.startDate) {
    const ds = days.map((d) => d.date).filter(Boolean).sort();
    if (ds.length) {
      trip.startDate = ds[0];
      trip.endDate = ds[ds.length - 1];
    }
    warnings.push({ message: '缺少行程日期，已按每天的日期推算' });
  }
  for (const d of days) {
    if (!d.date && trip.startDate) d.date = addDays(trip.startDate, d.index - 1);
  }
  if (!trip.startDate && days.length) {
    trip.startDate = days[0].date;
    trip.endDate = days[days.length - 1].date;
  }
  if (trip.endDate && trip.startDate && trip.endDate < trip.startDate) trip.endDate = trip.startDate;

  // 默认地点、key
  const used = new Set<string>();
  let itemCount = 0;
  for (const d of days) {
    for (const it of d.items) {
      const draft = it as ItemDraft & { _line?: number };
      delete draft._line;
      if (it.place && !it.place.name) it.place.name = it.title;
      if (!it.place && (it.type === 'spot' || it.type === 'lodging')) it.place = { name: it.title };
      if (it.toPlace && it.type !== 'flight' && it.type !== 'transit') {
        it.toPlace = undefined;
      }
      // 旧格式写在自定义字段里的航班号、退房日期等，搬到专属字段
      Object.assign(it, migrateItemV2(it));
      if (it.type !== 'flight') delete it.flight;
      if (it.type !== 'lodging') delete it.lodging;
      if (it.type !== 'transit') delete it.transit;
      if (it.type === 'lodging') it.lodging = { checkIn: d.date, ...it.lodging };
      if (it.type === 'meal' && !it.meal) {
        it.meal = mealFrom(it.title) ?? (it.start ? (it.start < '10:30' ? 'breakfast' : it.start < '15:00' ? 'lunch' : it.start >= '17:00' ? 'dinner' : 'snack') : undefined);
      }
      if (it.type !== 'meal') delete it.meal;
      if (it.mustDo && it.type !== 'spot' && it.type !== 'meal') {
        it.meta = { ...(it.meta ?? {}), 要点: it.mustDo.join('；') };
        delete it.mustDo;
      }
      it.key = makeItemKey(d.date, it.type, it.title, used);
      itemCount++;
    }
  }

  days.forEach((d, i) => {
    if (!d.date) flags.push({ id: `date-${i}`, kind: 'date', dayIdx: i, raw: '' });
  });
  const errors = computeErrors(trip, days, untyped, itemCount);
  return { trip, days, warnings, errors, itemCount, mapping: { format: 'md', unmapped, flags, dropped: [] } };
}

/** 致命问题（会阻止导入）。导入预览里改了日期、类型之后会重新计算 */
export function computeErrors(trip: TripDraft, days: DayDraft[], untyped: number, itemCount: number): string[] {
  const errors: string[] = [];
  if (!days.length) errors.push('没有识别到任何一天（需要「Day 1 | DD-MM-YYYY | 城市 | 时区」这样的行；如果是从 AI 聊天里复制的，可能丢了标题符号，请让 AI 放进代码块再复制）');
  else if (!trip.startDate) errors.push('没有识别到行程日期');
  else {
    const noDate = days.filter((d) => !d.date).map((d) => d.index);
    if (noDate.length) errors.push(`Day ${noDate.join('、')} 没有日期`);
  }
  if (itemCount > 0 && untyped === itemCount) errors.push('行程项都没有类型标记（需要「[flight] 08:30 标题」这样的写法）');
  return errors;
}

/** 按日期、类型、标题重新生成全部 key（导入预览里修正了日期或类型之后调用） */
export function rekey(days: DayDraft[]): void {
  const used = new Set<string>();
  for (const d of days) for (const it of d.items) it.key = makeItemKey(d.date, it.type, it.title, used);
}
