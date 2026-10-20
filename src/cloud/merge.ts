// 2026-10-18 同步：同伴套用主用户新版本时的三方合并。纯函数。
// base = 同伴上次套用的版本；local = 同伴手机上现在的样子（可能有自己的修改）；incoming = 主用户的新版本。
// 每一项按 id 判断：
//   · 只有主用户改了 → 用主用户的
//   · 只有自己改了（或自己新增的）→ 保留自己的，等以后自己决定要不要提交成建议
//   · 两边都改了同一项，而且改得不一样 → 冲突，由同伴逐项选「保留我的」或「用主用户的」（默认用主用户的）
// 每天按「第几天」对应；旅程资料（名称、日期、预算…）一律用主用户的。
import { makeItemKey } from '../domain/itemKey';
import type { Day, Item } from '../domain/types';
import { ITEM_FIELD_LABEL, reorderedDays, sameDay, sameItem, stable, type TripSnapshot } from './snapshot';

export type Choice = 'mine' | 'theirs';

export interface Conflict {
  id: string;
  title: string;
  dayIndex?: number;
  /** 自己这边：undefined 表示自己删掉了 */
  mine?: Item;
  /** 主用户这边：undefined 表示主用户删掉了 */
  theirs?: Item;
  fields: string[];
}

export interface MergeResult {
  days: Day[];
  items: Item[];
  conflicts: Conflict[];
  /** 保留下来的自己的修改（含自己新增的项） */
  keptMine: string[];
  /** 本机旧 key → 合并后的 key（完成勾选、证明、账本跟着迁移） */
  keyMap: Record<string, string>;
}

function changedFields(a: Item | undefined, b: Item | undefined): string[] {
  if (!a || !b) return [a ? '删除' : '新增'];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (['src', 'key', 'id', 'tripId', 'order'].includes(k)) continue;
    if (stable((a as unknown as Record<string, unknown>)[k]) !== stable((b as unknown as Record<string, unknown>)[k])) out.push(ITEM_FIELD_LABEL[k] ?? k);
  }
  return out;
}

