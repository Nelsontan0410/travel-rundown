// 文案和格式规则（设计参考「状态与文案」）
export const SEP = ' · ';
export const RANGE = ' — ';

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 13-JAN（用户要求的显示格式：日-英文月份缩写-年） */
export function fmtMonthDay(date: string): string {
  const { m, d } = parts(date);
  if (!m || !d) return date;
  return `${d}-${MONTHS[m - 1]}`;
}

/** 13-JAN-2027 */
export function fmtDate(date: string): string {
  const { y } = parts(date);
  return y ? `${fmtMonthDay(date)}-${y}` : date;
}

/** 13-JAN — 22-JAN-2027；跨年时两边都写全 */
export function fmtDateRange(start: string, end: string): string {
  if (!start) return '';
  if (!end || start === end) return fmtDate(start);
  const a = parts(start);
  const b = parts(end);
  const left = a.y === b.y ? fmtMonthDay(start) : fmtDate(start);
  return `${left}${RANGE}${fmtDate(end)}`;
}

/**
 * 解析导入时出现的各种日期写法，统一成 YYYY-MM-DD；认不出返回 ''。
 * 支持：13-01-2027、13/1/2027、13.01.2027（日在前）、2027-01-13、13-JAN-2027、13 Jan 2027。
 * 只认「日-月-年」，不认美式「月-日-年」。
 */
export function parseDateAny(raw: string): string {
  const s = raw.trim();
  const ok = (y: number, m: number, d: number) => {
    if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const t = new Date(`${iso}T00:00:00Z`);
    return t.getUTCDate() === d ? iso : '';
  };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return ok(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-\s/.]*([A-Za-z]{3})[A-Za-z]*[-\s/.,]*(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toUpperCase());
    return mi < 0 ? '' : ok(+m[3], mi + 1, +m[1]);
  }
  return '';
}

/** 从一段文字里按顺序找出所有能识别的日期 */
export function findDates(text: string): string[] {
  const re = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}[-\s]*[A-Za-z]{3,9}[-\s,]*\d{4}/g;
  return (text.match(re) ?? []).map(parseDateAny).filter(Boolean);
}

/** 两个日期相差几天（b − a） */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** RM 1,234.50（金额单位「分」） */
export function fmtMoney(sen: number): string {
  const neg = sen < 0;
  const v = Math.abs(Math.round(sen));
  const whole = Math.floor(v / 100).toLocaleString('en-US');
  const cents = String(v % 100).padStart(2, '0');
  return `${neg ? '-' : ''}RM ${whole}.${cents}`;
}

/** 「1,234.5」「RM 80」「MYR8000」→ 分；认不出返回 null */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/(RM|MYR|令吉|马币|,|，|\s)/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** 行程天数：endDate − startDate + 1 */
export function tripDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** 「10天 · 日本」；没有目的地时只写「10天」 */
export function fmtDaysDest(start: string, end: string, destination?: string): string {
  const n = `${tripDays(start, end)}天`;
  return destination ? `${n}${SEP}${destination}` : n;
}

/** 当地时间的 UTC 偏移，例如 UTC+9、UTC+5:30 */
export function utcOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const name = f.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const off = name.replace('GMT', '');
    return off ? `UTC${off}` : 'UTC+0';
  } catch {
    return 'UTC';
  }
}

/** 某时区「现在」的当地日期 YYYY-MM-DD 和时间 HH:mm */
export function nowIn(tz: string, at: Date = new Date()): { date: string; time: string } {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const o: Record<string, string> = {};
    for (const p of f.formatToParts(at)) o[p.type] = p.value;
    return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
  } catch {
    const iso = at.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }
}

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** 15:00–17:00；结束在次日时加 +1 */
export function fmtTimeRange(start?: string, end?: string, endDayOffset?: number): string {
  if (!start) return '';
  if (!end) return start;
  return `${start}–${end}${endDayOffset ? `+${endDayOffset}` : ''}`;
}

export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
