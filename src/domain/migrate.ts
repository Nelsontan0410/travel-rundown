// v1 → v2：把旧格式放在 meta 里的字段搬到类型专属字段。纯函数，导入解析也复用。
import type { Item } from './types';

type Movable = Pick<Item, 'type' | 'meta' | 'flight' | 'lodging' | 'transit'>;

const take = (meta: Record<string, string>, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = meta[k];
    if (v) {
      delete meta[k];
      return v;
    }
  }
  return undefined;
};

export function migrateItemV2<T extends Movable>(it: T): T {
  if (!it.meta) return it;
  const meta = { ...it.meta };
  const out = { ...it };
  if (it.type === 'flight') {
    const f = { ...(it.flight ?? {}) };
    f.number ??= take(meta, '航班号', '航班');
    f.airline ??= take(meta, '航空公司');
    f.terminal ??= take(meta, '航站楼');
    f.seat ??= take(meta, '座位');
    out.flight = f;
  } else if (it.type === 'lodging') {
    const l = { ...(it.lodging ?? {}) };
    const co = take(meta, '退房日期');
    if (co && /^\d{4}-\d{2}-\d{2}$/.test(co)) l.checkOut ??= co;
    else if (co) meta['退房日期'] = co;
    l.roomType ??= take(meta, '房型');
    out.lodging = l;
  } else if (it.type === 'transit') {
    const t = { ...(it.transit ?? {}) };
    t.line ??= take(meta, '线路');
    t.mode ??= take(meta, '方式', '交通方式');
    out.transit = t;
  }
  out.meta = Object.keys(meta).length ? meta : undefined;
  return out;
}