export function mergeSnapshot(
  base: TripSnapshot | undefined,
  local: { days: Day[]; items: Item[] },
  incoming: TripSnapshot,
  choices: Record<string, Choice> = {},
): MergeResult {
  const tripId = incoming.days[0]?.tripId ?? incoming.items[0]?.tripId ?? '';

  // ——— 每天：按第几天对应
  const bDay = new Map((base?.days ?? []).map((d) => [d.index, d]));
  const lDay = new Map(local.days.map((d) => [d.index, d]));
  const days: Day[] = incoming.days.map((n) => {
    const b = bDay.get(n.index);
    const l = lDay.get(n.index);
    // 主用户没改这一天、自己改了 → 保留自己的主题 / 城市 / 备注（日期、时区跟主用户）
    if (b && l && sameDay(b, n) && !sameDay(b, l)) return { ...n, city: l.city, title: l.title, note: l.note };
    return { ...n };
  });
  const dayByIndex = new Map(days.map((d) => [d.index, d]));
  const localDayIndex = new Map(local.days.map((d) => [d.id, d.index]));
  const incomingDayIndex = new Map(incoming.days.map((d) => [d.id, d.index]));
  const lastDay = days[days.length - 1];
  /** 把某一项放到合并后对应的那一天（按第几天找；那天没了就放最后一天） */
  const placeIn = (it: Item, fromLocal: boolean): Item => {
    const idx = (fromLocal ? localDayIndex : incomingDayIndex).get(it.dayId);
    const d = (idx !== undefined && dayByIndex.get(idx)) || lastDay;
    return { ...it, tripId, dayId: d?.id ?? it.dayId };
  };

  // ——— 每一项：按 id 三方比较
  const bItem = new Map((base?.items ?? []).map((i) => [i.id, i]));
  const lItem = new Map(local.items.map((i) => [i.id, i]));
  const nItem = new Map(incoming.items.map((i) => [i.id, i]));
  const ids = new Set([...bItem.keys(), ...lItem.keys(), ...nItem.keys()]);
  // 审查修复 #4：主用户调整过顺序的那几天，没被同伴挪到别天的项按主用户的新顺序排
  const ownerReordered = reorderedDays(base, incoming);
  const followsOwnerOrder = (id: string): boolean => {
    const n = nItem.get(id);
    const l = lItem.get(id);
    const i = n && incomingDayIndex.get(n.dayId);
    return i !== undefined && ownerReordered.has(i) && (!l || localDayIndex.get(l.dayId) === i);
  };
  const pick = new Map<string, { it: Item; fromLocal: boolean }>();
  const conflicts: Conflict[] = [];
  const keptMine: string[] = [];

  for (const id of ids) {
    const b = bItem.get(id);
    const l = lItem.get(id);
    const n = nItem.get(id);
    if (!b) {
      // 上次套用的版本里没有：主用户新增的，或者自己新增的
      if (n) pick.set(id, { it: n, fromLocal: false });
      else if (l) {
        pick.set(id, { it: l, fromLocal: true });
        keptMine.push(id);
      }
      continue;
    }
    const mineChanged = !l || !sameItem(l, b);
    const theirsChanged = !n || !sameItem(n, b);
    let take: 'mine' | 'theirs';
    // 两边内容都没改：主用户调整过这天的顺序就用主用户的（内容一样，只是顺序不同）
    if (!theirsChanged && !mineChanged) take = followsOwnerOrder(id) ? 'theirs' : 'mine';
    else if (!theirsChanged) take = 'mine';
    else if (!mineChanged) take = 'theirs';
    else if ((!l && !n) || (l && n && sameItem(l, n))) take = 'theirs';
    else {
      const dIdx = n ? incomingDayIndex.get(n.dayId) : localDayIndex.get(l!.dayId);
      conflicts.push({ id, title: (l ?? n)!.title, dayIndex: dIdx, mine: l, theirs: n, fields: changedFields(l ?? b, n ?? b) });
      take = choices[id] ?? 'theirs';
    }
    if (take === 'mine') {
      if (l) {
        pick.set(id, { it: l, fromLocal: true });
        if (mineChanged) keptMine.push(id);
      }
    } else if (n) pick.set(id, { it: n, fromLocal: false });
  }

  // ——— 排顺序：每天先按主用户的顺序放主用户那边的项，自己那边的项接在本机原来前一项的后面
  const placed = new Map<string, Item>();
  for (const [id, p] of pick) placed.set(id, placeIn(p.it, p.fromLocal));
  const out: Item[] = [];
  for (const d of days) {
    // 保留了自己内容修改的项，如果主用户调整过这天的顺序，也按主用户的位置排
    const fromIncoming = incoming.items
      .filter((i) => placed.has(i.id) && (!pick.get(i.id)!.fromLocal || followsOwnerOrder(i.id)) && placed.get(i.id)!.dayId === d.id)
      .sort((a, b) => a.order - b.order)
      .map((i) => placed.get(i.id)!);
    const list = [...fromIncoming];
    const mine = local.items
      .filter((i) => pick.get(i.id)?.fromLocal && placed.get(i.id)!.dayId === d.id)
      .sort((a, b) => a.order - b.order);
    for (const m of mine) {
      if (list.some((x) => x.id === m.id)) continue;
      // 本机原来排在它前面、并且合并后还在的那一项
      const seq = local.items.filter((i) => i.dayId === m.dayId).sort((a, b) => a.order - b.order);
      const pos = seq.findIndex((i) => i.id === m.id);
      let at = 0;
      for (let k = pos - 1; k >= 0; k--) {
        const j = list.findIndex((x) => x.id === seq[k].id);
        if (j >= 0) {
          at = j + 1;
          break;
        }
      }
      list.splice(at, 0, placed.get(m.id)!);
    }
    list.forEach((it, i) => out.push({ ...it, order: i }));
  }

  // ——— key：按导入时同样的规则重算，并记下本机旧 key → 新 key
  const used = new Set<string>();
  const keyMap: Record<string, string> = {};
  const items = out.map((it) => {
    const d = days.find((x) => x.id === it.dayId)!;
    const key = makeItemKey(d.date, it.type, it.title, used);
    const old = lItem.get(it.id)?.key;
    if (old && old !== key) keyMap[old] = key;
    return { ...it, key };
  });
  conflicts.sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
  return { days, items, conflicts, keptMine, keyMap };
}

/** 本机相对上次套用的版本改了哪些项（第二步「提交建议」会用；第一步用来提示） */
export function localEdits(base: TripSnapshot | undefined, local: { items: Item[] }): string[] {
  if (!base) return [];
  const b = new Map(base.items.map((i) => [i.id, i]));
  const l = new Map(local.items.map((i) => [i.id, i]));
  const out: string[] = [];
  for (const [id, it] of l) if (!b.has(id) || !sameItem(b.get(id), it)) out.push(id);
  for (const id of b.keys()) if (!l.has(id)) out.push(id);
  return out;
}
