// 2026-10-22 分项预算：让外部 AI 给「已导入的行程」里每一项估一个预算，再把结果贴回来，按项写入。
// 和行程导入分开，只改 Item.budget，不动行程内容；按编号（B01…）对应，编号对不上标题的行会跳过并提示。
// 解析器宽容：「- B01 | 40 | 依据」「B01: RM 40」「Markdown 表格行」「JSON 数组」都认。
import type { Day, Item, Trip } from '../domain/types';
import { MEAL_LABEL, TYPE_LABEL } from '../domain/rules';
import { parseMoney } from '../domain/format';
import { similarity } from './diff';

/** 参与估价的一项：note（其他提醒）不估价 */
export interface BudgetTarget {
  id: string; // B01、B02…
  key: string; // Item.key，写入时用它找到这一项
  itemId: string;
  dayIndex: number;
  date: string;
  type: Item['type'];
  title: string;
  /** 现有预算（分）；没有为 undefined */
  current?: number;
}

/** 按「第几天 → 当天顺序」给每一项编号。编号只和当前行程有关，行程变了要重新复制提示词 */
export function budgetTargets(days: Day[], items: Item[]): BudgetTarget[] {
  const dayById = new Map(days.map((d) => [d.id, d]));
  const sorted = items
    .filter((i) => i.type !== 'note' && dayById.has(i.dayId))
    .sort((a, b) => dayById.get(a.dayId)!.index - dayById.get(b.dayId)!.index || a.order - b.order);
  return sorted.map((it, i) => {
    const d = dayById.get(it.dayId)!;
    return {
      id: `B${String(i + 1).padStart(2, '0')}`,
      key: it.key,
      itemId: it.id,
      dayIndex: d.index,
      date: d.date,
      type: it.type,
      title: it.title,
      current: it.budget,
    };
  });
}

const dmy = (iso: string) => iso.split('-').reverse().join('-');
const money = (sen: number) => (sen / 100).toFixed(2).replace(/\.00$/, '');

/** 提示词里每一项的一行：编号 | 第几天 | 类型 | 时间 | 标题 | 补充信息 */
function describe(t: BudgetTarget, it: Item, day: Day): string {
  const more: string[] = [];
  if (it.place?.name && it.place.name !== it.title) more.push(it.place.name);
  if (it.type === 'flight') {
    if (it.flight?.number) more.push(it.flight.number);
    if (it.toPlace?.name) more.push(`→ ${it.toPlace.name}`);
  }
  if (it.type === 'lodging') {
    const inn = it.lodging?.checkIn ?? day.date;
    if (it.lodging?.checkOut) {
      const nights = Math.max(1, Math.round((Date.parse(`${it.lodging.checkOut}T00:00:00Z`) - Date.parse(`${inn}T00:00:00Z`)) / 86400000));
      more.push(`${dmy(inn)} 入住，${dmy(it.lodging.checkOut)} 退房，共 ${nights} 晚`);
    }
    if (it.lodging?.roomType) more.push(it.lodging.roomType);
  }
  if (it.type === 'transit') {
    if (it.transit?.mode) more.push(it.transit.mode);
    if (it.toPlace?.name) more.push(`→ ${it.toPlace.name}`);
  }
  if (it.type === 'meal' && it.meal) more.push(MEAL_LABEL[it.meal]);
  if (it.bookingStatus === 'confirmed') more.push('已订');
  if (t.current !== undefined) more.push(`现有预算 ${money(t.current)}`);
  return [t.id, `Day ${t.dayIndex}`, TYPE_LABEL[t.type], it.start ?? '', t.title, ...more].join(' | ');
}

