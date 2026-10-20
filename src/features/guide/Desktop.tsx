// 电脑版（≥ 1024px）旅行亮点总览：一屏看完。左侧是全站同一个侧栏导航（Screen），这里是大封面、亮点三列卡片、右侧目的地与每日精选、底部一排实用信息。
// 和手机版用同一份数据、同一套编辑面板；这里只负责排版和入口。
import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import g from './Guide.module.css';
import { Icon, type IconKey } from '../../components/Icon';
import { Button } from '../../components/Basics';
import { GuidePhoto, SaveBadge, type SaveState } from './parts';
import { CATEGORY_LABEL, TIP_CATEGORIES, TIP_LABEL, type DayPick, type Focus, type GuideTip, type Highlight, type TipCategory } from '../../domain/guide';
import { fmtMonthDay } from '../../domain/format';
import type { PlaceRow, StayRow } from './Info';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : WEEK[d.getUTCDay()];
};
const TIP_ICON: Record<TipCategory, IconKey> = {
  tip: 'Lightbulb',
  food: 'Utensils',
  shopping: 'ShoppingBag',
  photo: 'Camera',
  checklist: 'ListChecks',
  note: 'StickyNote',
  other: 'MoreHorizontal',
};
/** 日期色块：低饱和的几种底色轮流用（都来自主题变量） */
const DAY_TINT = ['var(--color-warning-soft)', 'color-mix(in srgb, var(--color-success) 16%, var(--color-surface))', 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))', 'var(--color-surface-muted)'];

export interface DesktopProps {
  tripId: string;
  tripTitle: string;
  place: string;
  dates: string;
  nightsLabel: string;
  cities: string[];
  coverKey?: string;
  coverFocus?: Focus;
  intro?: string;
  highlights: Highlight[];
  picks: DayPick[];
  tips: GuideTip[];
  stay: StayRow[];
  places: PlaceRow[];
  canEdit: boolean;
  edit: boolean;
  ownerName?: string;
  save: { state: SaveState; msg: string; onRetry: () => void };
  dayOf: (h: Highlight) => number | undefined;
  guard: (e: MouseEvent, to: string) => void;
  onToggleEdit: () => void;
  onCoverPhoto: () => void;
  onCoverEdit: () => void;
  onAdd: () => void;
  onManage: () => void;
  onOpenHl: (id: string) => void;
  onOpenDay: (dayId: string) => void;
  onEditDay: (dayId: string) => void;
  onEditTips: () => void;
  onToggleTip: (id: string, done: boolean) => void;
}

