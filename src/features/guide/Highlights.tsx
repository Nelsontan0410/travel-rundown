// 第二页：精选景点与美食（手机 M02 / 电脑 W02）阅读版。
// 按类别分组，只显示有内容的类别；美食在手机上是横向照片组，其余是「照片 + 编号 + 标题 + 一句话 + Day」列表；电脑统一三列图卡。
import { useState } from 'react';
import g from './Guide.module.css';
import { GuidePhoto } from './parts';
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_TITLE, type Highlight, type HighlightCategory } from '../../domain/guide';

const pad = (n: number) => String(n).padStart(2, '0');

export function ReadHighlights({ list, dayOf }: { list: Highlight[]; dayOf: (h: Highlight) => number | undefined }) {
  const [filter, setFilter] = useState<'all' | HighlightCategory>('all');
  const cats = CATEGORIES.filter((c) => list.some((h) => h.category === c));
  const cur = filter !== 'all' && !cats.includes(filter) ? 'all' : filter;
  const num = new Map(list.map((h, i) => [h.id, i + 1]));
  const groups = (cur === 'all' ? cats : [cur]).map((c) => ({ c, items: list.filter((h) => h.category === c) }));
  return (
    <>
      {cats.length > 1 && (
        <div className={g.filters} role="group" aria-label="按类别筛选">
          {(['all', ...cats] as const).map((c) => {
            const n = c === 'all' ? list.length : list.filter((h) => h.category === c).length;
            return (
              <button key={c} type="button" className={`${g.filter} ${cur === c ? g.filterOn : ''}`} aria-pressed={cur === c} onClick={() => setFilter(c)}>
                {c === 'all' ? '全部' : CATEGORY_LABEL[c]}
                <span className={g.filterN}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {groups.map(({ c, items }) => (
        <div key={c} className={g.catBlock}>
          <h3 className={g.catTitle}>
            {CATEGORY_TITLE[c][0]} <small>{CATEGORY_TITLE[c][1]}</small>
          </h3>
          <ol className={c === 'food' ? g.foodRow : g.spotList}>
            {items.map((h) => {
              const day = dayOf(h);
              return (
                <li key={h.id} className={`${c === 'food' ? g.foodTile : g.spotRow} ${h.photoKey ? '' : g.noPhoto}`} data-hl={h.id}>
                  {h.photoKey && (
                    <div className={g.spotMedia}>
                      <GuidePhoto ratio={c !== 'food'} thumb={c === 'food'} photoKey={h.photoKey} focus={h.focus} alt={h.title} className={g.spotPhoto} fallback={<span>{CATEGORY_LABEL[h.category]}</span>} />
                      <span className={g.spotNum} aria-hidden>
                        {pad(num.get(h.id) ?? 0)}
                      </span>
                    </div>
                  )}
                  <div className={g.spotText}>
                    {!h.photoKey && <span className={g.spotNumPlain}>{pad(num.get(h.id) ?? 0)}</span>}
                    <p className={g.spotMeta}>
                      {CATEGORY_LABEL[h.category]}
                      {day !== undefined && <span className={g.dayTag}>DAY {pad(day)}</span>}
                    </p>
                    <h4 className={g.spotTitle} data-hl-title>
                      {h.title}
                    </h4>
                    {h.desc && <p className={g.spotDesc}>{h.desc}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </>
  );
}
