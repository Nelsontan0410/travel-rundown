// 修订 2026-10 · ISSUE-001：历史旅程卡片。固定尺寸，一次最多 3 张，在同一区域里切换上一组 / 下一组。
import { useEffect, useState } from 'react';
import s from './TripDeck.module.css';
import { Icon } from './Icon';

export interface DeckTrip {
  id: string;
  title: string;
  dates: string;
  people: string;
  cover?: { src: string; alt: string };
}

export const PAGE_SIZE = 3;

function HistoryTripCard({ t, onOpen, onDelete }: { t: DeckTrip; onOpen: () => void; onDelete: () => void }) {
  return (
    <article className={s.card}>
      <button type="button" className={s.open} onClick={onOpen} aria-label={`打开旅程：${t.title}`}>
        <span className={s.thumb}>
          {t.cover ? <img src={t.cover.src} alt="" loading="lazy" decoding="async" /> : <Icon name="Mountain" className={s.ph} />}
        </span>
        <span className={s.text}>
          <span className={s.title}>{t.title}</span>
          <span className={`${s.meta} ${s.dates}`}>
            {t.dates.split(' — ').map((part, i) => (
              <span key={i}>
                {i > 0 ? ' — ' : ''}
                <span className={s.nobr}>{part}</span>
              </span>
            ))}
          </span>
          <span className={s.meta}>{t.people}</span>
        </span>
      </button>
      <button type="button" className={s.del} onClick={onDelete} aria-label={`删除旅程：${t.title}`} title="删除这份旅程">
        <Icon name="Trash2" size="sm" />
      </button>
    </article>
  );
}

export function TripDeck({ trips, onOpen, onDelete }: { trips: DeckTrip[]; onOpen: (id: string) => void; onDelete: (t: DeckTrip) => void }) {
  const pages = Math.max(1, Math.ceil(trips.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  // 删除后页数变少时，停在最后一页
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  const cur = Math.min(page, pages - 1);
  const shown = trips.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  return (
    <div className={s.deck}>
      <div className={s.track} aria-live="polite">
        {shown.map((t) => (
          <HistoryTripCard key={t.id} t={t} onOpen={() => onOpen(t.id)} onDelete={() => onDelete(t)} />
        ))}
        {Array.from({ length: PAGE_SIZE - shown.length }, (_, i) => (
          <div key={`empty-${i}`} className={s.empty} aria-hidden />
        ))}
      </div>
      {pages > 1 && (
        <div className={s.nav}>
          <button type="button" className={s.navBtn} onClick={() => setPage(cur - 1)} disabled={cur === 0} aria-label="上一组旅程">
            <Icon name="ChevronLeft" size="sm" />
            <span>上一组</span>
          </button>
          <span className={s.count}>
            {cur + 1} / {pages}
          </span>
          <button type="button" className={s.navBtn} onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} aria-label="下一组旅程">
            <span>下一组</span>
            <Icon name="ChevronRight" size="sm" />
          </button>
        </div>
      )}
    </div>
  );
}
