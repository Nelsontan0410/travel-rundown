// 旅程介绍页（Landing）：把已导入的行程整理成一份旅行杂志式的介绍，入口在行程页封面下方。
import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import p from './Story.module.css';
import { Icon } from '../components/Icon';
import { Montage, Parallax, Photo, type PhotoSrc } from '../components/Story';
import { useBlobUrl, useTripData } from '../hooks/data';
import { buildLanding } from '../domain/landing';
import type { LandingMedia } from '../domain/landingMedia';
import { fmtDate, fmtMonthDay } from '../domain/format';
import { useUI } from '../store/ui';

const ph = (m: LandingMedia): PhotoSrc => ({ src: m.file, alt: m.alt, caption: m.caption });
const pad = (n: number) => String(n).padStart(2, '0');
/** 这一页的日期范围用「至」连接，不用破折号 */
const span = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} 至 ${fmtDate(b)}`);
const TYPE_ICON = { flight: 'Plane', lodging: 'Building2', spot: 'MapPin', transit: 'TrainFront', meal: 'Utensils', note: 'StickyNote' } as const;

/** 平滑滚到页面里的某一段；减少动态效果时直接跳 */
function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

export default function StoryPage() {
  const { tripId } = useParams();
  const nav = useNavigate();
  const td = useTripData(tripId);
  const cover = useBlobUrl(td?.trip.coverBlobKey);
  const selectDay = useUI((s) => s.selectDay);
  const L = useMemo(() => (td ? buildLanding(td.trip, td.days, td.items) : null), [td]);

  if (td === null) return <Navigate to="/itinerary" replace />;
  if (!td || !L) return <div className={p.page} />;

  const trip = td.trip;
  const openDay = (dayId: string) => {
    selectDay(trip.id, dayId);
    nav(`/itinerary/${trip.id}`);
  };
  const montage: PhotoSrc[] = [...(cover ? [{ src: cover, alt: `${L.place} 封面` }] : []), ...L.montage.map(ph)].slice(0, 6);
  const [lead, ...rest] = L.highlights;
  // 有照片的美食排前面撑起拼版，没有照片的放后面只出文字
  const food = [...L.food.filter((f) => f.media), ...L.food.filter((f) => !f.media)];

  return (
    <div className={p.page}>
      <Link to={`/itinerary/${trip.id}`} className={p.back}>
        <Icon name="ChevronLeft" size="sm" />
        回到行程
      </Link>

      {/* 首屏：左 30% 标题，右 70% 动态画面 */}
      <header className={`${p.hero} ${montage.length ? '' : p.heroPlain}`}>
        {montage.length > 0 && (
          <div className={p.heroMedia}>
            <Montage photos={montage} />
          </div>
        )}
        <div className={p.heroText}>
          {L.country && <p className={p.country}>{L.country}</p>}
          <h1 className={p.title} aria-label={L.place}>
            {L.place.split(/\s*[・·]\s*/).map((seg, i) => (
              <span key={seg + i} className={p.titleSeg} aria-hidden>
                {i > 0 && <span className={p.titleSep}>·</span>}
                {seg}
              </span>
            ))}
          </h1>
          <p className={p.theme}>{L.theme}</p>
          <div className={p.intro}>
            {L.intro.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
          <dl className={p.facts}>
            <div>
              <dt>日期</dt>
              <dd>{span(trip.startDate, trip.endDate)}</dd>
            </div>
            <div>
              <dt>天数</dt>
              <dd>{L.stats.days} 天</dd>
            </div>
            <div>
              <dt>地点</dt>
              <dd>{L.stats.spots} 个景点</dd>
            </div>
          </dl>
          <div className={p.ctas}>
            <button type="button" className={p.btnLeather} onClick={() => scrollToId('days')}>
              探索行程
            </button>
            <button type="button" className={p.btnCream} onClick={() => scrollToId('highlights')}>
              查看旅行亮点
            </button>
          </div>
        </div>
        <button type="button" className={p.scrollHint} onClick={() => scrollToId('highlights')} aria-label="向下浏览">
          <span>向下浏览</span>
          <Icon name="ChevronRight" size="xs" className={p.down} />
        </button>
      </header>

      {/* 旅行亮点：一张主图 + 错落的小图 */}
      {lead && (
        <section id="highlights" tabIndex={-1} className={p.section} aria-labelledby="h-highlights">
          <div className={p.secHead}>
            <h2 id="h-highlights" className={p.h2}>最值得期待的 {L.highlights.length} 个时刻</h2>
            <p className={p.secLead}>从行程的必逛清单里挑出来的场景，按日期排列。</p>
          </div>
          <div className={p.hlGrid}>
            <article className={`${p.hlLead} ${lead.media ? '' : p.hlLeadPlain}`}>
              {lead.media && <Photo photo={ph(lead.media)} ratio="4 / 3" />}
              <div className={p.hlLeadText}>
                <p className={p.dayTag}>Day {pad(lead.dayIndex)}</p>
                <h3 className={p.h3}>{lead.title}</h3>
                <p className={p.body}>{lead.scenes.join('、')}</p>
                {lead.note && <p className={p.small}>{lead.note}</p>}
              </div>
            </article>
            {rest.map((h, i) => (
              <article key={h.itemId} className={`${p.hlItem} ${p[`hl${i}`] ?? ''}`}>
                {h.media && <Photo photo={ph(h.media)} ratio={i % 2 ? '3 / 4' : '4 / 3'} />}
                <p className={p.dayTag}>Day {pad(h.dayIndex)}</p>
                <h3 className={p.h3s}>{h.title}</h3>
                <p className={p.body}>{h.scenes.join('、')}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 行程概览：Day 01、Day 02… 详细安排可以展开 */}
      <section id="days" tabIndex={-1} className={p.section} aria-labelledby="h-days">
        <div className={p.secHead}>
          <h2 id="h-days" className={p.h2}>{L.stats.days} 天怎么走</h2>
          <p className={p.secLead}>每天一个重点，完整的时间表在「行程」里。</p>
        </div>
        <ol className={p.dayList}>
          {L.days.map((d) => (
            <li key={d.dayId} className={p.day}>
              <p className={p.dayRail}>
                <span className={p.dayWord}>Day</span>
                <span className={p.dayNum}>{pad(d.index)}</span>
                <span className={p.dayDate}>{fmtMonthDay(d.date)}</span>
              </p>
              <div className={p.dayText}>
                <h3 className={p.h3}>{d.title ?? d.city}</h3>
                {d.route.length > 0 && (
                  <ul className={p.route} aria-label="当天主要景点">
                    {d.route.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                <p className={p.body}>{d.line}</p>
                <dl className={p.dayMeta}>
                  {d.lodging && (
                    <div>
                      <dt>住宿</dt>
                      <dd>{d.lodging}</dd>
                    </div>
                  )}
                  <div>
                    <dt>节奏</dt>
                    <dd>{d.pace}</dd>
                  </div>
                </dl>
                <details className={p.more}>
                  <summary>当天安排（{d.items.length} 项）</summary>
                  <ul>
                    {d.items.map((it) => (
                      <li key={it.id}>
                        <span className={p.moreTime}>{it.time ?? ''}</span>
                        <Icon name={TYPE_ICON[it.type]} size="xs" className={p.moreIcon} />
                        <span>{it.title}</span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className={p.textBtn} onClick={() => openDay(d.dayId)}>
                    在行程里打开 Day {d.index}
                    <Icon name="ChevronRight" size="xs" />
                  </button>
                </details>
              </div>
              {d.media && (
                <div className={p.dayThumb}>
                  <Photo photo={ph(d.media)} ratio="4 / 3" />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* 沉浸式停顿 */}
      {L.interlude && (
        <section className={p.interlude} aria-label="风景">
          <Parallax photo={ph(L.interlude.media)}>
            <p className={p.interText}>
              <span className={p.interDay}>Day {pad(L.interlude.dayIndex)}</span>
              {L.interlude.line}
            </p>
          </Parallax>
        </section>
      )}

      {/* 美食：大图小图穿插 */}
      {food.length > 0 && (
        <section id="food" className={p.section} aria-labelledby="h-food">
          <div className={p.secHead}>
            <h2 id="h-food" className={p.h2}>这一路要吃的</h2>
            <p className={p.secLead}>行程里写明了「必吃」或店名的几顿。</p>
          </div>
          <div className={p.foodGrid}>
            {food.map((f, i) => (
              <article key={f.itemId} className={`${p.food} ${i === 0 && f.media ? p.foodBig : ''} ${i === 3 && f.media ? p.foodWide : ''} ${f.media ? '' : p.foodPlain}`}>
                {f.media && <Photo photo={ph(f.media)} ratio={i === 0 ? '1 / 1' : i === 3 ? '16 / 9' : '4 / 3'} />}
                <div className={p.foodText}>
                  <h3 className={p.h3s}>{f.name}</h3>
                  <p className={p.body}>{f.detail}</p>
                  <p className={p.small}>
                    Day {pad(f.dayIndex)}
                    {f.venue ? `，${f.venue}` : ''}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 值得留住的瞬间：手帐拼贴 */}
      {L.moments.length > 0 && (
        <section id="moments" className={p.section} aria-labelledby="h-moments">
          <div className={p.secHead}>
            <h2 id="h-moments" className={p.h2}>值得留住的瞬间</h2>
            <p className={p.secLead}>适合停下来拍照、散步或看夜景的地方。</p>
          </div>
          <div className={p.journal}>
            {L.moments.map((m, i) => (
              <figure key={m.itemId} className={`${p.snap} ${p[`snap${i % 6}`]}`}>
                <Photo photo={ph(m.media!)} ratio={['4 / 5', '1 / 1', '3 / 2', '3 / 4', '4 / 3', '1 / 1'][i % 6]} className={p.snapPhoto} />
                <figcaption>
                  <span className={p.snapCap}>{m.caption}</span>
                  <span className={p.snapTag}>
                    <Icon name="MapPin" size="xs" />
                    {m.place}，Day {pad(m.dayIndex)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* 出发前速览 */}
      {L.brief.length > 0 && (
        <section id="brief" className={p.section} aria-labelledby="h-brief">
          <div className={p.ticket}>
            <div className={p.ticketHead}>
              <h2 id="h-brief" className={p.h2}>出发前速览</h2>
              <p className={p.small}>出发日 {fmtDate(trip.startDate)}</p>
            </div>
            <dl className={p.briefList}>
              {L.brief.map((b) => (
                <div key={b.label}>
                  <dt>{b.label}</dt>
                  <dd>{b.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* 收尾 */}
      <footer className={p.closing}>
        {L.closing && <Photo photo={ph(L.closing)} ratio="21 / 9" className={p.closingPhoto} />}
        <div className={p.closingText}>
          <h2 className={p.closingTitle} aria-label={L.place}>
            {L.place.split(/\s*[・·]\s*/).map((seg, i) => (
              <span key={seg + i} className={p.titleSeg} aria-hidden>
                {i > 0 && <span className={p.titleSep}>·</span>}
                {seg}
              </span>
            ))}
          </h2>
          <p className={p.closingSub}>{L.stats.days} 天，{L.stats.spots} 个景点</p>
          <p className={p.body}>{span(trip.startDate, trip.endDate)}</p>
          <button type="button" className={p.btnLeather} onClick={() => nav(`/itinerary/${trip.id}`)}>
            查看完整行程
          </button>
          <Link to="/credits/photos" className={p.credits}>
            照片来源与授权
          </Link>
        </div>
      </footer>
    </div>
  );
}
