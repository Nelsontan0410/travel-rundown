// JSON / CSV 导入（Layer 1 精准识别 + Layer 2 规则匹配）。
// 做法：先把 JSON / CSV 按统一字段整理成 App 的标准行程文本，再交给同一个解析器（parseMd）。
// 这样三种格式落到同一套字段、同一套类型规则和同一套错误检查上，不会各自走样。
// 原始输入照样保存在 Trip.sourceMd（重新导入、修复提示词都用它）。
import { parseDateAny } from '../domain/format';
import { canonField, normKey, type Canon } from './mapping';
import { parseMd, type ImportFormat, type MappingFlag, type MappingReport, type ParseResult } from './parseMd';

export const JSON_SCHEMA_VERSION = 1;

export interface ParsedImport {
  result: ParseResult;
  /** 交给解析器的标准文本（JSON / CSV 由它生成；MD / 文字就是原文） */
  normalized: string;
  format: ImportFormat;
}

// ———————— 格式判断 ————————

export function detectFormat(text: string, fileName?: string): ImportFormat {
  const name = (fileName ?? '').toLowerCase();
  const t = text.replace(/^﻿/, '').trimStart();
  if (name.endsWith('.json') || /^[[{]/.test(t)) return 'json';
  if (name.endsWith('.csv') || name.endsWith('.tsv')) return 'csv';
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const cols = splitCsvLine(first);
  if (cols.length >= 3 && cols.filter((c) => canonField(c)).length >= 2 && !/^#|^Day\s*\d/i.test(first)) return 'csv';
  return name.endsWith('.md') || name.endsWith('.markdown') ? 'md' : 'text';
}

/** 自动判断格式并解析 */
export function parseImport(text: string, fileName?: string): ParsedImport {
  const format = detectFormat(text, fileName);
  if (format === 'json') return parseJsonImport(text);
  if (format === 'csv') return parseCsvImport(text);
  const result = parseMd(text);
  if (result.mapping) result.mapping.format = format;
  return { result, normalized: text, format };
}

// ———————— 日期：只接受无歧义写法；有歧义的照「日-月-年」理解并标出来让用户确认 ————————

interface DateRead {
  iso: string;
  /** 两种理解都成立时，另一种理解 */
  alt?: string;
  note?: string;
}

export function readDate(raw: unknown): DateRead {
  const s = String(raw ?? '').trim();
  if (!s) return { iso: '' };
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) return { iso: parseDateAny(s) };
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const dmy = parseDateAny(s);
    if (a <= 12 && b <= 12 && a !== b) {
      const mdy = parseDateAny(`${m[2]}-${m[1]}-${m[3]}`);
      return { iso: dmy, alt: mdy };
    }
    if (!dmy && b > 12 && a <= 12) {
      // 只能是「月-日-年」
      return { iso: parseDateAny(`${m[2]}-${m[1]}-${m[3]}`), note: `「${s}」只能理解为月-日-年` };
    }
    return { iso: dmy };
  }
  return { iso: parseDateAny(s) };
}

const ddmmyyyy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

// ———————— 生成标准文本 ————————

const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const seg = (v: unknown) => clean(v).replace(/[|｜]/g, '／');

function scalar(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(scalar).filter(Boolean).join('；');
  if (typeof v === 'object') return clean(JSON.stringify(v));
  if (typeof v === 'boolean') return v ? '是' : '否';
  return clean(v);
}

interface ActivityOut {
  type: string;
  start: string;
  end: string;
  /** 结束时间在第二天 */
  plus1?: boolean;
  title: string;
  fields: [string, string][];
}

interface DayOut {
  index: number;
  date: DateRead;
  rawDate: string;
  city: string;
  tz: string;
  title: string;
  fields: [string, string][];
  activities: ActivityOut[];
}

interface TripOut {
  title: string;
  start: DateRead;
  end: DateRead;
  fields: [string, string][];
}

function emit(trip: TripOut, days: DayOut[]): { text: string; flags: MappingFlag[] } {
  const lines: string[] = [];
  const flags: MappingFlag[] = [];
  lines.push(`# ${seg(trip.title)}`);
  if (trip.start.iso) lines.push(`- 日期: ${ddmmyyyy(trip.start.iso)} ~ ${ddmmyyyy(trip.end.iso || trip.start.iso)}`);
  for (const [k, v] of trip.fields) if (v) lines.push(`- ${k}: ${v}`);
  days.forEach((d, i) => {
    lines.push('', `## Day ${d.index} | ${ddmmyyyy(d.date.iso)} | ${seg(d.city)} | ${seg(d.tz)} | ${seg(d.title)}`);
    if (d.date.alt) flags.push({ id: `amb-${i}`, kind: 'ambiguous-date', dayIdx: i, raw: d.rawDate, iso: d.date.iso, alt: d.date.alt });
    for (const [k, v] of d.fields) if (v) lines.push(`- ${k}: ${v}`);
    for (const a of d.activities) {
      const time = a.start ? ` ${a.start}${a.end ? `-${a.end}${a.plus1 ? ' +1' : ''}` : ''}` : '';
      lines.push(`### [${seg(a.type)}]${time} ${clean(a.title)}`.replace(/\s+$/, ''));
      for (const [k, v] of a.fields) if (v) lines.push(`- ${k}: ${v}`);
    }
  });
  return { text: lines.join('\n') + '\n', flags };
}

const HHMM = /^(\d{1,2}):(\d{2})$/;
function splitTime(v: string): [string, string] {
  const m = v.match(/^(\d{1,2}:\d{2})\s*[-–—~～至]\s*(\d{1,2}:\d{2})$/);
  if (m) return [m[1], m[2]];
  return HHMM.test(v) ? [v, ''] : ['', ''];
}

/** 把一条活动（JSON 对象或 CSV 行）按统一字段整理 */
function activityFrom(entries: [string, unknown][], warn: (msg: string) => void, path: string): ActivityOut {
  const a: ActivityOut = { type: '', start: '', end: '', title: '', fields: [] };
  for (const [k, v] of entries) {
    if (v == null || v === '') continue;
    const c = canonField(k, 'item');
    const val = scalar(v);
    if (['endnextday', 'overnight', 'nextday', '跨日'].includes(normKey(k))) {
      a.plus1 = v === true || /^(true|yes|1|是)$/i.test(val);
      continue;
    }
    // 嵌套对象：地点 / 终点 / 航班 / 住宿 / 交通
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const nk = normKey(k);
      if (c === '地点' || c === '终点') {
        const name = scalar(o.name ?? o.title ?? o['名称']);
        const local = scalar(o.localName ?? o.local ?? o['当地名']);
        a.fields.push([c, local ? `${name} | ${local}` : name]);
        if (c === '地点') {
          const addr = scalar(o.address ?? o['地址']);
          const laddr = scalar(o.localAddress ?? o['当地地址']);
          if (addr || laddr) a.fields.push(['地址', laddr ? `${addr} | ${laddr}` : addr]);
        }
        continue;
      }
      if (['flight', 'lodging', 'hotel', 'transit', 'transport'].includes(nk) || c === '航班号') {
        for (const [ik, iv] of Object.entries(o)) {
          const ic = canonField(ik, 'item') ?? canonField(nk + ik, 'item');
          if (ic === '入住日期' || ic === '退房日期') a.fields.push([ic, ddmmyyyy(readDate(iv).iso) || scalar(iv)]);
          else a.fields.push([ic ?? `${k}.${ik}`, scalar(iv)]);
        }
        continue;
      }
    }
    switch (c) {
      case '标题':
        a.title = val;
        break;
      case '类型':
        a.type = val;
        break;
      case '时间': {
        const [s1, e1] = splitTime(val);
        if (s1) [a.start, a.end] = [s1, e1];
        else a.fields.push(['时间说明', val]);
        break;
      }
      case '开始':
        if (HHMM.test(val)) a.start = val;
        else a.fields.push(['时间说明', val]);
        break;
      case '结束':
        if (HHMM.test(val)) a.end = val;
        else warn(`${path}：结束时间「${val}」无法识别`);
        break;
      case '入住日期':
      case '退房日期':
        a.fields.push([c, ddmmyyyy(readDate(v).iso) || val]);
        break;
      case '预订状态':
        a.fields.push([c, /^(confirmed|booked|done|ok|yes|已确认|已预订)$/i.test(val) ? '已确认' : /^(pending|tbc|tbd|unconfirmed|no|待确认|未预订)$/i.test(val) ? '待确认' : val]);
        break;
      case '必逛':
        a.fields.push(['必逛', Array.isArray(v) ? v.map(scalar).join('；') : val]);
        break;
      case undefined:
        a.fields.push([k, val]); // 认不出的字段原样带过去，解析器会放进「其他信息」并在预览列出
        break;
      default:
        a.fields.push([c, val]);
    }
  }
  if (!a.type) a.type = '';
  return a;
}

