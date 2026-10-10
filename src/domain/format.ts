// 文案和格式规则（设计参考「状态与文案」）
export const SEP = ' · ';
export const RANGE = ' — ';

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

/** 1月13日 */
export function fmtMonthDay(date: string): string {
  const { m, d } = parts(date);
  return `${m}月${d}日`;
}

/** 2027.01.13 — 01.22；跨年时两边都写全年份 */
export function fmtDateRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  const p = (n: number) => String(n).padStart(2, '0');
  const left = `${a.y}.${p(a.m)}.${p(a.d)}`;
  if (start === end) return left;
  const right = a.y === b.y ? `${p(b.m)}.${p(b.d)}` : `${b.y}.${p(b.m)}.${p(b.d)}`;
  return `${left}${RANGE}${right}`;
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
