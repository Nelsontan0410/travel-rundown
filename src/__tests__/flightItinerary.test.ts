import { describe, it, expect } from 'vitest';
import { airportOf, cleanTicketText, itinerarySegments, parseDateTime, parseItinerary } from '../lib/flightItinerary';
import { excerptOf, pageText, ticketCandidates } from '../lib/flightTicketPdf';
import { parseFlightTicketText } from '../domain/flightTicket';

// Trip.com 电子行程单（E-itinerary）提取出的文字；回程在换页处，页码 1 粘在 Departure 前。
const TRIP_COM = `Kuala Lumpur - Nanning
Departure 13:05, November 26, 2026, Kuala Lumpur International Airport T2
Arrival 16:45, November 26, 2026, Nanning Wuxu International Airport T2
Airline AirAsia Berhad (Malaysia) AK168
Nanning - Kuala Lumpur
1Departure 17:30, November 29, 2026, Nanning Wuxu International Airport T2
Arrival 21:20, November 29, 2026, Kuala Lumpur International Airport T2
Airline AirAsia Berhad (Malaysia) AK169`;

const pick = (text: string | string[]) => parseItinerary(Array.isArray(text) ? text : [text]);

describe('Trip.com itinerary fixture', () => {
  it('finds outbound and return departures with flight numbers, airports and zones', () => {
    const rows = pick(TRIP_COM);
    expect(rows).toHaveLength(2);
    const [out, back] = rows;
    expect(out).toMatchObject({ role: 'outbound', local: '2026-11-26T13:05', flight: 'AK168', tz: 'Asia/Kuala_Lumpur', country: 'MY', kind: 'departure' });
    expect(out.from?.iata).toBe('KUL'); expect(out.to?.iata).toBe('NNG');
    expect(back).toMatchObject({ role: 'return', local: '2026-11-29T17:30', flight: 'AK169', tz: 'Asia/Shanghai', country: 'CN' });
    expect(back.from?.iata).toBe('NNG'); expect(back.to?.iata).toBe('KUL');
    expect(out.eventId).not.toBe(back.eventId);
    expect(out.source).toContain('AK168');
  });
  it('works when the page break splits the PDF into two pages', () => {
    const [p1, p2] = TRIP_COM.split('Nanning - Kuala Lumpur\n');
    const rows = pick([p1, 'Nanning - Kuala Lumpur\n' + p2]);
    expect(rows.map(r => [r.role, r.local, r.flight, r.from?.iata, r.page])).toEqual([
      ['outbound', '2026-11-26T13:05', 'AK168', 'KUL', 1],
      ['return', '2026-11-29T17:30', 'AK169', 'NNG', 2],
    ]);
  });
  it('sorts by date even if the return leg is printed first', () => {
    const [a, b] = TRIP_COM.split('Nanning - Kuala Lumpur\n');
    const rows = pick('Nanning - Kuala Lumpur\n' + b + '\n' + a);
    expect(rows.map(r => [r.role, r.flight])).toEqual([['outbound', 'AK168'], ['return', 'AK169']]);
  });
  it('the PDF path (ticketCandidates) returns both legs, and the old parser now also sees the page-glued departure', () => {
    const rows = ticketCandidates([TRIP_COM], [{ page: 1, text: cleanTicketText(TRIP_COM) }], 2026);
    expect(rows.map(r => r.local)).toEqual(['2026-11-26T13:05', '2026-11-29T17:30']);
    expect(parseFlightTicketText([{ page: 1, text: cleanTicketText(TRIP_COM) }], 2026).map(r => r.local)).toEqual(['2026-11-26T13:05', '2026-11-29T17:30']);
  });
});

