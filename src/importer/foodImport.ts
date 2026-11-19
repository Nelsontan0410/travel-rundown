// 2026-11-19 美食专区「AI 批量添加」：App 生成提示词 → 用户贴给自己的 AI → 把回答贴回来 → 解析成美食草稿。
// 不联网、不调 AI；只负责「提示词」和「把文字读成一条条美食」。读不懂的字段留空，不编造。
import { FOOD_CATEGORIES, FOOD_CURRENCIES, FOOD_LIMITS, isFoodCategory, type FoodBudget, type FoodCategory, type FoodDraft } from '../domain/food';

export interface FoodPromptInput {
  /** 旅程名，例如「南宁，中国」 */
  tripTitle: string;
  startDate?: string;
  endDate?: string;
  /** 这份旅程里已经有的美食店名：提示词里让 AI 不要重复 */
  existing?: string[];
  /** 用户额外的要求，例如「找 15 家，口味清淡」 */
  extra?: string;
}

/** 给 AI 的提示词：固定输出格式，强调「高德上的准确店名和地址」，不确定就留空 */
export function buildFoodPrompt(i: FoodPromptInput): string {
  const when = i.startDate && i.endDate ? `（${i.startDate} 至 ${i.endDate}）` : '';
  const have = (i.existing ?? []).filter(Boolean).slice(0, 80);
  return `你是旅行美食顾问。我要去「${i.tripTitle}」${when}，请帮我整理一份值得去的美食清单，我会把你的回答直接粘贴到「旅程 Rundown」App 里批量导入。

我的要求：${i.extra?.trim() || '12 家左右；主食、小吃、饮料、宵夜都要有；本地人也会去的店优先，不要只推游客店。'}
${have.length ? `\n这些我已经有了，请不要重复：${have.join('、')}\n` : ''}
输出格式（一家店一段，严格照抄；整份结果放进一个代码块里，代码块之外不要写别的）：

## 美食名称
- 分类: 主食类 / 小吃类 / 饮料类 / 宵夜类（只能选一个）
- 店名: 高德地图上的准确店名，分店要带分店名，例如 甘家界柠檬鸭(三街两巷水街店)
- 地址: 完整地址，从省 / 市写起，例如 广西壮族自治区南宁市西乡塘区永宁街华兴里1-4号
- 电话:
- 预算: 币种 人均最低-最高，例如 CNY 30-60
- 介绍: 一两句话：招牌菜、口味、什么时候去

规则：
1. 店名和地址要和高德地图上显示的完全一致（我会拿店名去高德搜索导航）。你不确定的店名、地址、电话一律留空，不要编造，也不要用「附近」「某某路一带」这类模糊说法。
2. 能联网搜索就先搜索确认店还在营业、地址没变；已经倒闭的不要推荐。
3. 「美食名称」写菜名或小吃名（如 柠檬鸭、老友粉），不是店名。同一家店有两样招牌，写成两段。
4. 预算只写数字范围和币种代码（CNY、MYR、SGD、HKD、TWD、JPY、KRW、THB、USD、EUR）；不确定就留空。
5. 每个字段只写一行，不要加粗，不要加链接，不要加序号。`;
}

export type FoodWarning = 'noCategory' | 'noShop' | 'noAddress';

export interface ParsedFood {
  draft: FoodDraft;
  /** 读的时候遇到的小问题（导入前显示给用户看） */
  warnings: FoodWarning[];
}

export interface FoodParseResult {
  foods: ParsedFood[];
  /** 没读懂的段落（整段原文的第一行），提示用户 */
  skipped: string[];
}

export const FOOD_WARNING_TEXT: Record<FoodWarning, string> = {
  noCategory: '分类没写，先放「小吃类」',
  noShop: '没写店名，先用美食名称',
  noAddress: '没写地址，导航用不了',
};

const FIELD: Record<string, 'category' | 'shop' | 'address' | 'phone' | 'budget' | 'desc'> = {
  分类: 'category',
  类别: 'category',
  类型: 'category',
  店名: 'shop',
  餐厅: 'shop',
  商家: 'shop',
  店铺: 'shop',
  餐厅名: 'shop',
  地址: 'address',
  位置: 'address',
  电话: 'phone',
  联系电话: 'phone',
  预算: 'budget',
  人均: 'budget',
  价格: 'budget',
  介绍: 'desc',
  简介: 'desc',
  描述: 'desc',
  推荐理由: 'desc',
  说明: 'desc',
  备注: 'desc',
};

const CATEGORY_WORDS: [RegExp, FoodCategory][] = [
  [/宵夜|夜宵|夜市|烧烤|supper|late/i, 'supper'],
  [/饮料|饮品|奶茶|咖啡|茶|果汁|甜品|drink|beverage/i, 'drink'],
  [/小吃|零食|点心|snack/i, 'snack'],
  [/主食|正餐|米粉|面|饭|主菜|main/i, 'main'],
];

function categoryOf(raw: string): FoodCategory | undefined {
  const t = raw.trim();
  if (isFoodCategory(t)) return t;
  for (const c of FOOD_CATEGORIES) if (t.includes(c.label) || t.toLowerCase() === c.en.toLowerCase()) return c.key;
  for (const [re, key] of CATEGORY_WORDS) if (re.test(t)) return key;
  return undefined;
}