/** 给外部 AI 的提示词：按编号逐项估价，只输出「# 预算」代码块 */
export function budgetPrompt(trip: Pick<Trip, 'title' | 'destination' | 'startDate' | 'endDate' | 'participants' | 'budget'>, days: Day[], items: Item[]): string {
  const targets = budgetTargets(days, items);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const dayById = new Map(days.map((d) => [d.id, d]));
  const people = trip.participants ? `${trip.participants} 人` : '人数没有写，请按 1 人估算，并在「依据」里注明';
  const lines = targets.map((t) => describe(t, itemById.get(t.itemId)!, dayById.get(itemById.get(t.itemId)!.dayId)!));
  return `你是旅行预算助手。下面是我已经规划好的行程，请你给每一项估一个预估花费，我会把结果贴回「旅程 Rundown」App 自动写进每一项的预算。

【旅程】${trip.destination || trip.title}，${dmy(trip.startDate)} ~ ${dmy(trip.endDate)}，同行 ${people}${trip.budget !== undefined ? `，我给自己定的总预算是 ${money(trip.budget)} MYR（供你参考，不必凑够）` : ''}

【怎么估】
1. 金额单位一律是马币 MYR（令吉），只写数字，不要写货币符号。当地货币请按你知道的近似汇率换算，不用查实时汇率，也不要为此停下来问我。
2. 金额 = 这一项「全部同行人合计」的预估花费，不是人均。
3. 免费的（公园、步行、逛街不进店等）写 0。不要留空，每一项都要有一行。
4. 住宿只会出现在入住那一项：写整个入住期间的总房费，不要每晚重复。
5. 机票写全部同行人的合计；交通写这一段全部人的车费（租车、包车写整段）；餐饮按当地大众消费水平估，没有写具体店就按中等价位。
6. 景点按门票和必要的体验费估（不含纪念品）。有「已订」的项也照常估。
7. 有「现有预算」的项，没有明显不合理就保持原值。
8. 宁可略高估，也不要漏掉必要花费；不要编造官方价格，估不准就给一个合理的中间值。

【我的行程】格式：编号 | 第几天 | 类型 | 开始时间 | 标题 | 补充信息
${lines.join('\n')}

【输出格式】把整份结果放进一个代码块（三个反引号加 text 开头的代码块）里输出，代码块之外不要写任何解释。第一行写「# 预算」，之后每一项一行，编号和顺序原样保留，不要增删或改编号：

# 预算
- B01 | 金额 | 依据（一句话，例如：成人票约 1000 日元/人 × 2 人）
- B02 | 金额 | 依据
`;
}

export interface BudgetRow {
  id: string;
  key: string;
  itemId: string;
  title: string;
  dayIndex: number;
  /** 分 */
  amount: number;
  /** 这一项现有的预算（分）；没有为 undefined */
  current?: number;
  /** AI 写的依据，只在预览里给用户看，不存 */
  basis?: string;
}

export interface BudgetParseResult {
  rows: BudgetRow[];
  /** 读不懂或对不上、被跳过的行，给用户看 */
  warnings: string[];
  /** 提示词里有、但 AI 没给的项（保持原样，不会被改） */
  missing: BudgetTarget[];
}

const MAX_SEN = 50_000_000; // 单项 RM 500,000 以上视为写错

/** 「RM 40」「约 40」「1,200.50」「免费」「80-120」→ 分；不是金额返回 undefined。区间取中间值并提示 */
function readAmount(raw: string): { sen: number; range?: boolean } | undefined {
  const s = raw.trim().replace(/^[约≈~大概]+\s*/, '').replace(/[（(].*[）)]$/, '').trim();
  if (/^(免费|free|0)$/i.test(s)) return { sen: 0 };
  const one = parseMoney(s);
  if (one !== null) return { sen: one };
  const r = s.replace(/(RM|MYR|令吉|马币|,|，)/gi, '').match(/^(\d+(?:\.\d{1,2})?)\s*[-–—~～至到]\s*(\d+(?:\.\d{1,2})?)$/);
  if (r) return { sen: Math.round(((parseFloat(r[1]) + parseFloat(r[2])) / 2) * 100), range: true };
  return undefined;
}

type Raw = { id?: string; cells: string[]; text: string };

