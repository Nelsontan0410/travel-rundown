// 2026-10-22：每个行程项的预算（Item.budget，分）：导入三种格式、写回 MD、重新导入保留、预览不误报
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { saveImport, updateItem } from '../db/repo';
import { diffImport, flattenParsed, type DiffOldItem } from '../importer/diff';
import { parseMd } from '../importer/parseMd';
import { tripToMd } from '../importer/serialize';
import { parseCsvImport, parseJsonImport } from '../importer/structured';

const MD = `# 北海道，日本
- 日期: 13-01-2027 ~ 14-01-2027
- 出发地时区: Asia/Kuala_Lumpur
- 预算: 8000
- 人数: 2

## Day 1 | 13-01-2027 | 札幌 | Asia/Tokyo | 抵达
### [spot] 09:00-11:00 札幌电视塔
- 预算: 40
### [meal] 12:00-13:00 汤咖喱
- 餐别: 午餐
- 预算: RM 98.50
### [note] 提醒
- 预算: 免费
### [spot] 15:00 大通公园
- 预算: 大概一百
## Day 2 | 14-01-2027 | 札幌 | Asia/Tokyo | 逛街
### [spot] 10:00 狸小路
`;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('行程项预算：MD', () => {
  it('读成分；免费 = 0；写不成数字的忽略并提示；没写的保持 undefined', () => {
    const r = parseMd(MD);
    const [a, b, c, d] = r.days[0].items;
    expect(a.budget).toBe(4000);
    expect(b.budget).toBe(9850);
    expect(c.budget).toBe(0);
    expect(d.budget).toBeUndefined();
    expect(r.days[1].items[0].budget).toBeUndefined();
    expect(r.warnings.some((w) => /预算只能写数字/.test(w.message))).toBe(true);
    // 不再掉进「其他信息」
    expect(a.meta).toBeUndefined();
    expect(r.trip.budget).toBe(800000);
  });

  it('写回 MD 再读回来一样（含 0）', () => {
    const r = parseMd(MD);
    const trip = { id: 't', ...r.trip, translate: { app: 'google-translate', from: 'auto', to: 'zh-CN' }, sourceMd: MD, importedAt: '', updatedAt: '' } as never;
    const days = r.days.map((d, i) => ({ id: `d${i}`, tripId: 't', index: d.index, date: d.date, tz: d.tz, city: d.city, title: d.title, note: d.note }));
    const items = r.days.flatMap((d, i) => d.items.map((it, j) => ({ ...it, id: `i${i}-${j}`, tripId: 't', dayId: `d${i}` }))) as never;
    const { md } = tripToMd(trip, days, items);
    const back = parseMd(md);
    expect(back.days[0].items.map((i) => i.budget)).toEqual([4000, 9850, 0, undefined]);
  });
});

describe('行程项预算：JSON / CSV', () => {
  it('JSON：activity 里的 budget / cost 都认', () => {
    const json = JSON.stringify({
      trip: { title: '北海道，日本', startDate: '2027-01-13', endDate: '2027-01-13', timezone: 'Asia/Kuala_Lumpur', budget: 5000 },
      days: [{ date: '2027-01-13', city: '札幌', timezone: 'Asia/Tokyo', activities: [
        { type: 'spot', title: '札幌电视塔', time: '09:00-10:00', budget: 40 },
        { type: 'meal', title: '汤咖喱', time: '12:00-13:00', cost: '98.5' },
      ] }],
    });
    const { result } = parseJsonImport(json);
    expect(result.errors).toEqual([]);
    expect(result.trip.budget).toBe(500000);
    expect(result.days[0].items.map((i) => i.budget)).toEqual([4000, 9850]);
  });

  it('CSV：budget 列仍是旅程总预算，item_budget / cost 列是每项预算', () => {
    const csv = `trip_title,trip_start,trip_end,home_timezone,budget,day,date,city,timezone,type,start,end,title,item_budget
北海道，日本,13-01-2027,13-01-2027,Asia/Kuala_Lumpur,5000,1,13-01-2027,札幌,Asia/Tokyo,spot,09:00,10:00,札幌电视塔,40
,,,,,1,13-01-2027,札幌,Asia/Tokyo,meal,12:00,13:00,汤咖喱,98.5
`;
    const { result } = parseCsvImport(csv);
    expect(result.errors).toEqual([]);
    expect(result.trip.budget).toBe(500000);
    expect(result.days[0].items.map((i) => i.budget)).toEqual([4000, 9850]);
  });
});

describe('行程项预算：重新导入', () => {
  it('新导入没写预算就沿用原来的；写了就以新的为准', async () => {
    const tripId = await saveImport(parseMd(MD), MD);
    const first = await db.items.where('tripId').equals(tripId).toArray();
    const tower = first.find((i) => i.title === '札幌电视塔')!;
    const shop = first.find((i) => i.title === '狸小路')!;
    expect(tower.budget).toBe(4000);
    expect(shop.budget).toBeUndefined();
    await updateItem(shop.id, { budget: 12000 }); // 例如之前用 AI 补过

    const md2 = MD.replace('- 预算: 40\n', '').replace('- 预算: RM 98.50', '- 预算: 120');
    await saveImport(parseMd(md2), md2, tripId);
    const again = await db.items.where('tripId').equals(tripId).toArray();
    expect(again.find((i) => i.title === '札幌电视塔')!.budget).toBe(4000); // 没写 → 沿用
    expect(again.find((i) => i.title === '汤咖喱')!.budget).toBe(12000); // 写了 → 新的
    expect(again.find((i) => i.title === '狸小路')!.budget).toBe(12000); // 之前补的 → 沿用
  });

  it('预览：新导入没写预算不算改动；改了数才算', () => {
    const parsed = parseMd(MD);
    const nu = flattenParsed(parsed.days);
    const old: DiffOldItem[] = nu.map((i) => ({ ...i, hasUserData: false }));
    const noBudget = nu.map((i) => ({ ...i, budget: undefined }));
    expect(diffImport(old, noBudget).changed).toEqual([]);
    const changed = nu.map((i) => (i.title === '札幌电视塔' ? { ...i, budget: 5000 } : i));
    const d = diffImport(old, changed);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].fields).toContain('预算');
  });
});
