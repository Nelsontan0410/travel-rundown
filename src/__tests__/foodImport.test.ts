import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buildFoodPrompt, parseBudget, parseFoodText } from '../importer/foodImport';
import { addFoodEntries } from '../db/food';
import { db } from '../db/schema';

const SAMPLE = `好的，这是清单：
\`\`\`
## 柠檬鸭
- 分类: 主食类
- 店名: 甘家界柠檬鸭(三街两巷水街店)
- 地址: 广西壮族自治区南宁市西乡塘区永宁街华兴里1-4号
- 电话: 0771-1234567
- 预算: CNY 60-90
- 介绍: 招牌酸爽。
  晚餐前去。

### **老友粉**
- 类别：小吃
- 餐厅：**某某粉店**
- 地址：无
- 电话：未知
- 预算：人均 25 元

## 椰子冻
- 分类: 奶茶
- 介绍: 清凉
\`\`\`
祝旅途愉快`;

describe('AI 批量添加美食', () => {
  it('提示词带旅程信息和已有店', () => {
    const p = buildFoodPrompt({ tripTitle: '南宁，中国', startDate: '2027-01-01', endDate: '2027-01-05', existing: ['A店'], extra: '15 家' });
    expect(p).toContain('南宁，中国');
    expect(p).toContain('A店');
    expect(p).toContain('15 家');
  });
  it('读出多道美食、容忍装饰和空值', () => {
    const r = parseFoodText(SAMPLE);
    expect(r.foods).toHaveLength(3);
    const [a, b, c] = r.foods;
    expect(a.draft).toMatchObject({ name: '柠檬鸭', category: 'main', restaurantName: '甘家界柠檬鸭(三街两巷水街店)', phone: '0771-1234567', budget: { currency: 'CNY', min: 60, max: 90 } });
    expect(a.draft.description).toContain('晚餐前去');
    expect(a.warnings).toEqual([]);
    expect(b.draft).toMatchObject({ name: '老友粉', category: 'snack', restaurantName: '某某粉店', address: '', budget: { currency: 'CNY', min: 25, max: 25 } });
    expect(b.draft.phone).toBeUndefined();
    expect(b.warnings).toEqual(['noAddress']);
    expect(c.draft).toMatchObject({ category: 'drink', restaurantName: '椰子冻' });
    expect(c.warnings).toEqual(['noShop', 'noAddress']);
  });
  it('预算写法', () => {
    expect(parseBudget('RM 8 起')).toEqual({ currency: 'MYR', min: 8 });
    expect(parseBudget('¥30–60')).toEqual({ currency: 'CNY', min: 30, max: 60 });
    expect(parseBudget('50 以内', 'SGD')).toEqual({ currency: 'SGD', max: 50 });
    expect(parseBudget('不详')).toBeUndefined();
  });
  it('批量写入：地址可空、顺序递增', async () => {
    await db.foodEntries.clear();
    const r = parseFoodText(SAMPLE);
    expect(await addFoodEntries('t1', r.foods.map((f) => f.draft))).toBe(3);
    const all = (await db.foodEntries.where('tripId').equals('t1').toArray()).sort((x, y) => x.order - y.order);
    expect(all.map((f) => f.name)).toEqual(['柠檬鸭', '老友粉', '椰子冻']);
    expect(all[1].address).toBe('');
    expect(all[2].restaurantName).toBe('椰子冻');
  });
});
