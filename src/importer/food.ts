// 2026-10-21 美食专区：导入美食清单（AI 整理好的 Markdown，或 JSON 数组）。
// 和行程导入分开，不会改动行程；按「店名 + 城市」合并（见 db/food.ts importFoods）。
import { FOOD_KIND_LABEL, MEAL_LABEL, type FoodInput, type FoodKind } from '../domain/food';
import type { MealKind } from '../domain/types';

export interface FoodParseResult {
  rows: FoodInput[];
  /** 读不懂的行，给用户看（行号从 1 开始） */
  warnings: string[];
}

const KIND_WORDS: [RegExp, FoodKind][] = [
  [/^(正餐|餐厅|料理|meal|restaurant)$/i, 'meal'],
  [/^(小吃|街头小吃|snack|street ?food)$/i, 'snack'],
  [/^(甜品|甜点|dessert|sweets?)$/i, 'dessert'],
  [/^(咖啡|茶|咖啡\s*\/\s*茶|咖啡店|cafe|café|coffee|tea)$/i, 'cafe'],
  [/^(酒馆|酒吧|居酒屋|bar|izakaya)$/i, 'bar'],
  [/^(市场|美食街|市场\s*\/\s*美食街|夜市|market|food ?court)$/i, 'market'],
];

const MEAL_WORDS: [RegExp, MealKind][] = [
  [/早餐|早饭|早上|breakfast/i, 'breakfast'],
  [/午餐|午饭|中午|lunch/i, 'lunch'],
  [/晚餐|晚饭|晚上|dinner/i, 'dinner'],
  [/点心|下午茶|宵夜|小食|snack/i, 'snack'],
];

export function kindOf(s: string): FoodKind | undefined {
  const t = s.trim();
  for (const [re, k] of KIND_WORDS) if (re.test(t)) return k;
  const hit = (Object.entries(FOOD_KIND_LABEL) as [FoodKind, string][]).find(([, label]) => label === t);
  return hit?.[0];
}

export function mealsOf(s: string): MealKind[] {
  if (/都可以|不限|全天|any/i.test(s)) return [];
  return MEAL_WORDS.filter(([re]) => re.test(s)).map(([, m]) => m);
}

const split = (s: string) => s.split(/[；;、,，\n]/).map((x) => x.trim()).filter(Boolean);
const pair = (s: string): [string, string | undefined] => {
  const [a, b] = s.split(/\s*[|｜]\s*/);
  return [a.trim(), b?.trim() || undefined];
};
const yes = (s: string) => /^(是|要|需要|需|yes|y|true|必须|建议)/i.test(s.trim());

/** 第几天：「1、3」「Day 2」「第2天」→ Day.index（和行程 Day N 一样从 1 开始） */
function dayIndexesOf(s: string): number[] {
  return [...s.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n >= 1);
}

function kindFromJson(s: string | undefined): FoodKind {
  if (!s) return 'meal';
  if (s in FOOD_KIND_LABEL) return s as FoodKind;
  return kindOf(s) ?? 'meal';
}

function fromJson(text: string): FoodParseResult | null {
  const t = text.trim();
  if (!t.startsWith('[') && !t.startsWith('{')) return null;
  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch {
    return { rows: [], warnings: ['JSON 格式不对，读不出来'] };
  }
  const list = Array.isArray(data) ? data : Array.isArray((data as { foods?: unknown })?.foods) ? (data as { foods: unknown[] }).foods : null;
  if (!list) return { rows: [], warnings: ['JSON 应该是一个数组 [ … ]，或者 { "foods": [ … ] }'] };
  const rows: FoodInput[] = [];
  const warnings: string[] = [];
  list.forEach((x, i) => {
    if (!x || typeof x !== 'object') {
      warnings.push(`第 ${i + 1} 项不是对象，已跳过`);
      return;
    }
    const o = x as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : typeof o[k] === 'number' ? String(o[k]) : undefined);
    const arr = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).map(String) : str(k) ? split(str(k)!) : undefined);
    const name = str('name');
    if (!name) {
      warnings.push(`第 ${i + 1} 项没有 name，已跳过`);
      return;
    }
    const meals = Array.isArray(o.meals) ? (o.meals as unknown[]).flatMap((m) => (String(m) in MEAL_LABEL ? [String(m) as MealKind] : mealsOf(String(m)))) : str('meals') ? mealsOf(str('meals')!) : undefined;
    const days = Array.isArray(o.days) ? (o.days as unknown[]).map((n) => Number(n)) : str('days') ? dayIndexesOf(str('days')!) : undefined;
    rows.push({
      name,
      place: { name, localName: str('localName'), address: str('address'), localAddress: str('localAddress') },
      city: str('city'),
      kind: kindFromJson(str('kind')),
      cuisine: str('cuisine'),
      meals,
      mustTry: arr('mustTry'),
      price: str('price'),
      hours: str('hours'),
      reserve: o.reserve === true || (typeof o.reserve === 'string' && yes(o.reserve)),
      url: str('url'),
      note: str('note'),
      dayIndexes: days,
    });
  });
  return { rows, warnings };
}

