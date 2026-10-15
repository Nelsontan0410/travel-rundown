import type { FlightCountdownSettings } from './types';

export const FLIGHT_MS = 4600;
export const countries = [
  { code: 'SG', zh: '新加坡', en: 'Singapore', landmark: 'Marina Bay Sands', tz: 'Asia/Singapore' },
  { code: 'JP', zh: '日本', en: 'Japan', landmark: 'Mount Fuji', tz: 'Asia/Tokyo' },
  { code: 'MY', zh: '马来西亚', en: 'Malaysia', landmark: 'Petronas Twin Towers', tz: 'Asia/Kuala_Lumpur' },
  { code: 'CN', zh: '中国', en: 'China', landmark: 'Great Wall', tz: 'Asia/Shanghai' },
  { code: 'KR', zh: '韩国', en: 'South Korea', landmark: 'Gyeongbokgung Palace', tz: 'Asia/Seoul' },
  { code: 'TH', zh: '泰国', en: 'Thailand', landmark: 'Wat Arun', tz: 'Asia/Bangkok' },
  { code: 'VN', zh: '越南', en: 'Vietnam', landmark: 'Ha Long Bay', tz: 'Asia/Ho_Chi_Minh' },
  { code: 'ID', zh: '印尼', en: 'Indonesia', landmark: 'Borobudur Temple', tz: 'Asia/Jakarta' },
] as const;
export const countryOf = (code: string) => countries.find(c => c.code === code);
export const asset = (code: string, kind: 'flag' | 'landmark') => `/landing/flight-countdown/${code}-${kind}.${kind === 'flag' ? 'svg' : 'png'}`;
export function validZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }).format(); return true; } catch { return false; }
}
export function localTime(at: number, tz: string): string {
  if (!Number.isFinite(at) || !validZone(tz)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(at).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** Round-trip verification rejects invalid dates, DST gaps and ambiguous wall times. */
export function fromLocal(value: string, tz: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !validZone(tz)) return NaN;
  const guess = Date.parse(value + ':00Z');
  if (!Number.isFinite(guess)) return NaN;
  const candidates = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const sample = guess + delta * 3600000;
    const offset = Date.parse(localTime(sample, tz) + ':00Z') - sample;
    const candidate = guess - offset;
    if (localTime(candidate, tz) === value) candidates.add(candidate);
  }
  return candidates.size === 1 ? [...candidates][0] : NaN;
}
export function validFlightSettings(s: FlightCountdownSettings | undefined): s is FlightCountdownSettings {
  return !!s && !!countryOf(s.origin) && !!countryOf(s.destination) && validZone(s.departureTz) && validZone(s.returnTz)
    && Number.isFinite(s.departureAt) && Number.isFinite(s.returnAt) && s.returnAt > s.departureAt
    && Math.abs(s.departureAt) < 8640000000000000 && Math.abs(s.returnAt) < 8640000000000000;
}
export type FlightPhase = 'before' | 'flying' | 'vacation' | 'ended';
export function flightPhase(s: FlightCountdownSettings, now: number, transitionAt?: number): FlightPhase {
  if (now >= s.returnAt) return 'ended';
  if (now < s.departureAt) return 'before';
  if (transitionAt !== undefined && now >= transitionAt && now < transitionAt + FLIGHT_MS) return 'flying';
  return 'vacation';
}
/** Only a visible, continuously open page crossing departure may animate. */
export function crossedDeparture(departure: number, previous: number, now: number, visible: boolean): boolean {
  return visible && previous < departure && now >= departure && now - previous <= 2000;
}
