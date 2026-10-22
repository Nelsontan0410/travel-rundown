// 2026-10-22 AI 分项预算：提示词 → 解析回复 → 按项写入
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { addExpense, applyItemBudgets, saveImport } from '../db/repo';
import { itemBudgetRows, plannedTotal } from '../domain/rules';
import { budgetPrompt, budgetTargets, parseBudgetReply } from '../importer/budgetPlan';
import { parseMd } from '../importer/parseMd';
import { buildPrompt } from '../importer/promptTemplate';

const MD = `# 北海道，日本
- 日期: 13-01-2027 ~ 15-01-2027
- 出发地时区: Asia/Kuala_Lumpur
- 人数: 2

## Day 1 | 13-01-2027 | 札幌 | Asia/Tokyo | 抵达
### [flight] 09:00-15:00 吉隆坡 → 新千岁
- 航班号: MH 88
- 终点: 新千岁机场 | 新千歳空港
### [lodging] 17:00 札幌酒店
- 退房日期: 15-01-2027
### [note] 提醒
- 备注: 带护照
### [meal] 19:00 汤咖喱
- 餐别: 晚餐
## Day 2 | 14-01-2027 | 札幌 | Asia/Tokyo | 逛
### [spot] 10:00 札幌电视塔
### [spot] 14:00 狸小路
`;

