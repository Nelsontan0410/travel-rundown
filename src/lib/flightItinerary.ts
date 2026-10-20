// 2026-10-21：行程单（Trip.com 等）按航段解析。
// 只在本机处理 PDF 提取出的文字：清洗 → 按「A - B」航段标题 / Departure 行切段 → 每段取起飞、到达、航班号，
// 机场名映射 IATA 与时区（只用内置表，找不到就留空，由用户核对时区）。结果仍是「候选」，保存后才更新倒数。
import type { TicketCandidate } from '../domain/flightTicket';

export interface AirportInfo { iata: string; tz: string; country?: string; zh: string }
export interface ItineraryCandidate extends TicketCandidate {
  role?: 'outbound' | 'return';
  flight?: string;
  from?: AirportInfo;
  to?: AirportInfo;
  /** 出发机场时区（找不到机场时为空） */
  tz?: string;
  /** 出发机场所在国家代码，仅限倒数支持的国家 */
  country?: string;
}
export interface ItinerarySegment {
  route?: string;
  departure?: { local: string; place: string; line: string; page: number };
  arrival?: { local: string; place: string };
  flight?: string;
}

const LABELS = 'Departure|Departs?|Arrival|Arrives?|Airline|Flight|Checked|Check-in|Baggage|Passenger|Booking';
/** 解析前清洗：统一空白、去掉标点前的空格、去掉粘在标签前的页码（如 "1Departure"）。 */
export function cleanTicketText(text: string): string {
  return text.normalize('NFKC')
    .replace(/[  -​　]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ +([,，])/g, '$1')
    // 换页处页码粘在标签前：行首（或空白后）1–3 位数字紧贴标签
    .replace(new RegExp(`(^|\\n|\\s)\\d{1,3}(?=(?:${LABELS})\\b)`, 'gi'), '$1')
    .trim();
}

