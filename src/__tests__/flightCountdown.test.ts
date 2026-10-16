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

describe('flight background photo lifecycle', () => {
 beforeEach(async()=>{await Promise.all(db.tables.map(t=>t.clear()));await db.trips.put(trip);await db.trips.put({...trip,id:'other'});});
 it('isolates sides and trips, replaces a photo, and restores only that flag',async()=>{
  const {setFlightBackground,flightBackgroundKey}=await import('../db/repo');
  const first=new Blob(['first'],{type:'image/jpeg'}),second=new Blob(['second'],{type:'image/png'});
  await setFlightBackground(trip.id,'origin',first);await setFlightBackground(trip.id,'destination',second);
  await setFlightBackground(trip.id,'origin',second);
  expect(await (await db.blobs.get(flightBackgroundKey(trip.id,'origin')))!.blob.text()).toBe('second');
  expect(await db.blobs.get(flightBackgroundKey('other','origin'))).toBeUndefined();
  await setFlightBackground(trip.id,'origin',null);
  expect(await db.blobs.get(flightBackgroundKey(trip.id,'origin'))).toBeUndefined();
  expect(await (await db.blobs.get(flightBackgroundKey(trip.id,'destination')))!.blob.text()).toBe('second');
  expect((await db.trips.get(trip.id))?.startDate).toBe(trip.startDate);
 });
 it('rejects invalid images and deleted trips without creating orphan blobs',async()=>{
  const {setFlightBackground}=await import('../db/repo');
  for(const blob of [new Blob(['bad'],{type:'text/plain'}),new Blob(['<svg/>'],{type:'image/svg+xml'}),new Blob([],{type:'image/jpeg'})]) await expect(setFlightBackground(trip.id,'origin',blob)).rejects.toThrow();
  await expect(setFlightBackground('missing','origin',new Blob(['x'],{type:'image/jpeg'}))).rejects.toThrow();
  expect(await db.blobs.count()).toBe(0);
 });
 it('includes photos only in this trip package and restores their bytes',async()=>{
  const {setFlightBackground,flightBackgroundKey,exportTripPackage,restoreBackupDetailed,tripPackageInfo}=await import('../db/repo');
  await setFlightBackground(trip.id,'origin',new Blob(['my photo'],{type:'image/jpeg'}));
  await setFlightBackground('other','origin',new Blob(['other photo'],{type:'image/png'}));
  expect(await tripPackageInfo(trip.id)).toEqual({files:1,bytes:8});
  const zip=await exportTripPackage(trip.id,{attachments:true});
  await Promise.all(db.tables.map(t=>t.clear()));await restoreBackupDetailed(zip);
  expect(await (await db.blobs.get(flightBackgroundKey(trip.id,'origin')))!.blob.text()).toBe('my photo');
  expect(await db.blobs.get(flightBackgroundKey('other','origin'))).toBeUndefined();
 });
 it('preserves photos through itinerary reimport and cleans them up when deleting the trip',async()=>{
  const {setFlightBackground,flightBackgroundKey,deleteTrip}=await import('../db/repo');
  await setFlightBackground(trip.id,'origin',new Blob(['photo'],{type:'image/jpeg'}));
  const parsed=parseMd('# 测试旅程\n- 出发地时区: Asia/Singapore\n## Day 1 | 2027-01-10 | 东京 | Asia/Tokyo\n### 09:00 | spot | 测试景点');
  await saveImport(parsed,'synthetic QA',trip.id);
  expect(await db.blobs.get(flightBackgroundKey(trip.id,'origin'))).toBeDefined();
  await deleteTrip(trip.id);expect(await db.blobs.get(flightBackgroundKey(trip.id,'origin'))).toBeUndefined();
  expect(await db.trips.get('other')).toBeDefined();
 });
});