const CURRENCY_ALIAS: [RegExp, string][] = [
  [/RMB|CNY|¥|￥|人民币|元|块/i, 'CNY'],
  [/MYR|RM|令吉/i, 'MYR'],
  [/SGD|S\$|新币|新元/i, 'SGD'],
  [/HKD|HK\$|港币|港元/i, 'HKD'],
  [/TWD|NT\$|新台币/i, 'TWD'],
  [/JPY|日元|円/i, 'JPY'],
  [/KRW|₩|韩元/i, 'KRW'],
  [/THB|฿|泰铢/i, 'THB'],
  [/USD|US\$|美元|\$/i, 'USD'],
  [/EUR|€|欧元/i, 'EUR'],
];

/** 「CNY 30-60」「¥30–60」「人均 60 元」「RM 8 起」「50 以内」→ 预算；读不出来返回 undefined。没写币种按 defaultCurrency */
export function parseBudget(raw: string, defaultCurrency = 'CNY'): FoodBudget | undefined {
  const t = raw.replace(/,/g, '').trim();
  if (!t) return undefined;
  const nums = (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return undefined;
  const cur = CURRENCY_ALIAS.find(([re]) => re.test(t))?.[1] ?? defaultCurrency;
  if (!(FOOD_CURRENCIES as readonly string[]).includes(cur)) return undefined;
  if (/起|以上|\+|up/i.test(t) && nums.length === 1) return { currency: cur, min: nums[0] };
  if (/以内|以下|不超过|under|≤/i.test(t) && nums.length === 1) return { currency: cur, max: nums[0] };
  if (nums.length === 1) return { currency: cur, min: nums[0], max: nums[0] };
  const [a, b] = nums;
  return { currency: cur, min: Math.min(a, b), max: Math.max(a, b) };
}

/** 清掉 AI 常加的装饰：加粗、反引号、链接、行首序号 */
const plain = (s: string) =>
  s
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();

/** 空值写法：「无」「—」「未知」「暂无」「空」都当没写 */
const isBlank = (s: string) => !s || /^(无|暂无|没有|未知|不详|—+|-+|空|n\/a|null|none|unknown|待补|待确认)$/i.test(s.trim());

/**
 * 把 AI 的回答读成美食草稿。
 * - 一段 = 一道美食：以「## 名称」（也认 ### / 序号 / 【名称】）开头，后面是「- 字段: 值」。
 * - 外层的代码块围栏、开场白、结尾总结都会被忽略。
 * - 分类不认识 → 小吃类 + 警告；店名没写 → 用美食名称 + 警告；地址没写 → 警告（仍可导入）。
 */
export function parseFoodText(text: string, defaultCurrency = 'CNY'): FoodParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: { title: string; body: string[] }[] = [];
  let cur: { title: string; body: string[] } | null = null;
  const head = /^\s{0,3}(?:#{1,4}\s+|\d{1,2}[.、)）]\s+|【([^】]+)】\s*$)(.*)$/;
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) continue;
    const h = raw.match(head);
    const isField = /^\s*(?:[-*•·]\s*)?\**\s*[一-鿿A-Za-z]{1,6}\s*\**\s*[:：]/.test(raw) && !/^\s*#/.test(raw);
    if (h && !(isField && /^\s{0,3}\d{1,2}[.、)）]/.test(raw) && !h[2])) {
      const title = plain((h[1] ?? h[2] ?? '').replace(/^[:：]\s*/, ''));
      if (title) {
        cur = { title, body: [] };
        blocks.push(cur);
        continue;
      }
    }
    if (cur) cur.body.push(raw);
  }

  const foods: ParsedFood[] = [];
  const skipped: string[] = [];
  for (const b of blocks) {
    const f: Partial<Record<'category' | 'shop' | 'address' | 'phone' | 'budget' | 'desc', string>> = {};
    let last: keyof typeof f | undefined;
    for (const raw of b.body) {
      const m = raw.match(/^\s*(?:[-*•·]\s*)?\**\s*([一-鿿A-Za-z]{1,6})\s*\**\s*[:：]\s*(.*)$/);
      const key = m ? FIELD[m[1].trim()] : undefined;
      if (m && key) {
        f[key] = plain(m[2]);
        last = key;
      } else if (last === 'desc' && raw.trim()) {
        f.desc = `${f.desc ?? ''}\n${plain(raw.replace(/^\s*[-*•·]\s*/, ''))}`.trim();
      }
    }
    const name = Array.from(b.title).slice(0, FOOD_LIMITS.name).join('');
    if (!Object.keys(f).length) {
      skipped.push(b.title);
      continue;
    }
    const warnings: FoodWarning[] = [];
    const category = (f.category && categoryOf(f.category)) || undefined;
    if (!category) warnings.push('noCategory');
    const shop = f.shop && !isBlank(f.shop) ? f.shop : '';
    if (!shop) warnings.push('noShop');
    const address = f.address && !isBlank(f.address) ? f.address : '';
    if (!address) warnings.push('noAddress');
    const phone = f.phone && !isBlank(f.phone) && /^[+\d][\d\s\-()+#*.,/]*$/.test(f.phone.trim()) ? f.phone.trim() : undefined;
    const budget = f.budget && !isBlank(f.budget) ? parseBudget(f.budget, defaultCurrency) : undefined;
    const draft: FoodDraft = {
      name,
      category: category ?? 'snack',
      restaurantName: Array.from(shop || name).slice(0, FOOD_LIMITS.restaurant).join(''),
      address: Array.from(address).slice(0, FOOD_LIMITS.address).join(''),
      ...(phone ? { phone: Array.from(phone).slice(0, FOOD_LIMITS.phone).join('') } : {}),
      ...(budget ? { budget } : {}),
      ...(f.desc && !isBlank(f.desc) ? { description: f.desc.slice(0, FOOD_LIMITS.description) } : {}),
    };
    foods.push({ draft, warnings });
  }
  return { foods, skipped };
}