const AIRPORTS: { re: RegExp; info: AirportInfo }[] = [
  { re: /kuala lumpur international|\bKLIA2?\b|\bKUL\b|吉隆坡国际|吉隆坡國際/i, info: { iata: 'KUL', tz: 'Asia/Kuala_Lumpur', country: 'MY', zh: '吉隆坡' } },
  { re: /nanning|wuxu|\bNNG\b|南宁|南寧|吴圩/i, info: { iata: 'NNG', tz: 'Asia/Shanghai', country: 'CN', zh: '南宁' } },
  { re: /changi|\bSIN\b|singapore|樟宜|新加坡/i, info: { iata: 'SIN', tz: 'Asia/Singapore', country: 'SG', zh: '新加坡' } },
  { re: /daxing|\bPKX\b|大兴|大興/i, info: { iata: 'PKX', tz: 'Asia/Shanghai', country: 'CN', zh: '北京大兴' } },
  { re: /beijing capital|\bPEK\b|首都国际|首都國際/i, info: { iata: 'PEK', tz: 'Asia/Shanghai', country: 'CN', zh: '北京首都' } },
  { re: /pudong|\bPVG\b|浦东|浦東/i, info: { iata: 'PVG', tz: 'Asia/Shanghai', country: 'CN', zh: '上海浦东' } },
  { re: /hongqiao|\bSHA\b|虹桥|虹橋/i, info: { iata: 'SHA', tz: 'Asia/Shanghai', country: 'CN', zh: '上海虹桥' } },
  { re: /baiyun|guangzhou|\bCAN\b|白云|白雲|广州|廣州/i, info: { iata: 'CAN', tz: 'Asia/Shanghai', country: 'CN', zh: '广州' } },
  { re: /bao'?an|shenzhen|\bSZX\b|宝安|寶安|深圳/i, info: { iata: 'SZX', tz: 'Asia/Shanghai', country: 'CN', zh: '深圳' } },
  { re: /chengdu|tianfu|shuangliu|\bTFU\b|\bCTU\b|成都/i, info: { iata: 'CTU', tz: 'Asia/Shanghai', country: 'CN', zh: '成都' } },
  { re: /kunming|changshui|\bKMG\b|昆明/i, info: { iata: 'KMG', tz: 'Asia/Shanghai', country: 'CN', zh: '昆明' } },
  { re: /hong kong|chek lap kok|\bHKG\b|香港/i, info: { iata: 'HKG', tz: 'Asia/Hong_Kong', zh: '香港' } },
  { re: /macau|macao|\bMFM\b|澳门|澳門/i, info: { iata: 'MFM', tz: 'Asia/Macau', zh: '澳门' } },
  { re: /taoyuan|\bTPE\b|桃园|桃園/i, info: { iata: 'TPE', tz: 'Asia/Taipei', zh: '台北桃园' } },
  { re: /suvarnabhumi|\bBKK\b|素万那普|素萬那普/i, info: { iata: 'BKK', tz: 'Asia/Bangkok', country: 'TH', zh: '曼谷素万那普' } },
  { re: /don mueang|\bDMK\b|廊曼/i, info: { iata: 'DMK', tz: 'Asia/Bangkok', country: 'TH', zh: '曼谷廊曼' } },
  { re: /phuket|\bHKT\b|普吉/i, info: { iata: 'HKT', tz: 'Asia/Bangkok', country: 'TH', zh: '普吉' } },
  { re: /narita|\bNRT\b|成田/i, info: { iata: 'NRT', tz: 'Asia/Tokyo', country: 'JP', zh: '东京成田' } },
  { re: /haneda|\bHND\b|羽田/i, info: { iata: 'HND', tz: 'Asia/Tokyo', country: 'JP', zh: '东京羽田' } },
  { re: /kansai|\bKIX\b|关西|關西/i, info: { iata: 'KIX', tz: 'Asia/Tokyo', country: 'JP', zh: '大阪关西' } },
  { re: /new chitose|\bCTS\b|新千岁|新千歲/i, info: { iata: 'CTS', tz: 'Asia/Tokyo', country: 'JP', zh: '札幌新千岁' } },
  { re: /incheon|\bICN\b|仁川/i, info: { iata: 'ICN', tz: 'Asia/Seoul', country: 'KR', zh: '首尔仁川' } },
  { re: /tan son nhat|\bSGN\b|新山一/i, info: { iata: 'SGN', tz: 'Asia/Ho_Chi_Minh', country: 'VN', zh: '胡志明市' } },
  { re: /noi bai|\bHAN\b|内排|內排/i, info: { iata: 'HAN', tz: 'Asia/Ho_Chi_Minh', country: 'VN', zh: '河内' } },
  { re: /soekarno|\bCGK\b|苏加诺|蘇加諾/i, info: { iata: 'CGK', tz: 'Asia/Jakarta', country: 'ID', zh: '雅加达' } },
  { re: /ngurah rai|\bDPS\b|denpasar|巴厘岛|峇里/i, info: { iata: 'DPS', tz: 'Asia/Makassar', country: 'ID', zh: '巴厘岛' } },
  { re: /penang|\bPEN\b|槟城|檳城/i, info: { iata: 'PEN', tz: 'Asia/Kuala_Lumpur', country: 'MY', zh: '槟城' } },
  { re: /kota kinabalu|\bBKI\b|亚庇|亞庇/i, info: { iata: 'BKI', tz: 'Asia/Kuala_Lumpur', country: 'MY', zh: '亚庇' } },
];
/** 机场文字 → IATA / 时区；只认内置表，认不出返回 undefined。 */
export function airportOf(text: string): AirportInfo | undefined {
  return AIRPORTS.find(a => a.re.test(text))?.info;
}

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_RES: { re: RegExp; kind: 'iso' | 'monthDay' | 'dayMonth' }[] = [
  { re: /(?<![\d:.])(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?!\d)/g, kind: 'iso' },
  { re: new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})(?!\\d)`, 'gi'), kind: 'monthDay' },
  { re: new RegExp(`(?<![\\d:.])(\\d{1,2})(?:st|nd|rd|th)?[\\s-]*(${MONTH})\\.?[\\s,-]*(20\\d{2})(?!\\d)`, 'gi'), kind: 'dayMonth' },
];
function validDate(year: number, month: number, day: number): string | undefined {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
/**
 * 从一段文字里取出第一个「日期 + 时间」。支持：
 * "13:05, November 26, 2026" · "November 26, 2026 1:05 PM" · "26 Nov 2026 13:05" · "2026-11-26 13:05" · "2026年11月26日 13:05"。
 * 纯数字的 10/01/2026 这类日/月顺序不明的日期不在这里处理（交给原有解析器标注待核对）。
 */
export function parseDateTime(text: string): { local: string; start: number; end: number } | undefined {
  const dates: { start: number; end: number; date: string }[] = [];
  for (const { re, kind } of DATE_RES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index!, end = start + m[0].length;
      if (dates.some(d => start < d.end && end > d.start)) continue;
      const date = kind === 'iso' ? validDate(+m[1], +m[2], +m[3])
        : kind === 'monthDay' ? validDate(+m[3], MONTHS.indexOf(m[1].slice(0,3).toLowerCase()) + 1, +m[2])
        : validDate(+m[3], MONTHS.indexOf(m[2].slice(0,3).toLowerCase()) + 1, +m[1]);
      if (date) dates.push({ start, end, date });
    }
  }
  if (!dates.length) return;
  dates.sort((a, b) => a.start - b.start);
  const date = dates[0];
  for (const t of text.matchAll(/(?<![\d:.+-])(\d{1,2})(?:[:.]|时|時)([0-5]\d)分?(?:\s*([AaPp])\.?\s?[Mm]\.?(?![A-Za-z]))?(?![\d:])/g)) {
    const start = t.index!, end = start + t[0].length;
    if (dates.some(d => start < d.end && end > d.start)) continue;
    if (/(?:UTC|GMT)\s*$/i.test(text.slice(Math.max(0, start - 6), start))) continue;
    let hour = +t[1];
    const before = text.slice(Math.max(0, start - 6), start);
    const meridian = t[3]?.toUpperCase() ?? (/下午|晚上/.test(before) ? 'P' : /上午|早上|凌晨/.test(before) ? 'A' : undefined);
    if (meridian) { if (hour < 1 || hour > 12) continue; hour = hour % 12 + (meridian === 'P' ? 12 : 0); }
    else if (hour > 23) continue;
    // 时间与日期须相邻（同一字段），避免把别处的时间拼过来
    const gap = end <= date.start ? date.start - end : start - date.end;
    if (gap > 40) continue;
    return { local: `${date.date}T${String(hour).padStart(2,'0')}:${t[2]}`, start: Math.min(start, date.start), end: Math.max(end, date.end) };
  }
}

const DEP = /^(?:Departure|Departs?|Depart(?:ing)?|Take[- ]?off|起飞|起飛|出发|出發)\b\s*[:：]?\s*/i;
const ARR = /^(?:Arrival|Arrives?|Arriving|Landing|抵达|抵達|到达|到達)\b\s*[:：]?\s*/i;
const AIRLINE = /^(?:Airline|Flight(?:\s*(?:No\.?|Number))?|Carrier|航班号?|航空公司)\s*[:：]?\s*/i;
const ROUTE = /^([A-Za-z一-鿿][A-Za-z一-鿿 .'()]{1,40}?)\s+(?:-|–|—|→|>|to)\s+([A-Za-z一-鿿][A-Za-z一-鿿 .'()]{1,40})$/;
const FLIGHT_NO = /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})[A-Z]?\b/g;
const LABEL_AT_START = new RegExp(`^(?:${LABELS})\\b`, 'i');

/** 一个字段（标签之后）若当行没有日期时间，就往下最多看 2 行。 */
function fieldValue(lines: { text: string }[], i: number, re: RegExp) {
  let value = lines[i].text.replace(re, '');
  for (let k = 1; k <= 2 && !parseDateTime(value) && i + k < lines.length; k++) {
    const next = lines[i + k].text;
    if (DEP.test(next) || ARR.test(next) || AIRLINE.test(next) || ROUTE.test(next)) break;
    value += ' ' + next;
  }
  return value;
}
function placeOf(value: string, dt: { start: number; end: number }) {
  return (value.slice(0, dt.start) + ' ' + value.slice(dt.end)).replace(/^[\s,，;；]+|[\s,，;；]+$/g, '').replace(/\s*,\s*,\s*/g, ', ').trim();
}

/** 按航段切分。pages：每页清洗后的文字（换页处的航段可以跨页）。 */
export function itinerarySegments(pages: string[]): ItinerarySegment[] {
  const lines = pages.flatMap((p, pi) => cleanTicketText(p).split('\n').map(text => ({ text: text.trim(), page: pi + 1 }))).filter(l => l.text);
  const segments: ItinerarySegment[] = [];
  let current: ItinerarySegment | undefined;
  const start = (route?: string) => { current = { route }; segments.push(current); return current; };
  lines.forEach((line, i) => {
    const t = line.text;
    if (!LABEL_AT_START.test(t) && ROUTE.test(t) && !parseDateTime(t)) { start(t.replace(/\s+(?:-|–|—|→|>|to)\s+/, ' - ')); return; }
    if (DEP.test(t)) {
      const value = fieldValue(lines, i, DEP);
      const dt = parseDateTime(value);
      if (!dt) return;
      const seg = current && !current.departure ? current : start();
      seg.departure = { local: dt.local, place: placeOf(value, dt), line: t, page: line.page };
      return;
    }
    if (ARR.test(t) && current?.departure && !current.arrival) {
      const value = fieldValue(lines, i, ARR);
      const dt = parseDateTime(value);
      if (dt) current.arrival = { local: dt.local, place: placeOf(value, dt) };
      return;
    }
    if (AIRLINE.test(t) && current?.departure && !current.flight) {
      const found = [...t.replace(AIRLINE, '').matchAll(FLIGHT_NO)].filter(m => /[A-Z]/.test(m[1]) && !/^T\d$/.test(m[0]));
      const m = found.at(-1);
      if (m) current.flight = `${m[1]}${m[2]}`;
    }
  });
  return segments.filter(s => s.departure);
}

/** 按日期排序后区分去程 / 回程：最早一段是去程；回程 = 回到出发地那一程的第一段（含转机）。 */
function roles(segs: (ItinerarySegment & { from?: AirportInfo; to?: AirportInfo })[]): ('outbound' | 'return' | undefined)[] {
  const out: ('outbound' | 'return' | undefined)[] = segs.map(() => undefined);
  if (!segs.length) return out;
  out[0] = 'outbound';
  if (segs.length === 1) return out;
  const home = segs[0].from?.iata;
  let back = home ? segs.findIndex((s, i) => i > 0 && s.to?.iata === home) : -1;
  if (back < 0) { if (segs.length === 2) out[1] = 'return'; return out; }
  // 往前追溯连续转机段（上一段到达 = 这一段出发，且间隔 24 小时内）
  while (back > 1) {
    const prev = segs[back - 1], cur = segs[back];
    const gap = Date.parse(cur.departure!.local + ':00Z') - Date.parse((prev.arrival?.local ?? prev.departure!.local) + ':00Z');
    if (prev.to?.iata && prev.to.iata === cur.from?.iata && gap >= 0 && gap <= 86400000) back--; else break;
  }
  out[back] = 'return';
  return out;
}

/** 行程单 → 起飞候选（带航班号、机场、时区）。认不出航段时返回空数组，由原解析器兜底。 */
export function parseItinerary(pages: string[]): ItineraryCandidate[] {
  const segs = itinerarySegments(pages)
    .map(s => ({ ...s, from: airportOf(s.departure!.place), to: s.arrival ? airportOf(s.arrival.place) : undefined }))
    .sort((a, b) => a.departure!.local.localeCompare(b.departure!.local));
  const seen = new Set<string>();
  const unique = segs.filter(s => { const k = `${s.departure!.local}|${s.flight ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const r = roles(unique);
  return unique.map((s, i) => {
    const d = s.departure!;
    const role = r[i];
    const route = s.from && s.to ? `${s.from.iata} → ${s.to.iata}` : s.route ?? '';
    const source = [role === 'outbound' ? '去程' : role === 'return' ? '回程' : '航段', s.flight, route, s.from ? `时区 ${s.from.tz}` : '出发地时区待核对', d.line].filter(Boolean).join(' · ');
    const eventId = `itin:${i}:${s.flight ?? ''}`;
    return {
      id: `${eventId}:${d.local}`, eventId, local: d.local, page: d.page, source, kind: 'departure' as const,
      ambiguousDate: false, inferredYear: false, role, flight: s.flight, from: s.from, to: s.to,
      tz: s.from?.tz, country: s.from?.country,
    };
  });
}
