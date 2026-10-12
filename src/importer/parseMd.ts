// 逐行解析固定格式的行程 md（PRD「导入逻辑」）。不引入 md 语法树。
// 单个行程项出错不会让整份解析失败，只记警告。
import type { BookingStatus, ItemType, Place, SourceRange } from '../domain/types';
import { deviceTz, isIsoDate, isValidTz, addDays } from '../domain/format';
import { makeItemKey } from '../domain/itemKey';

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
}

export interface ParseResult {
  trip: TripDraft;
  days: DayDraft[];
  warnings: ParseWarning[];
  itemCount: number;
}

const TYPES: ItemType[] = ['flight', 'lodging', 'spot', 'transit', 'note'];
const FIELD_RE = /^[-*]\s*([^:：]+?)\s*[:：]\s*(.*)$/;
const ITEM_RE = /^(?:\[\s*([A-Za-z]*)\s*\])?\s*(?:(\d{1,2}:\d{2})(?:\s*[-–—~～]\s*(\d{1,2}:\d{2})\s*(\+\s*1)?)?)?\s*(.*)$/;
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;

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

export function parseMd(input: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const lines = input.replace(/\r\n?/g, '\n').split('\n');

  const trip: TripDraft = { title: '', startDate: '', endDate: '', homeTz: '' };
  let tripTzLine: number | undefined;
  let rawTripTz = '';
  const days: DayDraft[] = [];
  let curDay: DayDraft | null = null;
  let curDayLine = 0;
  let rawDayTz = '';
  let curItem: (ItemDraft & { _line: number }) | null = null;
  const pendingDayTz: { day: DayDraft; raw: string; line: number }[] = [];

  const finishItem = () => {
    curItem = null;
  };

  lines.forEach((rawLine, i) => {
    const ln = i + 1;
    const line = rawLine.trim();
    if (!line || /^```/.test(line)) return;

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
      const date = segs[1] ?? '';
      curDay = {
        index,
        date: isIsoDate(date) ? date : '',
        tz: '',
        city: segs[2] ?? '',
        title: segs[4] || undefined,
        items: [],
      };
      if (!isIsoDate(date)) warnings.push({ line: ln, message: `第 ${ln} 行：Day ${index} 的日期无法识别` });
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
      const rawType = (m?.[1] ?? '').toLowerCase();
      let type: ItemType = 'note';
      if (TYPES.includes(rawType as ItemType)) type = rawType as ItemType;
      else
        warnings.push({
          line: ln,
          message: rawType ? `第 ${ln} 行：不认识的类型「${rawType}」，已当作 note` : `第 ${ln} 行：缺少类型，已当作 note`,
        });
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
        _line: ln,
      };
      curDay.items.push(curItem);
      return;
    }

    const f = line.match(FIELD_RE);
    if (!f) return; // 其他文字忽略
    const key = f[1].trim();
    const value = f[2].trim();
    if (!value) return;

    if (curItem) {
      const it = curItem as ItemDraft;
      switch (key) {
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
        default:
          it.meta = { ...(it.meta ?? {}), [key]: value };
      }
      return;
    }

    if (curDay) {
      if (key === '备注') curDay.note = value;
      return;
    }

    // Trip 基本信息
    if (key === '日期') {
      const ds = value.match(DATE_RE) ?? [];
      if (ds[0] && isIsoDate(ds[0])) trip.startDate = ds[0];
      if (ds[1] && isIsoDate(ds[1])) trip.endDate = ds[1];
      else if (ds[0]) trip.endDate = ds[0];
    } else if (key === '出发地时区') {
      rawTripTz = value;
      tripTzLine = ln;
    } else if (key === '目的地') {
      trip.destination = value;
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
      it.key = makeItemKey(d.date, it.type, it.title, used);
      itemCount++;
    }
  }

  return { trip, days, warnings, itemCount };
}
