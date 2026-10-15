import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { countries, crossedDeparture, FLIGHT_MS, flightPhase, fromLocal, localTime, validFlightSettings } from '../domain/flightCountdown';
import { db } from '../db/schema';
import { setFlightCountdown, saveImport } from '../db/repo';
import { parseMd } from '../importer/parseMd';
import type { Trip } from '../domain/types';
const value = { origin:'SG', destination:'JP', departureTz:'Asia/Singapore', returnTz:'Asia/Tokyo', departureAt:Date.UTC(2027,0,9,22,10), returnAt:Date.UTC(2027,0,19,11,30) };
const trip: Trip = {id:'flight-qa', title:'QA',startDate:'2027-01-10',endDate:'2027-01-19',homeTz:'Asia/Singapore',translate:{app:'google-translate',from:'auto',to:'zh-CN'},sourceMd:'',importedAt:'',updatedAt:''};
describe('flight countdown', () => {
 it('uses each departure time zone, not the device zone',()=>{
  expect(fromLocal('2027-01-10T06:10','Asia/Singapore')).toBe(value.departureAt);
  expect(fromLocal('2027-01-19T20:30','Asia/Tokyo')).toBe(value.returnAt);
  for(const c of countries) expect(localTime(fromLocal('2027-01-10T06:10',c.tz),c.tz)).toBe('2027-01-10T06:10');
 });
 it('rejects invalid dates, zones, DST gaps and ambiguous times',()=>{
  for(const [v,z] of [['2027-02-30T10:00','Asia/Tokyo'],['2027-01-10T25:10','Asia/Tokyo'],['','Asia/Tokyo'],['2027-01-10T10:00','bad'],['2027-03-14T02:30','America/New_York'],['2027-11-07T01:30','America/New_York']]) expect(fromLocal(v,z)).toBeNaN();
  expect(fromLocal('2027-07-01T09:00','America/New_York')).toBe(Date.UTC(2027,6,1,13));
 });
 it('validates return after departure and damaged saved values',()=>{
  expect(validFlightSettings(value)).toBe(true);
  for(const patch of [{returnAt:value.departureAt},{departureAt:NaN},{destination:'ZZ'},{returnTz:'bad'}]) expect(validFlightSettings({...value,...patch})).toBe(false);
 });
 it('reopens after departure without replay, ends at return takeoff',()=>{
  expect(flightPhase(value,value.departureAt-1)).toBe('before');
  expect(flightPhase(value,value.departureAt)).toBe('vacation');
  expect(flightPhase(value,value.departureAt+FLIGHT_MS-1,value.departureAt)).toBe('flying');
  expect(flightPhase(value,value.departureAt+FLIGHT_MS,value.departureAt)).toBe('vacation');
  expect(flightPhase(value,value.returnAt,value.returnAt-10)).toBe('ended');
 });
 it('only animates a visible live crossing, never a sleeping/background tab',()=>{
  const at=value.departureAt;
  expect(crossedDeparture(at,at-500,at+100,true)).toBe(true);
  expect(crossedDeparture(at,at-500,at+100,false)).toBe(false);
  expect(crossedDeparture(at,at-500,at+10000,true)).toBe(false);
  expect(crossedDeparture(at,at+100,at+500,true)).toBe(false);
 });
});
describe('flight persistence is trip-scoped and non-destructive',()=>{
 beforeEach(async()=>{await db.trips.clear();await db.trips.put(trip);await db.trips.put({...trip,id:'other'});});
 it('saves only this trip configuration and survives reread',async()=>{
  await setFlightCountdown(trip.id,value);
  const saved=await db.trips.get(trip.id);
  expect(saved?.flightCountdown).toEqual(value);
  expect(saved?.startDate).toBe(trip.startDate);
  expect(saved?.homeTz).toBe(trip.homeTz);
  expect((await db.trips.get('other'))?.flightCountdown).toBeUndefined();
 });
 it('rejects invalid writes and missing trips',async()=>{
  await expect(setFlightCountdown(trip.id,{...value,returnAt:0})).rejects.toThrow();
  await expect(setFlightCountdown('missing',value)).rejects.toThrow();
  expect((await db.trips.get(trip.id))?.flightCountdown).toBeUndefined();
 });
 it('preserves configuration through reimport',async()=>{
  await setFlightCountdown(trip.id,value);
  const parsed=parseMd('# 测试旅程\n- 出发地时区: Asia/Singapore\n## Day 1 | 2027-01-10 | 东京 | Asia/Tokyo\n### 09:00 | spot | 测试景点');
  await saveImport(parsed,'synthetic QA',trip.id);
  expect((await db.trips.get(trip.id))?.flightCountdown).toEqual(value);
 });
});