async function seed() {
  const tripId = await saveImport(parseMd(MD), MD);
  const trip = (await db.trips.get(tripId))!;
  const days = await db.days.where('tripId').equals(tripId).toArray();
  const items = await db.items.where('tripId').equals(tripId).toArray();
  return { tripId, trip, days, items };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('分项预算：编号与提示词', () => {
  it('按第几天、当天顺序编号，note 不参与', async () => {
    const { days, items } = await seed();
    const t = budgetTargets(days, items);
    expect(t.map((x) => [x.id, x.title])).toEqual([
      ['B01', '吉隆坡 → 新千岁'], ['B02', '札幌酒店'], ['B03', '汤咖喱'], ['B04', '札幌电视塔'], ['B05', '狸小路'],
    ]);
  });

  it('提示词带上人数、币种、编号清单和输出格式；住宿写明晚数', async () => {
    const { trip, days, items } = await seed();
    const p = budgetPrompt(trip, days, items);
    expect(p).toContain('同行 2 人');
    expect(p).toContain('MYR');
    expect(p).toContain('B01 | Day 1 | 机票 | 09:00 | 吉隆坡 → 新千岁 | MH 88');
    expect(p).toContain('共 2 晚');
    expect(p).toContain('# 预算');
    expect(p).not.toContain('提醒'); // note 项不在清单里
  });

  it('行程导入的提示词也要求每一项给预算，且解析器认这个字段', () => {
    const p = buildPrompt();
    expect(p).toContain('- 预算:');
    const r = parseMd(`# 东京，日本\n- 日期: 01-01-2027 ~ 01-01-2027\n- 出发地时区: Asia/Singapore\n## Day 1 | 01-01-2027 | 东京 | Asia/Tokyo\n### [spot] 10:00 X\n- 预算: 30\n`);
    expect(r.days[0].items[0].budget).toBe(3000);
    expect(r.days[0].items[0].meta).toBeUndefined();
  });
});

describe('分项预算：解析 AI 的回复', () => {
  it('标准格式、代码块、RM 前缀、免费、千分位', async () => {
    const { days, items } = await seed();
    const t = budgetTargets(days, items);
    const reply = '```text\n# 预算\n- B01 | 1200 | 往返机票\n- B02 | RM 1,350.50 | 2 晚\n- B03 | 约 90 | 汤咖喱\n- B04 | 免费 | 看外景\n- B05 | 0\n```';
    const r = parseBudgetReply(reply, t);
    expect(r.warnings).toEqual([]);
    expect(r.rows.map((x) => [x.id, x.amount])).toEqual([['B1', 120000], ['B2', 135050], ['B3', 9000], ['B4', 0], ['B5', 0]].map(([a, b]) => [String(a).replace('B', 'B0'), b]));
    expect(r.rows[0].basis).toBe('往返机票');
    expect(r.missing).toEqual([]);
  });

  it('宽容：表格行、冒号写法、带标题、区间取中间值、JSON', async () => {
    const { days, items } = await seed();
    const t = budgetTargets(days, items);
    const r = parseBudgetReply('| B01 | 吉隆坡 → 新千岁 | 1100 | x |\nB2: RM 800\nB03 | 汤咖喱 | 80-120\n', t);
    expect(r.rows.map((x) => x.amount)).toEqual([110000, 80000, 10000]);
    expect(r.warnings.some((w) => /区间/.test(w))).toBe(true);
    expect(r.missing.map((m) => m.id)).toEqual(['B04', 'B05']);

    const j = parseBudgetReply('[{"id":"B04","budget":45},{"id":"B05","budget":"免费","basis":"逛街"}]', t);
    expect(j.rows.map((x) => [x.id, x.amount])).toEqual([['B04', 4500], ['B05', 0]]);
  });

  it('安全：没有的编号、标题对不上（编号错位）、没金额、荒谬金额都跳过并提示', async () => {
    const { days, items } = await seed();
    const t = budgetTargets(days, items);
    const r = parseBudgetReply('- B09 | 50\n- B04 | 东京迪士尼乐园 | 50\n- B05 | 很贵\n- B03 | 99999999999\n- B01 | 300', t);
    expect(r.rows.map((x) => x.id)).toEqual(['B01']);
    expect(r.warnings).toHaveLength(4);
    expect(r.warnings.join('\n')).toMatch(/没有这个编号/);
    expect(r.warnings.join('\n')).toMatch(/对不上/);
    expect(r.warnings.join('\n')).toMatch(/没读到金额/);
    expect(r.warnings.join('\n')).toMatch(/不合理/);
  });

  it('没编号时按标题对（唯一且足够像），否则跳过', async () => {
    const { days, items } = await seed();
    const t = budgetTargets(days, items);
    const r = parseBudgetReply('札幌电视塔 | 40\n某个不存在的地方 | 10', t);
    expect(r.rows.map((x) => [x.id, x.amount])).toEqual([['B04', 4000]]);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('分项预算：写入', () => {
  it('只改 budget，写回 sourceMd；重复写入不算更新；可把总预算设成合计', async () => {
    const { tripId, days, items } = await seed();
    const t = budgetTargets(days, items);
    const r = parseBudgetReply('- B01 | 1200\n- B02 | 1350\n- B03 | 90\n- B04 | 40\n- B05 | 0', t);
    const res = await applyItemBudgets(tripId, r.rows.map((x) => ({ key: x.key, amount: x.amount })), { setTotal: true });
    expect(res).toEqual({ updated: 5, unchanged: 0, total: 268000 });
    const trip = (await db.trips.get(tripId))!;
    expect(trip.budget).toBe(268000);
    expect(trip.sourceMd).toContain('- 预算: 1200');
    expect(trip.sourceMd).toContain('- 预算: 0');
    const after = await db.items.where('tripId').equals(tripId).toArray();
    expect(after.find((i) => i.title === '汤咖喱')).toMatchObject({ budget: 9000, meal: 'dinner' });
    expect(plannedTotal(after)).toBe(268000);
    expect(plannedTotal([{ budget: undefined }])).toBeUndefined();

    const again = await applyItemBudgets(tripId, r.rows.map((x) => ({ key: x.key, amount: x.amount })));
    expect(again).toMatchObject({ updated: 0, unchanged: 5 });
  });

  it('写入后重新导入原文（sourceMd）预算还在', async () => {
    const { tripId, days, items } = await seed();
    await applyItemBudgets(tripId, [{ key: budgetTargets(days, items)[3].key, amount: 4000 }]);
    const md = (await db.trips.get(tripId))!.sourceMd;
    await saveImport(parseMd(md), md, tripId);
    expect((await db.items.where('tripId').equals(tripId).toArray()).find((i) => i.title === '札幌电视塔')!.budget).toBe(4000);
  });

  it('分项预算 vs 已花：按 itemKey 汇总，超支单独标出', async () => {
    const { tripId, days, items } = await seed();
    const t = budgetTargets(days, items);
    await applyItemBudgets(tripId, [{ key: t[2].key, amount: 9000 }, { key: t[3].key, amount: 4000 }]);
    await addExpense({ tripId, date: '2027-01-13', amount: 7000, title: '汤', category: 'meal', itemKey: t[2].key });
    await addExpense({ tripId, date: '2027-01-13', amount: 4000, title: '加点', category: 'meal', itemKey: t[2].key });
    const rows = itemBudgetRows(await db.items.where('tripId').equals(tripId).toArray(), await db.expenses.where('tripId').equals(tripId).toArray());
    expect(rows.map((r) => [r.item.title, r.budget, r.spent, r.over]).sort()).toEqual([['札幌电视塔', 4000, 0, 0], ['汤咖喱', 9000, 11000, 2000]].sort());
  });

  it('导入时每项都带预算、没写总预算 → 总预算 = 各项合计；写了总预算就以它为准', async () => {
    const withItems = MD.replace('### [spot] 10:00 札幌电视塔', '### [spot] 10:00 札幌电视塔\n- 预算: 40').replace('### [spot] 14:00 狸小路', '### [spot] 14:00 狸小路\n- 预算: 0');
    const id1 = await saveImport(parseMd(withItems), withItems);
    expect((await db.trips.get(id1))!.budget).toBe(4000);
    const id2 = await saveImport(parseMd(withItems.replace('- 人数: 2', '- 人数: 2\n- 预算: 5000')), withItems);
    expect((await db.trips.get(id2))!.budget).toBe(500000);
    const id3 = await saveImport(parseMd(MD), MD);
    expect((await db.trips.get(id3))!.budget).toBeUndefined();
  });
});
