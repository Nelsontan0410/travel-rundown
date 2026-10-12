import { describe, expect, it } from 'vitest';
import { checkTrip, type CheckItem } from '../domain/check';
import { tripPhase } from '../domain/phase';

const it0 = (o: Partial<CheckItem> = {}): CheckItem => ({
  key: 'k', type: 'spot', title: 'T', date: '2027-01-10', dayIndex: 1, navUrl: 'https://x', ...o,
});
const rules = (items: CheckItem[]) => checkTrip(items).map((i) => i.rule);

describe('checkTrip', () => {
  it('missing-proof: flight without doc flagged, with doc ok, unsaved skipped', () => {
    expect(rules([it0({ type: 'flight', start: '10:00', docCount: 0 })])).toContain('missing-proof');
    expect(rules([it0({ type: 'flight', start: '10:00', docCount: 1 })])).not.toContain('missing-proof');
    expect(rules([it0({ type: 'flight', start: '10:00' })])).not.toContain('missing-proof');
    expect(rules([it0({ type: 'spot', docCount: 0 })])).not.toContain('missing-proof');
  });
  it('missing-time: lodging/flight/fixed need a start', () => {
    expect(rules([it0({ type: 'lodging', place: { name: 'a', localAddress: 'x' } })])).toContain('missing-time');
    expect(rules([it0({ fixed: true })])).toContain('missing-time');
    expect(rules([it0({ type: 'lodging', start: '15:00', place: { name: 'a', localAddress: 'x' } })])).not.toContain('missing-time');
    expect(rules([it0()])).not.toContain('missing-time');
  });
  it('missing-local-address: lodging only', () => {
    expect(rules([it0({ type: 'lodging', start: '15:00', place: { name: 'a' } })])).toContain('missing-local-address');
    expect(rules([it0({ type: 'lodging', start: '15:00', place: { name: 'a', localAddress: 'x' } })])).not.toContain('missing-local-address');
    expect(rules([it0({ type: 'spot' })])).not.toContain('missing-local-address');
  });
  it('missing-nav: everything except note', () => {
    expect(rules([it0({ navUrl: undefined })])).toContain('missing-nav');
    expect(rules([it0({ type: 'note', navUrl: undefined })])).not.toContain('missing-nav');
    expect(rules([it0()])).not.toContain('missing-nav');
  });
  it('time-order: reversed start in the same day', () => {
    const a = it0({ key: 'a', start: '10:00' });
    const b = it0({ key: 'b', start: '09:00' });
    expect(rules([a, b])).toContain('time-order');
    expect(rules([b, a])).not.toContain('time-order');
    expect(rules([a, { ...b, dayIndex: 2 }])).not.toContain('time-order');
  });
  it('pending-booking', () => {
    expect(rules([it0({ bookingStatus: 'pending' })])).toContain('pending-booking');
    expect(rules([it0({ bookingStatus: 'confirmed' })])).not.toContain('pending-booking');
  });
  it('clean trip has no issues', () => {
    expect(checkTrip([it0({ start: '09:00' })])).toEqual([]);
  });
});

describe('tripPhase', () => {
  const days = [
    { index: 1, date: '2027-01-09', tz: 'Asia/Singapore' },
    { index: 2, date: '2027-01-10', tz: 'Asia/Tokyo' },
    { index: 3, date: '2027-01-11', tz: 'Asia/Tokyo' },
  ];
  it('before with day count', () => {
    expect(tripPhase(days, new Date('2027-01-06T04:00:00Z'))).toEqual({ kind: 'before', daysToGo: 3 });
  });
  it('first day itself is during', () => {
    expect(tripPhase(days, new Date('2027-01-09T00:00:00Z'))).toEqual({ kind: 'during' });
  });
  it('boundary uses the day timezone: Tokyo midnight is still the last day in Singapore terms', () => {
    // 2027-01-11 23:30 Tokyo = 14:30Z; last day in Tokyo -> during
    expect(tripPhase(days, new Date('2027-01-11T14:30:00Z'))).toEqual({ kind: 'during' });
    // 2027-01-12 00:30 Tokyo = 15:30Z -> after
    expect(tripPhase(days, new Date('2027-01-11T15:30:00Z'))).toEqual({ kind: 'after' });
  });
  it('before boundary in first-day tz: Singapore 2027-01-08 23:30', () => {
    expect(tripPhase(days, new Date('2027-01-08T15:30:00Z'))).toEqual({ kind: 'before', daysToGo: 1 });
  });
  it('no days', () => {
    expect(tripPhase([], new Date())).toEqual({ kind: 'during' });
  });
});
