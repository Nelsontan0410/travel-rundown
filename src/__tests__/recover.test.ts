// 2026-10-18 iOS 从后台回来时数据库连接被断：能认出这类错误，并能重新打开继续读
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { isDbLost, recoverDb } from '../db/recover';

describe('数据库断线恢复', () => {
  it('认得 iOS 的断线错误，不把普通错误当成断线', () => {
    expect(isDbLost(new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError'))).toBe(true);
    expect(isDbLost({ name: 'DatabaseClosedError', message: 'Database has been closed' })).toBe(true);
    expect(isDbLost({ name: 'OpenFailedError', message: 'x', inner: { name: 'UnknownError', message: 'Connection to Indexed Database server lost' } })).toBe(true);
    expect(isDbLost(new TypeError("Cannot read properties of undefined (reading 'title')"))).toBe(false);
  });

  it('连接被关掉后，recoverDb 重新打开，之前的资料还能读到', async () => {
    await db.open();
    await db.settings.put({ id: 'app', lastTripId: 't1' } as never);
    db.close();
    expect(await recoverDb()).toBe(true);
    expect((await db.settings.get('app'))?.lastTripId).toBe('t1');
  });
});