// ———————— JSON ————————

const DAY_KEYS = ['days', 'itinerary', 'schedule', 'plan', 'dailyplan', '行程', '每日行程', '日程'];
const ACT_KEYS = ['activities', 'items', 'events', 'schedule', 'plan', 'stops', 'agenda', '行程项', '安排', '活动'];

function findArray(o: Record<string, unknown>, keys: string[]): [string, unknown[]] | undefined {
  for (const [k, v] of Object.entries(o)) if (Array.isArray(v) && keys.includes(normKey(k))) return [k, v];
  return undefined;
}

export function parseJsonImport(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return failed('json', text, `JSON 格式有误，无法读取：${(e as Error).message}`);
  }
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const root = (Array.isArray(data) ? { days: data } : data) as Record<string, unknown>;
  if (!root || typeof root !== 'object') return failed('json', text, 'JSON 最外层应该是一个对象 { … }');

  const official = root.schemaVersion !== undefined;
  if (official && root.schemaVersion !== JSON_SCHEMA_VERSION) warn(`schemaVersion 是 ${String(root.schemaVersion)}，App 只认识版本 ${JSON_SCHEMA_VERSION}，已按通用规则读取`);

  const tObj = (root.trip && typeof root.trip === 'object' ? root.trip : root) as Record<string, unknown>;
  const trip: TripOut = { title: '', start: { iso: '' }, end: { iso: '' }, fields: [] };
  for (const [k, v] of Object.entries(tObj)) {
    if (v == null || typeof v === 'object') continue;
    const c = canonField(k, 'trip');
    const val = scalar(v);
    if (c === '旅程标题') trip.title = val;
    else if (c === '出发日期') trip.start = readDate(v);
    else if (c === '结束日期') trip.end = readDate(v);
    else if (c === '日期') {
      const [a, b] = val.split(/\s*[~～至]\s*|\s+-\s+|\s+to\s+/);
      trip.start = readDate(a);
      trip.end = readDate(b ?? a);
    } else if (c === '出发地时区' || c === '时区') trip.fields.push(['出发地时区', val]);
    else if (c === '预算') trip.fields.push(['预算', val]);
    else if (c === '人数') trip.fields.push(['人数', val]);
    else if (c === '目的地') trip.fields.push(['目的地', val]);
    else if (normKey(k) !== 'schemaversion' && tObj === root.trip) trip.fields.push([k, val]);
  }
  if (official && trip.start.iso && !/^\d{4}-\d{2}-\d{2}$/.test(String(tObj.startDate ?? ''))) warn('trip.startDate 建议写成 YYYY-MM-DD');

  // 每天：标准写法是 days[].activities[]；也接受一整串带日期的活动
  let dayList = findArray(root, DAY_KEYS)?.[1] ?? [];
  const looksFlat = dayList.length > 0 && dayList.every((d) => d && typeof d === 'object' && !findArray(d as Record<string, unknown>, ACT_KEYS));
  if (looksFlat) {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const a of dayList as Record<string, unknown>[]) {
      const dk = Object.keys(a).find((k) => canonField(k) === '日期' || canonField(k) === '第几天');
      const g = dk ? String(a[dk]) : '';
      groups.set(g, [...(groups.get(g) ?? []), a]);
    }
    dayList = [...groups.entries()].map(([g, acts]) => ({ date: g, activities: acts.map((a) => Object.fromEntries(Object.entries(a).filter(([k]) => !['日期', '第几天'].includes(canonField(k) ?? '')))) }));
  }

  const days: DayOut[] = (dayList as Record<string, unknown>[]).map((dObj, i) => {
    const d: DayOut = { index: i + 1, date: { iso: '' }, rawDate: '', city: '', tz: '', title: '', fields: [], activities: [] };
    const acts = findArray(dObj, ACT_KEYS);
    for (const [k, v] of Object.entries(dObj)) {
      if (acts && k === acts[0]) continue;
      if (v == null) continue;
      const c = canonField(k, 'day');
      const val = scalar(v);
      if (c === '日期') {
        d.rawDate = val;
        d.date = readDate(v);
        if (d.date.note) warn(`days[${i}].date：${d.date.note}`);
        if (val && !d.date.iso) warn(`days[${i}].date「${val}」无法识别`);
      } else if (c === '第几天') {
        const n = Number(val.replace(/[^\d]/g, ''));
        if (n > 0) d.index = n;
        else {
          // 「day」字段写的是日期
          const dr = readDate(v);
          if (dr.iso && !d.date.iso) [d.date, d.rawDate] = [dr, val];
        }
      } else if (c === '城市') d.city = val;
      else if (c === '时区') d.tz = val;
      else if (c === '当天主题') d.title = val;
      else if (c === '备注') d.fields.push(['备注', val]);
      else d.fields.push([k, val]);
    }
    for (const [j, a] of (acts?.[1] ?? []).entries()) {
      if (!a || typeof a !== 'object') {
        d.activities.push({ type: 'note', start: '', end: '', title: scalar(a), fields: [] });
        continue;
      }
      d.activities.push(activityFrom(Object.entries(a as Record<string, unknown>), warn, `days[${i}].activities[${j}]`));
    }
    return d;
  });
  if (!trip.title) trip.title = '';
  return finish('json', text, trip, days, warnings, []);
}