describe('cleaning', () => {
  it('strips page numbers glued to labels and collapses whitespace', () => {
    expect(cleanTicketText('foo\n12Departure  13:05 ,  November 26, 2026\n 3Arrival x\n2Airline AK1')).toBe('foo\nDeparture 13:05, November 26, 2026\nArrival x\nAirline AK1');
    expect(cleanTicketText('page 1Departure 10:00')).toBe('page Departure 10:00');
    // 正常的数字不受影响
    expect(cleanTicketText('Gate 12 Departure 10:00\nAK168')).toBe('Gate 12 Departure 10:00\nAK168');
  });
  it('pageText reads atoms top-to-bottom, left-to-right', () => {
    expect(pageText([
      { text: '13:05, November 26, 2026', x: 80, y: 700, width: 100 },
      { text: 'Departure', x: 10, y: 701, width: 50 },
      { text: 'Arrival', x: 10, y: 680, width: 50 },
    ])).toBe('Departure 13:05, November 26, 2026\nArrival');
  });
  it('failure excerpt is cleaned and capped at 600 characters', () => {
    expect(excerptOf(['x'.repeat(700)])).toHaveLength(600);
    expect(excerptOf(['1Departure  soon'])).toBe('Departure soon');
  });
});

describe('date-time formats', () => {
  const cases: [string, string][] = [
    ['13:05, November 26, 2026', '2026-11-26T13:05'],
    ['1:05 PM, Nov 26, 2026', '2026-11-26T13:05'],
    ['November 26, 2026 12:10 AM', '2026-11-26T00:10'],
    ['Nov. 26th, 2026, 12:30 p.m.', '2026-11-26T12:30'],
    ['26 Nov 2026 13:05', '2026-11-26T13:05'],
    ['26NOV2026 08:40', '2026-11-26T08:40'],
    ['2026-11-26 13:05', '2026-11-26T13:05'],
    ['2026/11/26 07:05', '2026-11-26T07:05'],
    ['2026年11月26日 下午1:05', '2026-11-26T13:05'],
  ];
  for (const [text, local] of cases) it(text, () => expect(parseDateTime(text)?.local).toBe(local));
  it('rejects impossible dates/times and does not read a UTC offset as the time', () => {
    for (const text of ['13:05, February 30, 2026', '25:10, November 26, 2026', '13:05 PM, November 26, 2026', 'November 26, 2026']) expect(parseDateTime(text)).toBeUndefined();
    expect(parseDateTime('November 26, 2026 GMT+08:00 13:05')?.local).toBe('2026-11-26T13:05');
  });
});

