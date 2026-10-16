import { describe,it,expect } from 'vitest';
import { parseFlightTicketText } from '../domain/flightTicket';
const parse=(text:string,year?:number)=>parseFlightTicketText([{page:1,text}],year);
describe('PDF ticket local-time candidates',()=>{
 it('extracts departures and excludes arrivals, boarding and issue timestamps',()=>{
  const rows=parse('Issued: 2026-10-16 10:00\nDeparture: Singapore SIN 10 JAN 2027 06:10\nArrival: Tokyo HND 10 JAN 2027 14:20\nBoarding: 10 JAN 2027 05:30\nDeparture: Tokyo HND 19 JAN 2027 20:30\nArrival: Singapore SIN 20 JAN 2027 02:40');
  expect(rows.map(x=>x.local)).toEqual(['2027-01-10T06:10','2027-01-19T20:30']);
  expect(rows.every(x=>x.kind==='departure')).toBe(true);
 });
 it('recognizes Chinese labels, ISO dates and full-width punctuation',()=>{
  expect(parse('起飞：２０２７年１月１０日 ０６：１０\n抵达：2027-01-10 14:00')[0].local).toBe('2027-01-10T06:10');
 });
 it('reads Chinese afternoon clocks and spaced numeric separators',()=>{
  expect(parse('起飞 2027 / 01 / 10 下午 6时10分')[0].local).toBe('2027-01-10T18:10');
 });
 it('handles month-first dates and midnight/noon in a 12-hour clock',()=>{
  expect(parse('Departure January 10, 2027 12:00 AM\nArrival January 10, 2027 05:00 AM\nDeparture Jan 19, 2027 12:00 PM').map(x=>x.local)).toEqual(['2027-01-10T00:00','2027-01-19T12:00']);
 });
 it('keeps both interpretations of an ambiguous numeric date on the same event',()=>{
  const rows=parse('Departure 10/01/2027 06:10');
  expect(rows.map(x=>x.local).sort()).toEqual(['2027-01-10T06:10','2027-10-01T06:10']);
  expect(rows.every(x=>x.ambiguousDate)).toBe(true);expect(rows[0].eventId).toBe(rows[1].eventId);
 });
 it('obeys explicit numeric date-order headers and unambiguous days',()=>{
  expect(parse('DD/MM/YYYY\nDeparture 10/01/2027 06:10')[0].local).toBe('2027-01-10T06:10');
  expect(parse('MM/DD/YYYY\nDeparture 10/01/2027 06:10')[0].local).toBe('2027-10-01T06:10');
  expect(parse('Departure 19/01/2027 20:30').map(x=>x.local)).toEqual(['2027-01-19T20:30']);
 });
 it('does not invent a year for short-year dates without trip context',()=>{
  expect(parse('Departure 10JAN27 06:10')).toEqual([]);
  const row=parse('Departure 10JAN27 06:10',2027)[0];expect(row.local).toBe('2027-01-10T06:10');expect(row.inferredYear).toBe(true);
 });
 it('rejects calendar overflow and impossible times rather than normalizing them',()=>{
  for(const text of ['Departure 2027-02-30 06:10','Departure 2027-01-10 25:10','Departure 2027-01-10 13:10 PM','Departure 2027-01-10 00:10 AM']) expect(parse(text)).toEqual([]);
 });
 it('does not interpret a UTC offset as another flight time',()=>{
  expect(parse('Departure 2027-01-10 06:10 GMT+08:00').map(x=>x.local)).toEqual(['2027-01-10T06:10']);
 });
 it('marks unlabeled dates as uncertain and excludes unrelated timestamps if explicit departures exist',()=>{
  expect(parse('10 JAN 2027 06:10')[0].kind).toBe('uncertain');
  const rows=parseFlightTicketText([{page:1,text:'2026-10-16 10:00'},{page:2,text:'Departure 10 JAN 2027 06:10'}]);
  expect(rows).toHaveLength(1);expect(rows[0].page).toBe(2);
 });
 it('deduplicates repeated passenger copies without losing different flights',()=>{
  const rows=parseFlightTicketText([{page:1,text:'Departure 10 JAN 2027 06:10'},{page:2,text:'Departure 10 JAN 2027 06:10'},{page:3,text:'Departure 19 JAN 2027 20:30'}]);
  expect(rows.map(x=>x.local)).toEqual(['2027-01-10T06:10','2027-01-19T20:30']);
 });
 it('reads a departure-column block with a date on the next line',()=>{
  expect(parseFlightTicketText([{page:1,text:'Singapore SIN\n10 JAN 2027\n06:10',departureColumn:true}])[0].local).toBe('2027-01-10T06:10');
 });
 it('rejects date-only, arrival-only and unrelated booking data',()=>{
  for(const text of ['Departure 10 JAN 2027','Arrival 10 JAN 2027 14:00','Booking created 2026-10-16 10:00','Flight SQ 123, ticket 202701100610'])expect(parse(text)).toEqual([]);
 });
});