/**
 * Markdown 格式（和行程导入同一种写法）：
 *   ## 札幌                      ← 城市（可选，下面的店都算这个城市）
 *   ### [正餐] 店名 | 当地店名    ← 类型可省略，默认正餐
 *   - 菜系: 拉面
 *   - 适合: 午餐、晚餐
 *   - 地址: 中文地址 | 当地地址
 *   - 必吃: 味噌拉面；煎饺
 *   - 价位 / 营业 / 预约 / 链接 / 第几天 / 城市 / 备注
 */
export function parseFoodMd(text: string): FoodParseResult {
  const json = fromJson(text);
  if (json) return json;
  const rows: FoodInput[] = [];
  const warnings: string[] = [];
  let city: string | undefined;
  let cur: FoodInput | null = null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const flush = () => {
    if (cur) rows.push(cur);
    cur = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.+)$/))) {
      flush();
      let head = m[1].trim();
      let kind: FoodKind = 'meal';
      const k = head.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (k) {
        const kk = kindOf(k[1]);
        if (kk) kind = kk;
        else warnings.push(`第 ${i + 1} 行：不认识的类型「${k[1]}」，按正餐处理`);
        head = k[2];
      }
      const [name, localName] = pair(head);
      if (!name) {
        warnings.push(`第 ${i + 1} 行：没有店名，已跳过`);
        return;
      }
      cur = { name, kind, city, place: { name, localName } };
      return;
    }
    if ((m = line.match(/^##\s+(.+)$/))) {
      flush();
      const c = m[1].trim();
      city = /^(美食|美食清单|美食专区|美食备选|food)/i.test(c) ? undefined : c;
      return;
    }
    if (/^#\s/.test(line)) {
      flush();
      return;
    }
    const f = line.match(/^[-*•]\s*([^:：]+)[:：]\s*(.*)$/);
    if (!f) return;
    if (!cur) {
      warnings.push(`第 ${i + 1} 行：不在任何一家店下面，已忽略`);
      return;
    }
    const c: FoodInput = cur;
    const key = f[1].trim();
    const val = f[2].trim();
    if (!val) return;
    if (/^(菜系|菜式|料理|cuisine)$/i.test(key)) c.cuisine = val;
    else if (/^(类型|种类|kind)$/i.test(key)) c.kind = kindOf(val) ?? c.kind;
    else if (/^(适合|餐别|时段|meals?)$/i.test(key)) c.meals = mealsOf(val);
    else if (/^(地址|address)$/i.test(key)) {
      const [a, b] = pair(val);
      c.place = { ...c.place!, address: a, localAddress: b };
    } else if (/^(当地地址)$/.test(key)) c.place = { ...c.place!, localAddress: val };
    else if (/^(当地名称|当地店名|原名)$/.test(key)) c.place = { ...c.place!, localName: val };
    else if (/^(必吃|推荐|招牌|mustTry|must try)$/i.test(key)) c.mustTry = split(val);
    else if (/^(价位|价格|人均|预算|price)$/i.test(key)) c.price = val;
    else if (/^(营业|营业时间|时间|定休|定休日|hours)$/i.test(key)) c.hours = c.hours ? `${c.hours}；${val}` : val;
    else if (/^(预约|订位|reserve)$/i.test(key)) c.reserve = yes(val);
    else if (/^(链接|网址|url|link)$/i.test(key)) c.url = val;
    else if (/^(第几天|天|日子|days?)$/i.test(key)) c.dayIndexes = dayIndexesOf(val);
    else if (/^(城市|区域|city)$/i.test(key)) c.city = val;
    else if (/^(备注|说明|note)$/i.test(key)) c.note = c.note ? `${c.note}\n${val}` : val;
    else c.note = c.note ? `${c.note}\n${key}：${val}` : `${key}：${val}`;
  });
  flush();
  if (!rows.length && !warnings.length) warnings.push('没有读到任何店。每家店用「### 店名」开头，详见模板。');
  return { rows, warnings };
}

/** 给外部 AI 的提示词：让它按行程整理一份备选美食清单 */
export function foodPrompt(opts: { destination: string; cities: string[]; days: number }): string {
  const cities = opts.cities.length ? opts.cities.join('、') : opts.destination;
  return `我要去「${opts.destination}」旅行 ${opts.days} 天，会经过：${cities}。
请帮我整理一份「备选美食清单」，用于原定的餐吃不成时临时替换。每个城市 5–10 家，覆盖早餐、午餐、晚餐和小吃，尽量选不用提前很久预约、营业时间长、离热门景点或车站近的店。

只输出下面这种 Markdown，不要别的说明：

## 城市名
### [正餐] 店名中文 | 当地语言店名
- 菜系: 拉面
- 适合: 午餐、晚餐
- 地址: 中文地址 | 当地语言地址
- 必吃: 菜名一；菜名二
- 价位: 每人大约多少（当地货币）
- 营业: 11:00–21:00，周三休
- 预约: 不用 / 需要
- 第几天: 1、3（行程第几天在这个城市，可省略）
- 备注: 排队情况、付款方式、注意事项

类型只能用：${Object.values(FOOD_KIND_LABEL).join('、')}。
适合只能用：${Object.values(MEAL_LABEL).join('、')}。
不确定的信息就省略那一行，不要编造。`;
}
