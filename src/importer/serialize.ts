// 2026-10-15：把 App 里的行程（含用户手动编辑）写回标准 MD。
// 用途：每次在 App 里编辑后重新生成 Trip.sourceMd，这样「重新导入」「查看原文」看到的都是改过的内容；
// 写出的 MD 用 parseMd 读回来，得到同样的行程（round-trip，见 __tests__/serialize.test.ts）。
import type { Day, Item, MealKind, Trip } from '../domain/types';

const MEAL: Record<MealKind, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '小吃' };

const dmy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
};
/** 写进一行里的文字：去掉换行，竖线换成全角以免被当成分隔符 */
const one = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
const cell = (s: string) => one(s).replace(/\|/g, '｜');

function pair(a: string | undefined, b: string | undefined): string | undefined {
  const x = a ? cell(a) : '';
  const y = b ? cell(b) : '';
  if (!x && !y) return undefined;
  return y ? `${x} | ${y}` : x;
}

function itemLines(it: Item, dayDate: string): string[] {
  const time = it.start ? ` ${it.start}${it.end ? `-${it.end}${it.endDayOffset ? '+1' : ''}` : ''}` : '';
  const out = [`### [${it.type}]${time} ${one(it.title)}`];
  const f = (k: string, v: string | undefined) => {
    if (v !== undefined && v !== '') out.push(`- ${k}: ${one(v)}`);
  };
  if (!it.start) f('时间说明', it.timeNote);
  if (it.type === 'meal' && it.meal) f('餐别', MEAL[it.meal]);
  if (it.place) {
    f('地点', pair(it.place.name, it.place.localName));
    f('地址', pair(it.place.address, it.place.localAddress));
  }
  if (it.toPlace) f('终点', pair(it.toPlace.name, it.toPlace.localName));
  if (it.flight) {
    f('航班号', it.flight.number);
    f('航空公司', it.flight.airline);
    f('航站楼', it.flight.terminal);
    f('座位', it.flight.seat);
  }
  if (it.lodging) {
    if (it.lodging.checkIn && it.lodging.checkIn !== dayDate) f('入住日期', dmy(it.lodging.checkIn));
    if (it.lodging.checkOut) f('退房日期', dmy(it.lodging.checkOut));
    f('房型', it.lodging.roomType);
  }
  if (it.transit) {
    f('方式', it.transit.mode);
    f('线路', it.transit.line);
  }
  if (it.mustDo?.length) f(it.type === 'meal' ? '必吃' : '必逛', it.mustDo.map(cell).join('；'));
  if (it.budget !== undefined) f('预算', (it.budget / 100).toFixed(2).replace(/\.00$/, ''));
  f('订单', it.bookingRef);
  if (it.bookingStatus) f('预订状态', it.bookingStatus === 'confirmed' ? '已确认' : '待确认');
  if (it.fixed) f('固定', '是');
  f('导航', it.navUrl);
  f('备选', it.alt);
  f('备注', it.note);
  for (const [k, v] of Object.entries(it.meta ?? {})) f(cell(k).replace(/[:：]/g, ' '), v);
  return out;
}

export interface SerializedTrip {
  md: string;
  /** 每一项在 md 里的起止行号（含），用于「查看原文」 */
  src: Map<string, { from: number; to: number }>;
}

export function tripToMd(trip: Trip, days: Day[], items: Item[]): SerializedTrip {
  const lines: string[] = [`# ${one(trip.title)}`, `- 日期: ${dmy(trip.startDate)} ~ ${dmy(trip.endDate)}`, `- 出发地时区: ${trip.homeTz}`];
  if (trip.destination) lines.push(`- 目的地: ${one(trip.destination)}`);
  if (trip.participants) lines.push(`- 人数: ${trip.participants}`);
  if (trip.budget !== undefined) lines.push(`- 预算: ${(trip.budget / 100).toFixed(2).replace(/\.00$/, '')}`);
  const src = new Map<string, { from: number; to: number }>();
  const sortedDays = [...days].sort((a, b) => a.index - b.index);
  for (const d of sortedDays) {
    lines.push('', `## Day ${d.index} | ${dmy(d.date)} | ${cell(d.city)} | ${d.tz}${d.title ? ` | ${cell(d.title)}` : ''}`);
    if (d.note) lines.push(`- 备注: ${one(d.note)}`);
    const its = items.filter((i) => i.dayId === d.id).sort((a, b) => a.order - b.order);
    for (const it of its) {
      lines.push('');
      const from = lines.length + 1;
      lines.push(...itemLines(it, d.date));
      src.set(it.id, { from, to: lines.length });
    }
  }
  return { md: lines.join('\n') + '\n', src };
}
