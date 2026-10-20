import TripUnavailable from './TripUnavailable';
// 旅程概览（Landing）：首屏照片环 + 旅程标题，从这里进入「旅行亮点」或回到行程。相册放照片环放不下的照片。
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import p from './Story.module.css';
import { Icon } from '../components/Icon';
import { TripThemeScope } from '../components/TripTheme';
import { Photo } from '../components/Story';
import { PhotoRing, SoloPostcard } from '../components/PhotoRing';
import { useBlobUrl, useTripData } from '../hooks/data';
import { buildLanding } from '../domain/landing';
import { landingBackdrop, landingGallery } from '../domain/landingGallery';
import { fmtDate } from '../domain/format';

/** 这一页的日期范围用「至」连接，不用破折号 */
const span = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} 至 ${fmtDate(b)}`);

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
  const L = useMemo(() => (td ? buildLanding(td.trip, td.days, td.items) : null), [td]);
  // 首屏照片环与页面其他段落同一份照片源；切换旅程、换封面后跟着变
  const plan = useMemo(() => (L && td ? landingGallery(L, { cover, theme: td.trip.theme }) : null), [L, td, cover]);
  // 首屏背景：只有对得上地点和季节的旅程才有，中央淡成纸面
  const backdrop = useMemo(() => (L && td ? landingBackdrop(L, td.trip.startDate) : undefined), [L, td]);

  if (td === null) return <TripUnavailable tripId={tripId ?? ''} title="旅程介绍" />;
  if (!td || !L || !plan) return <div className={p.page} />;

  const trip = td.trip;

  const heroText = (
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
        <button type="button" className={p.btnLeather} onClick={() => nav(`/itinerary/${trip.id}`)}>
          探索行程
        </button>
        <button type="button" className={p.btnCream} onClick={() => nav(`/trip/${trip.id}/highlights`)}>
          查看旅行亮点
        </button>
      </div>
      {plan.needsAlbum && (
        <button type="button" className={p.albumLink} onClick={() => scrollToId('album')}>
          全部 {plan.photos.length} 张照片
          <Icon name="ChevronRight" size="xs" />
        </button>
      )}
    </div>
  );

  return (
    <div className={p.page}>
      <TripThemeScope theme={trip.theme} />
      <Link to={`/itinerary/${trip.id}`} className={p.back}>
        <Icon name="ChevronLeft" size="sm" />
        回到行程
      </Link>

      {/* 首屏：旅程照片围成一圈缓慢转动，标题在中央（手机上环在上、标题在下） */}
      <header className={`${p.hero} ${plan.mode === 'none' ? p.heroPlain : ''} ${backdrop ? p.hasBackdrop : ''}`}>
        {backdrop && (
          <div className={p.backdrop} aria-hidden>
            <img
              src={backdrop.src}
              srcSet={`${backdrop.srcSmall} 800w, ${backdrop.src} 1586w`}
              sizes="100vw"
              alt=""
              decoding="async"
            />
          </div>
        )}
        {plan.mode === 'ring' ? (
          <PhotoRing
            photos={plan.photos}
            count={plan.ring}
            countMobile={plan.ringMobile}
            hub={
              <>
                <strong className={p.hubNum}>{L.stats.days}</strong>天
              </>
            }
          >
            {heroText}
          </PhotoRing>
        ) : plan.mode === 'single' ? (
          <div className={p.soloHero}>
            <SoloPostcard photo={plan.photos[0]} />
            {heroText}
          </div>
        ) : (
          heroText
        )}
        {plan.needsAlbum && (
          <button type="button" className={p.scrollHint} onClick={() => scrollToId('album')} aria-label="向下浏览相册">
            <span>向下浏览</span>
            <Icon name="ChevronRight" size="xs" className={p.down} />
          </button>
        )}
      </header>

      {/* 旅程相册：照片环放不下的照片都在这里，减少动态效果时也能逐张看 */}
      {plan.needsAlbum && (
        <section id="album" tabIndex={-1} className={p.section} aria-labelledby="h-album">
          <div className={p.secHead}>
            <h2 id="h-album" className={p.h2}>旅程相册</h2>
            <p className={p.secLead}>这份旅程介绍里用到的全部 {plan.photos.length} 张照片。</p>
          </div>
          <ul className={p.album}>
            {plan.photos.map((ph) => (
              <li key={ph.id}>
                <Photo photo={{ src: ph.thumb, alt: ph.alt, caption: ph.caption }} ratio="4 / 5" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 收尾：照片来源（内置的地点照片按许可要求署名） */}
      <footer className={p.landingFoot}>
        <Link to="/credits/photos" className={p.credits}>
          照片来源与授权
        </Link>
      </footer>
    </div>
  );
}