export function DesktopOverview(p: DesktopProps) {
  const visible = p.edit ? p.highlights : p.highlights.filter((h) => !h.hidden);
  const days = p.edit ? p.picks : p.picks.filter((d) => !d.hidden);
  const lastPhoto = [...days].reverse().find((d) => d.photoKey);
  const lastCity = p.picks[p.picks.length - 1]?.day.city || p.place;
  const tipGroups = TIP_CATEGORIES.map((c) => ({ c, list: p.tips.filter((t) => t.category === c) })).filter((x) => x.list.length > 0);
  return (
    <div className={g.dShell}>
      <div className={g.dMain}>
        <header className={g.dTop}>
          <p className={g.dCrumb}>
            <Link to="/trips" onClick={(e) => p.guard(e, '/trips')}>
              我的旅程
            </Link>
            <span aria-hidden> / </span>
            <span>{p.tripTitle}</span>
            <span aria-hidden> / </span>
            <strong>旅行亮点</strong>
          </p>
          <span className={g.barSpacer} />
          {p.edit && <SaveBadge state={p.save.state} msg={p.save.msg} onRetry={p.save.onRetry} />}
          {p.canEdit && (
            <button type="button" className={`${g.dEditBtn} ${p.edit ? g.dEditBtnOn : ''}`} onClick={p.onToggleEdit}>
              <Icon name={p.edit ? 'Check' : 'Pencil'} size="sm" />
              {p.edit ? '完成编辑' : '编辑模式'}
            </button>
          )}
        </header>
        {!p.canEdit && <p className={g.notice}>这是{p.ownerName ? `「${p.ownerName}」` : '主用户'}整理的旅行亮点，更新后会随行程一起同步。</p>}

        <div className={g.dGrid}>
          {/* 封面 */}
          <section className={`${g.dCover} ${p.coverKey ? '' : g.dCoverEmpty}`} aria-label="封面">
            {p.coverKey && <GuidePhoto photoKey={p.coverKey} focus={p.coverFocus} alt={`${p.place} 封面`} className={g.dCoverPhoto} />}
            {p.coverKey && <div className={g.dCoverShade} aria-hidden />}
            {p.edit && (
              <button type="button" className={`${g.dChip} ${g.dChipTop}`} onClick={p.onCoverPhoto}>
                <Icon name="Camera" size="sm" />
                {p.coverKey ? '更换封面' : '添加封面照片'}
              </button>
            )}
            <div className={g.dCoverText}>
              <p className={g.dEyebrow}>{p.cities.length ? p.cities.join(' · ') : `${p.picks.length} days`}</p>
              <h1 className={g.dTitle}>{p.place}</h1>
              <p className={g.dMeta}>
                {p.dates} · {p.nightsLabel}
              </p>
              {p.intro ? <p className={g.dIntro}>{p.intro}</p> : p.edit ? <p className={g.dIntro}>还没有简介，点「编辑简介」写一两句。</p> : null}
              {!p.coverKey && !p.edit && p.canEdit && <p className={g.dHint}>还没有封面照片。点右上角「编辑模式」，就能放上你自己的照片。</p>}
            </div>
            {p.edit && (
              <button type="button" className={`${g.dChip} ${g.dChipBottom}`} onClick={p.onCoverEdit}>
                <Icon name="Pencil" size="sm" />
                编辑简介
              </button>
            )}
          </section>

          {/* 右侧：目的地 + 每日精选 + 明信片 */}
          <aside className={g.dSide}>
            <section className={g.dCard} aria-labelledby="d-dest">
              <h2 id="d-dest" className={g.dCardTitle}>
                <Icon name="MapPin" size="sm" />
                目的地
              </h2>
              {p.places.length ? (
                <ul className={g.dPlaces}>
                  {p.places.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <span>
                        <strong>{r.title}</strong>
                        {r.place && <small>{r.place}</small>}
                      </span>
                      <button type="button" className={g.navLink} onClick={r.onNav} aria-label={`导航到${r.title}`}>
                        <Icon name="Navigation" size="sm" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={g.dCities}>{p.cities.join(' · ') || p.place}</p>
              )}
            </section>

            <section className={g.dCard} aria-labelledby="g-days">
              <div className={g.dCardHead}>
                <h2 id="g-days" className={g.dCardTitle}>
                  每日精选 <small>Day by day</small>
                </h2>
                <Link to={`/itinerary/${p.tripId}`} className={g.moreLink} onClick={(e) => p.guard(e, `/itinerary/${p.tripId}`)}>
                  查看完整行程
                  <Icon name="ChevronRight" size="xs" />
                </Link>
              </div>
              <ol className={g.dDays}>
                {days.map((d, i) => (
                  <li key={d.day.id} className={`${g.dDay} ${d.hidden ? g.dayHidden : ''}`} data-day-card={d.day.id}>
                    <span className={g.dayDot} aria-hidden />
                    <button type="button" className={g.dDayMain} onClick={() => (p.edit ? p.onEditDay(d.day.id) : p.onOpenDay(d.day.id))} aria-label={p.edit ? `编辑 Day ${d.day.index}` : `查看 Day ${d.day.index} 行程`}>
                      <span className={g.dDate} style={{ background: DAY_TINT[i % DAY_TINT.length] }}>
                        <small>DAY {pad(d.day.index)}</small>
                        <strong>{fmtMonthDay(d.day.date)}</strong>
                        <small>{weekday(d.day.date)}</small>
                      </span>
                      <span className={g.dDayText}>
                        <strong>{d.title}</strong>
                        {d.picks.length > 0 && <small>{d.picks.map((x) => x.title).join(' · ')}</small>}
                        {d.hidden && <small>不在每日精选里显示</small>}
                      </span>
                      {d.photoKey && <GuidePhoto thumb photoKey={d.photoKey} focus={d.focus} alt="" className={g.dDayThumb} />}
                    </button>
                    {p.edit && (
                      <span className={g.dPencil} aria-hidden>
                        <Icon name="Pencil" size="sm" />
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {lastPhoto && !p.edit && (
              <figure className={g.dPostcard}>
                <GuidePhoto thumb photoKey={lastPhoto.photoKey} focus={lastPhoto.focus} alt="" className={g.dPostPhoto} />
                <figcaption>See you in {lastCity}!</figcaption>
              </figure>
            )}
          </aside>

          {/* 旅行亮点 */}
          <section className={g.dHl} aria-labelledby="g-hl">
            <div className={g.dCardHead}>
              <h2 id="g-hl" tabIndex={-1} className={g.dSecTitle}>
                旅行亮点 <small>Highlights</small>
              </h2>
              {p.edit && (
                <span className={g.dHeadBtns}>
                  <Button size="sm" variant="outline" icon="GripVertical" onClick={p.onManage}>
                    管理顺序
                  </Button>
                  <Button size="sm" icon="Plus" onClick={p.onAdd}>
                    添加亮点
                  </Button>
                </span>
              )}
            </div>
            {visible.length === 0 ? (
              <div className={g.empty}>
                <p>{p.canEdit ? '还没有亮点。先从行程里挑几个想展示的地方，再配上自己的照片和一句话。' : '主用户还没有添加旅行亮点。'}</p>
                {p.canEdit && (
                  <Button icon="Plus" onClick={p.onAdd}>
                    添加亮点
                  </Button>
                )}
              </div>
            ) : (
              <ol className={g.dCards}>
                {visible.map((h, i) => {
                  const day = p.dayOf(h);
                  const body: ReactNode = (
                    <>
                      <span className={g.dCardMedia}>
                        <GuidePhoto photoKey={h.photoKey} focus={h.focus} alt={h.title} className={g.dCardPhoto} fallback={<Icon name="Image" />} />
                        <span className={g.dNum}>{pad(i + 1)}</span>
                      </span>
                      <span className={g.dCardBody}>
                        <span className={g.dBadgeRow}>
                          <span className={g.dBadge}>{CATEGORY_LABEL[h.category]}</span>
                          {day !== undefined && <span className={g.dayTag}>DAY {pad(day)}</span>}
                          {h.hidden && <span className={g.dayTag}>已隐藏</span>}
                        </span>
                        <strong className={g.dCardName} data-hl-title>
                          {h.title}
                        </strong>
                        {h.desc && <span className={g.dCardDesc}>{h.desc}</span>}
                      </span>
                    </>
                  );
                  return (
                    <li key={h.id} className={`${g.dHlCard} ${h.hidden ? g.mHidden : ''}`} data-hl={h.id}>
                      {p.edit ? (
                        <button type="button" className={g.dHlBtn} aria-label={`修改「${h.title}」`} onClick={() => p.onOpenHl(h.id)}>
                          {body}
                          <span className={g.dMore} aria-hidden>
                            <Icon name="MoreHorizontal" size="sm" />
                          </span>
                        </button>
                      ) : (
                        <div className={g.dHlBtn}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* 实用信息 */}
          <section className={g.dInfo} aria-labelledby="g-info">
            <div className={g.dCardHead}>
              <h2 id="g-info" className={g.dSecTitle}>
                实用信息 <small>Useful info</small>
              </h2>
              {p.edit && (
                <Button size="sm" variant="outline" icon="Pencil" onClick={p.onEditTips}>
                  编辑贴士
                </Button>
              )}
            </div>
            {!tipGroups.length && !p.stay.length ? (
              <p className={g.hint}>{p.canEdit ? '还没有贴士。进入「编辑模式」后点「编辑贴士」添加必吃清单、手信、拍照建议或出发清单。' : '还没有实用信息。'}</p>
            ) : (
              <div className={g.dInfoRow}>
                {p.stay.length > 0 && (
                  <div className={g.dInfoCol}>
                    <Icon name="Plane" />
                    <div>
                      <strong>住宿与出行</strong>
                      {p.stay.slice(0, 3).map((r) => (
                        <small key={r.id}>{r.title}</small>
                      ))}
                    </div>
                  </div>
                )}
                {tipGroups.map(({ c, list }) => (
                  <div key={c} className={g.dInfoCol} data-tip-group={c}>
                    <Icon name={TIP_ICON[c]} />
                    <div>
                      <strong>{TIP_LABEL[c]}</strong>
                      {c === 'checklist'
                        ? list.slice(0, 4).map((t) => (
                            <label key={t.id} className={`${g.dCheck} ${t.done ? g.tipDone : ''}`}>
                              <input type="checkbox" checked={!!t.done} disabled={!p.canEdit} onChange={(e) => p.onToggleTip(t.id, e.target.checked)} aria-label={`${t.done ? '取消勾选' : '勾选'}：${t.text}`} />
                              <span className={g.tipText}>{t.text}</span>
                            </label>
                          ))
                        : list.slice(0, 3).map((t) => <small key={t.id}>{t.text}</small>)}
                      {list.length > (c === 'checklist' ? 4 : 3) && <small className={g.dMoreN}>还有 {list.length - (c === 'checklist' ? 4 : 3)} 条</small>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