// ———————— CSV ————————

/** RFC 4180：支持 UTF-8 BOM、引号、引号里的逗号和换行；也接受 Tab 分隔 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function splitCsvLine(line: string): string[] {
  return parseCsv(line)[0] ?? [];
}

const TRIP_CANON: Canon[] = ['旅程标题', '出发日期', '结束日期', '出发地时区', '预算', '人数', '目的地'];
const DAY_CANON: Canon[] = ['日期', '第几天', '城市', '时区', '当天主题'];

export function parseCsvImport(text: string): ParsedImport {
  const rows = parseCsv(text);
  if (rows.length < 2) return failed('csv', text, 'CSV 至少要有一行表头和一行活动');
  const header = rows[0].map((h) => h.trim());
  const canon = header.map((h) => {
    const c = canonField(h, 'item');
    // 表格里的「标题 / 开始 / 结束」默认属于活动；旅程级字段要用 trip_title、trip_start 这类明确写法
    return c;
  });
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const dropped: MappingReport['dropped'] = [];
  const trip: TripOut = { title: '', start: { iso: '' }, end: { iso: '' }, fields: [] };
  const dayMap = new Map<string, DayOut>();
  const order: DayOut[] = [];

  rows.slice(1).forEach((r, ri) => {
    const lineNo = ri + 2;
    const get = (c: Canon) => {
      const i = canon.indexOf(c);
      return i >= 0 ? (r[i] ?? '').trim() : '';
    };
    // 旅程级：取第一处非空
    for (const c of TRIP_CANON) {
      const v = get(c);
      if (!v) continue;
      if (c === '旅程标题' && !trip.title) trip.title = v;
      else if (c === '出发日期' && !trip.start.iso) trip.start = readDate(v);
      else if (c === '结束日期' && !trip.end.iso) trip.end = readDate(v);
      else if (!['旅程标题', '出发日期', '结束日期'].includes(c) && !trip.fields.some(([k]) => k === c)) trip.fields.push([c, v]);
    }
    const rawDate = get('日期');
    const dayNo = get('第几天');
    const gk = rawDate || (dayNo ? `#${dayNo}` : '');
    if (!gk) {
      dropped.push({ where: `第 ${lineNo} 行`, raw: r.join(', '), reason: '没有日期，也没有第几天' });
      return;
    }
    let d = dayMap.get(gk);
    if (!d) {
      const dr = readDate(rawDate);
      if (rawDate && !dr.iso) warn(`第 ${lineNo} 行：日期「${rawDate}」无法识别`);
      if (dr.note) warn(`第 ${lineNo} 行：${dr.note}`);
      d = { index: Number(dayNo) || order.length + 1, date: dr, rawDate, city: '', tz: '', title: '', fields: [], activities: [] };
      dayMap.set(gk, d);
      order.push(d);
    }
    if (!d.city) d.city = get('城市');
    if (!d.tz) d.tz = get('时区');
    if (!d.title) d.title = get('当天主题');
    const entries: [string, unknown][] = [];
    header.forEach((h, i) => {
      const c = canon[i];
      if (c && (TRIP_CANON.includes(c) || DAY_CANON.includes(c))) return;
      entries.push([h, r[i] ?? '']);
    });
    const act = activityFrom(entries, warn, `第 ${lineNo} 行`);
    if (!act.title && !act.type) {
      if (entries.some(([, v]) => String(v).trim())) dropped.push({ where: `第 ${lineNo} 行`, raw: r.join(', '), reason: '没有活动标题和类型' });
      return;
    }
    d.activities.push(act);
  });
  // 没有「第几天」时按日期排序编号
  if (!canon.includes('第几天')) {
    order.sort((a, b) => (a.date.iso || '9').localeCompare(b.date.iso || '9'));
    order.forEach((d, i) => (d.index = i + 1));
  }
  return finish('csv', text, trip, order, warnings, dropped);
}

// ———————— 收尾 ————————

function finish(format: ImportFormat, raw: string, trip: TripOut, days: DayOut[], extraWarnings: string[], dropped: MappingReport['dropped']): ParsedImport {
  if (!trip.start.iso) {
    const ds = days.map((d) => d.date.iso).filter(Boolean).sort();
    if (ds.length) trip.start = { iso: ds[0] };
    if (ds.length) trip.end = { iso: ds[ds.length - 1] };
  }
  const { text, flags } = emit(trip, days);
  const result = parseMd(text);
  const rep = result.mapping!;
  rep.format = format;
  rep.flags.push(...flags);
  rep.dropped.push(...dropped);
  result.warnings.push(...extraWarnings.map((message) => ({ message })));
  // 生成文本的行号对用户没有意义，去掉
  result.warnings = result.warnings.map((w) => ({ message: w.message.replace(/^第 \d+ 行：/, '') }));
  for (const u of rep.unmapped) delete u.line;
  for (const f of rep.flags) if ('line' in f) delete f.line;
  void raw;
  return { result, normalized: text, format };
}

function failed(format: ImportFormat, raw: string, error: string): ParsedImport {
  const result = parseMd('');
  result.errors = [error];
  result.mapping = { format, unmapped: [], flags: [], dropped: [] };
  return { result, normalized: raw, format };
}