describe('itinerary variants', () => {
  it('no glued page number, 12-hour clock', () => {
    const rows = pick(`Singapore - Tokyo
Departure 9:15 AM, January 10, 2027, Singapore Changi Airport T3
Arrival 5:20 PM, January 10, 2027, Tokyo Narita International Airport T1
Airline Singapore Airlines SQ638
Tokyo - Singapore
Departure 11:05 PM, January 19, 2027, Tokyo Haneda Airport T3
Arrival 5:45 AM, January 20, 2027, Singapore Changi Airport T3
Airline Singapore Airlines SQ 633`);
    expect(rows.map(r => [r.role, r.local, r.flight, r.from?.iata, r.tz])).toEqual([
      ['outbound', '2027-01-10T09:15', 'SQ638', 'SIN', 'Asia/Singapore'],
      ['return', '2027-01-19T23:05', 'SQ633', 'HND', 'Asia/Tokyo'],
    ]);
  });
  it('day-month and ISO formats, flight number before departure line still binds to its segment', () => {
    const rows = pick(`Hong Kong → Bangkok
Departure: 05 Mar 2027 08:40 Hong Kong International Airport T1
Arrival: 05 Mar 2027 10:35 Bangkok Suvarnabhumi Airport
Flight: CX 701
Bangkok → Hong Kong
Departure: 2027-03-09 14:10 Suvarnabhumi Airport
Arrival: 2027-03-09 18:05 Hong Kong International Airport
Flight: CX700`);
    expect(rows.map(r => [r.role, r.local, r.flight, r.from?.iata, r.tz])).toEqual([
      ['outbound', '2027-03-05T08:40', 'CX701', 'HKG', 'Asia/Hong_Kong'],
      ['return', '2027-03-09T14:10', 'CX700', 'BKK', 'Asia/Bangkok'],
    ]);
  });
  it('connecting flights: return is the first leg of the trip back home', () => {
    const rows = pick(`Departure 2027-01-10 06:00 Singapore Changi Airport
Arrival 2027-01-10 10:00 Guangzhou Baiyun International Airport
Airline CZ 352
Departure 2027-01-10 13:00 Guangzhou Baiyun International Airport
Arrival 2027-01-10 16:00 Beijing Capital International Airport
Airline CZ 3101
Departure 2027-01-18 08:00 Beijing Capital International Airport
Arrival 2027-01-18 11:00 Shenzhen Bao'an International Airport
Airline ZH 9102
Departure 2027-01-18 14:00 Shenzhen Bao'an International Airport
Arrival 2027-01-18 18:00 Singapore Changi Airport
Airline ZH 9031`);
    expect(rows.map(r => [r.role, r.flight, r.from?.iata])).toEqual([
      ['outbound', 'CZ352', 'SIN'], [undefined, 'CZ3101', 'CAN'], ['return', 'ZH9102', 'PEK'], [undefined, 'ZH9031', 'SZX'],
    ]);
  });
  it('unknown airport keeps tz empty so the user checks the zone before saving', () => {
    const [row] = pick('Departure 13:05, November 26, 2026, Somewhere Regional Airport\nAirline Example Air XY12');
    expect(row).toMatchObject({ local: '2026-11-26T13:05', flight: 'XY12', role: 'outbound' });
    expect(row.tz).toBeUndefined(); expect(row.country).toBeUndefined();
    expect(row.source).toContain('出发地时区待核对');
  });
  it('a departure date on the next line is still read', () => {
    expect(itinerarySegments(['Departure\n13:05, November 26, 2026\nKuala Lumpur International Airport T2'])[0].departure?.local).toBe('2026-11-26T13:05');
  });
  it('duplicate passenger copies are merged; nothing parseable returns empty (falls back to old parser)', () => {
    expect(pick([TRIP_COM, TRIP_COM])).toHaveLength(2);
    expect(pick('Booking created 2026-10-16 10:00\nArrival 16:45, November 26, 2026')).toEqual([]);
    expect(ticketCandidates(['x'], [{ page: 1, text: 'Departure 10 JAN 2027 06:10' }], 2027).map(r => r.local)).toEqual(['2027-01-10T06:10']);
    expect(ticketCandidates(['x'], [{ page: 1, text: 'nothing here' }], 2027)).toEqual([]);
  });
});

describe('airport table', () => {
  it('maps common airports to IATA and IANA zones', () => {
    const map = (s: string) => { const a = airportOf(s); return a && [a.iata, a.tz]; };
    expect(map('Kuala Lumpur International Airport T2')).toEqual(['KUL', 'Asia/Kuala_Lumpur']);
    expect(map('Nanning Wuxu International Airport T2')).toEqual(['NNG', 'Asia/Shanghai']);
    expect(map('Singapore Changi Airport')).toEqual(['SIN', 'Asia/Singapore']);
    expect(map('Beijing Capital International Airport')).toEqual(['PEK', 'Asia/Shanghai']);
    expect(map('Shanghai Pudong International Airport')).toEqual(['PVG', 'Asia/Shanghai']);
    expect(map('Guangzhou Baiyun International Airport')).toEqual(['CAN', 'Asia/Shanghai']);
    expect(map('Shenzhen Bao\'an International Airport')).toEqual(['SZX', 'Asia/Shanghai']);
    expect(map('Hong Kong International Airport')).toEqual(['HKG', 'Asia/Hong_Kong']);
    expect(map('Bangkok Suvarnabhumi Airport')).toEqual(['BKK', 'Asia/Bangkok']);
    expect(map('Somewhere Regional')).toBeUndefined();
  });
});
