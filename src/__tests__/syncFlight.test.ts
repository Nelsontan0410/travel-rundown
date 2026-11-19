import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, diffSnapshots } from '../cloud/snapshot';
import { applyUpdate } from '../cloud/sync';
import { db } from '../db/schema';
import type { Trip } from '../domain/types';

const fc = { origin: 'MY', destination: 'CN', departureAt: Date.UTC(2026, 10, 26, 5, 5), returnAt: Date.UTC(2026, 11, 1, 5, 0), departureTz: 'Asia/Kuala_Lumpur', returnTz: 'Asia/Shanghai' };
const trip = { id: 'tf', title: '南宁', startDate: '2026-11-26', endDate: '2026-11-29', homeTz: 'Asia/Kuala_Lumpur', translate: {}, sourceMd: '', importedAt: '', updatedAt: '' } as unknown as Trip;

describe('航班时间跟着版本同步', () => {
  it('快照带上、改动清单能看到', () => {
    const a = buildSnapshot(trip, [], [], [], () => undefined);
    const b = buildSnapshot({ ...trip, flightCountdown: fc }, [], [], [], () => undefined);
    expect(b.trip.flightCountdown).toEqual(fc);
    expect(diffSnapshots(a, b).trip).toContain('航班时间');
  });
  it('同伴套用后有航班时间；主用户没设时不冲掉同伴自己的', async () => {
    await db.trips.clear();
    const withFc = buildSnapshot({ ...trip, flightCountdown: fc }, [], [], [], () => undefined);
    await applyUpdate('tf', { version: 1, snapshot: withFc }, {}, {});
    expect((await db.trips.get('tf'))?.flightCountdown).toEqual(fc);
    const without = buildSnapshot(trip, [], [], [], () => undefined);
    await applyUpdate('tf', { version: 2, snapshot: without }, {}, {});
    expect((await db.trips.get('tf'))?.flightCountdown).toEqual(fc);
  });
});