function fromJson(text: string): Raw[] | null {
  const t = text.trim();
  if (!t.startsWith('[') && !t.startsWith('{')) return null;
  try {
    const data = JSON.parse(t) as unknown;
    const list = Array.isArray(data) ? data : (Object.values(data as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? [];
    return list
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((o) => {
        const pick = (...ks: string[]) => ks.map((k) => Object.entries(o).find(([kk]) => kk.toLowerCase() === k)?.[1]).find((v) => v !== undefined && v !== null);
        const id = pick('id', '编号');
        const amount = pick('budget', 'amount', 'cost', 'price', '预算', '金额');
        const basis = pick('basis', 'note', 'reason', '依据', '备注');
        const title = pick('title', '标题');
        return { id: id === undefined ? undefined : String(id), cells: [title, amount, basis].filter((v) => v !== undefined).map(String), text: '' };
      });
  } catch {
    return null;
  }
}

function fromText(text: string): Raw[] {
  const out: Raw[] = [];
  for (const line0 of text.replace(/```[a-z]*/gi, '').split(/\r?\n/)) {
    let line = line0.trim().replace(/^[-*•·]\s*/, '').replace(/^\|/, '').replace(/\|$/, '').trim();
    if (!line || /^#/.test(line) || /^[-:| ]+$/.test(line)) continue;
    const m = line.match(/^(B\d{1,3})\s*(?:[|｜:：\t,，.、)）]\s*)?(.*)$/i);
    if (m) {
      line = m[2];
      out.push({ id: normId(m[1]), cells: line.split(/\s*[|｜\t]\s*/).map((c) => c.trim()).filter(Boolean), text: line });
    } else {
      out.push({ cells: line.split(/\s*[|｜\t]\s*/).map((c) => c.trim()).filter(Boolean), text: line });
    }
  }
  return out;
}

function normId(id: string): string {
  return `B${Number(id.replace(/\D/g, ''))}`;
}

/** 把 AI 的回复读成「每一项的预算」。targets 来自当前行程（budgetTargets），保证编号对应的是现在的行程 */
export function parseBudgetReply(text: string, targets: BudgetTarget[]): BudgetParseResult {
  const raws = fromJson(text) ?? fromText(text);
  const byId = new Map(targets.map((t) => [normId(t.id), t]));
  const rows = new Map<string, BudgetRow>();
  const warnings: string[] = [];

  raws.forEach((raw, idx) => {
    const label = raw.id ?? `第 ${idx + 1} 行`;
    // 金额：第一个读得出金额的单元格；没有分隔线时用开头的金额
    let amt: ReturnType<typeof readAmount>;
    let amtCell = -1;
    for (let i = 0; i < raw.cells.length && !amt; i++) {
      const a = readAmount(raw.cells[i]);
      if (a) {
        amt = a;
        amtCell = i;
      }
    }
    if (!amt) {
      const lead = raw.text.match(/^(?:约|≈|~)?\s*(?:RM|MYR)?\s*(\d[\d,]*(?:\.\d{1,2})?)/i);
      if (lead) amt = readAmount(lead[1]);
    }
    if (!amt) {
      if (raw.cells.length) warnings.push(`${label}：没读到金额，已跳过`);
      return;
    }
    if (amt.sen > MAX_SEN) {
      warnings.push(`${label}：金额大得不合理，已跳过`);
      return;
    }

    // 对应哪一项：优先编号；没有编号就用标题（必须唯一且足够像）
    // 标题只可能写在金额前面（「B01 | 札幌电视塔 | 40」）；金额后面的是依据，不当标题用
    const titleCells = amtCell >= 0 ? raw.cells.slice(0, amtCell) : [];
    const afterCells = amtCell >= 0 ? raw.cells.slice(amtCell + 1) : raw.cells.slice(1);
    let target = raw.id ? byId.get(normId(raw.id)) : undefined;
    if (raw.id && !target) {
      warnings.push(`${label}：行程里没有这个编号，已跳过`);
      return;
    }
    if (target) {
      // 写了标题但和编号对应的完全不像 → 多半是编号错位，跳过比写错更安全
      const named = titleCells.find((c) => !readAmount(c) && c.length <= 40);
      if (named && similarity(named, target.title) < 0.2 && !target.title.includes(named) && !named.includes(target.title)) {
        warnings.push(`${label}：标题「${named}」和行程里的「${target.title}」对不上，已跳过（可能编号错位）`);
        return;
      }
    } else {
      const cand = titleCells
        .filter((c) => !readAmount(c))
        .flatMap((c) => targets.map((t) => ({ t, s: similarity(c, t.title) })))
        .filter((x) => x.s >= 0.6)
        .sort((a, b) => b.s - a.s);
      if (!cand.length || (cand[1] && cand[1].s === cand[0].s && cand[1].t.key !== cand[0].t.key)) {
        warnings.push(`${label}：没有编号，也对不上唯一的一项，已跳过`);
        return;
      }
      target = cand[0].t;
    }

    if (amt.range) warnings.push(`${target.id}：AI 给的是区间，已取中间值`);
    if (rows.has(target.key)) warnings.push(`${target.id}：出现多次，以最后一次为准`);
    const basis = afterCells.find((c) => !readAmount(c));
    rows.set(target.key, {
      id: target.id,
      key: target.key,
      itemId: target.itemId,
      title: target.title,
      dayIndex: target.dayIndex,
      amount: amt.sen,
      current: target.current,
      ...(basis ? { basis } : {}),
    });
  });

  const got = new Set(rows.keys());
  return { rows: [...rows.values()], warnings, missing: targets.filter((t) => !got.has(t.key)) };
}
