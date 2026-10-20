// 旅行亮点：口袋旅行指南。读取 Rundown 的日期、天数、行程项；用户自己的内容（封面摆位、简介、亮点、照片、贴士）
// 存在独立的 guides / highlights 表里，编辑它们不会改动行程。
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import g from './Guide.module.css';
import TripUnavailable from '../TripUnavailable';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Basics';
import { Dialog } from '../../components/Layout';
import { TripThemeScope } from '../../components/TripTheme';
import { BrandLockup } from '../../components/Brand';
import { db } from '../../db/schema';
import { setCover } from '../../db/repo';
import { moveTip, setDayFocus, setDayHidden, setDayPhoto, setDayTitle, toggleTip } from '../../db/guide';
import { addHighlight, addTip, deleteHighlight, removeTip, reorderHighlights, setCoverFocus, setHighlightPhoto, setIntro, updateHighlight, updateTip } from '../../db/guide';
import { useBlobUrl, useSettings, useTripData } from '../../hooks/data';
import {
  CATEGORY_LABEL,
  dayPicks,
  linkState,
  LIMITS,
  moveId,
  moveTo,
  sortHighlights,
  type Guide,
  type Highlight,
} from '../../domain/guide';
import { fmtDateRange, fmtMonthDay } from '../../domain/format';
import { navLink } from '../../links/maps';
import { openExternal } from '../../links/openLink';
import { placeCopyText } from '../../domain/rules';
import { useUI } from '../../store/ui';
import { ReadHighlights } from './Highlights';
import { DaysSection } from './Days';
import { InfoSection, type StayRow } from './Info';
import { AddSheet, EditableText, GuidePhoto, PhotoSheet, SaveBadge, useSaver } from './parts';

const pad = (n: number) => String(n).padStart(2, '0');

export default function GuidePage() {
  const { tripId } = useParams();
  const nav = useNavigate();
  const td = useTripData(tripId);
  const settings = useSettings();
  const selectDay = useUI((s) => s.selectDay);
  const guide = useLiveQuery(async () => (tripId ? (await db.guides.get(tripId)) ?? null : null), [tripId]);
  const hs = useLiveQuery(async () => (tripId ? db.highlights.where('tripId').equals(tripId).toArray() : []), [tripId]);
  const coverUrl = useBlobUrl(td?.trip.coverBlobKey);
  const saver = useSaver();
  const [editing, setEditing] = useState(false);
  const [photoFor, setPhotoFor] = useState<'cover' | string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Highlight | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const all = useMemo(() => sortHighlights(hs ?? []), [hs]);

  if (td === null) return <TripUnavailable tripId={tripId ?? ''} title="旅行亮点" />;
  if (!td || hs === undefined || guide === undefined) return <div className={g.page} />;

  const { trip } = td;
  const canEdit = trip.cloud?.role !== 'member';
  const edit = editing && canEdit;
  const G: Guide = guide ?? { tripId: trip.id, tips: [], updatedAt: '' };
  const shown = edit ? all : all.filter((h) => !h.hidden);
  const persist = async (fn: () => Promise<unknown>) => {
    if (!(await saver.run(fn))) throw new Error('');
  };
  const run = (fn: () => Promise<unknown>) => void saver.run(fn);
  const nDays = td.days.length;
  const place = trip.destination || trip.title;
  const itemById = new Map(td.items.map((i) => [i.id, i]));
  const picks = dayPicks(td.days, td.items, all, G.days);
  const hasCover = !!trip.coverBlobKey && !!coverUrl;
  const cities = [...new Set(td.days.map((d) => d.city).filter(Boolean))];
  const preview = all.filter((h) => !h.hidden).slice(0, 3);
  const visibleCount = all.filter((h) => !h.hidden).length;

  const ids = all.map((h) => h.id);
  const reorder = (next: string[]) => run(() => reorderHighlights(trip.id, next));

  // 长按拖动（触屏、鼠标都可以）；拖不方便时用上移 / 下移按钮
  const startDrag = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, over: ids.indexOf(id) });
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    let over = ids.length - 1;
    for (let i = 0; i < shown.length; i++) {
      const r = cardRefs.current.get(shown[i].id)?.getBoundingClientRect();
      if (r && e.clientY < r.top + r.height / 2) {
        over = ids.indexOf(shown[i].id);
        break;
      }
    }
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const endDrag = () => {
    if (drag && drag.over !== ids.indexOf(drag.id)) reorder(moveTo(ids, drag.id, drag.over));
    setDrag(null);
  };

  const openDay = (dayId: string) => {
    selectDay(trip.id, dayId);
    nav(`/itinerary/${trip.id}`);
  };

  const photoTarget = photoFor && photoFor !== 'cover' && !photoFor.startsWith('day:') ? all.find((h) => h.id === photoFor) : undefined;
  const photoDay = photoFor?.startsWith('day:') ? photoFor.slice(4) : undefined;
  const photoDayOwn = photoDay ? G.days?.[photoDay] : undefined;
  // 住宿与出行：只引用行程里已有的住宿、航班（不编价格、坐标）
  const stayRows: StayRow[] = td.items.flatMap((it) => {
    if (it.type !== 'lodging' && it.type !== 'flight') return [];
    const d = td.dayById.get(it.dayId);
    const when = [d ? `Day ${d.index} · ${fmtMonthDay(d.date)}` : '', it.start ?? it.timeNote ?? ''].filter(Boolean).join(' · ');
    const where = it.type === 'lodging' ? it.place?.name : undefined;
    return [{ id: it.id, icon: it.type === 'lodging' ? 'Building2' : 'Plane', title: it.title, sub: [when, where].filter(Boolean).join(' · ') }];
  });
  const placeRows = all
    .filter((h) => !h.hidden && h.itemId)
    .flatMap((h) => {
      const it = itemById.get(h.itemId!);
      const day = it && td.dayById.get(it.dayId);
      if (!it || !day || !it.place) return [];
      const url = navLink(it, day.tz, settings);
      return url ? [{ h, it, url, copy: placeCopyText(it.type === 'transit' ? it.toPlace ?? it.place : it.place) }] : [];
    });

  return (
    <div className={`${g.page} ${edit ? g.pageEditing : ''}`}>
      <TripThemeScope theme={trip.theme} />
      <div className={g.bar}>
        <div className={g.barRow}>
          <Link to={`/trip/${trip.id}/story`} className={g.iconBtn} aria-label="返回旅程概览">
            <Icon name="ChevronLeft" />
          </Link>
          <Link to="/trips" className={g.brand} aria-label="tongxing8 · 我的旅程">
            <BrandLockup height={26} />
          </Link>
          <span className={g.barSpacer} />
          {edit && <SaveBadge state={saver.state} msg={saver.msg} onRetry={saver.retry} />}
          {canEdit && (
            <button type="button" className={`${g.editBtn} ${edit ? g.editBtnOn : ''}`} onClick={() => setEditing(!edit)}>
              {edit ? '完成' : '编辑'}
            </button>
          )}
        </div>
      </div>
      {!canEdit && <p className={g.notice}>这是{trip.cloud?.ownerName ? `「${trip.cloud.ownerName}」` : '主用户'}整理的旅行亮点，更新后会随行程一起同步。</p>}

      {/* 第一页：封面（手机 M01 / 电脑 W01） */}
      <div className={g.coverGrid}>
        <header className={g.cover}>
          <div className={g.coverMedia}>
            {hasCover ? (
              <GuidePhoto photoKey={trip.coverBlobKey} focus={G.coverFocus} alt={`${place} 封面`} className={g.coverPhoto} />
            ) : (
              <div className={g.coverEmpty}>
                <Icon name="Image" size="lg" />
                <span>{edit ? '放一张你自己的旅行照片做封面' : canEdit ? '还没有封面照片，点右上角「编辑」添加' : '还没有封面照片'}</span>
              </div>
            )}
            {edit && (
              <button type="button" className={g.coverPhotoBtn} onClick={() => setPhotoFor('cover')}>
                <Icon name="Camera" size="sm" />
                {hasCover ? '更换封面' : '添加封面照片'}
              </button>
            )}
          </div>
          <div className={g.coverText}>
            <p className={g.eyebrow}>Travel note · {nDays} days</p>
            <h1 className={g.coverTitle}>{place}</h1>
            <p className={g.coverMeta}>
              <span>{fmtDateRange(trip.startDate, trip.endDate)}</span>
              <span>{nDays > 1 ? `${nDays} 天 ${nDays - 1} 夜` : `${nDays} 天`}</span>
            </p>
            <EditableText
              className={g.intro}
              editing={edit}
              multiline
              max={LIMITS.intro}
              label="旅行简介"
              placeholder="写一两句话介绍这趟旅行（可选）"
              value={G.intro ?? ''}
              onCommit={(v) => run(() => setIntro(trip.id, v))}
            />
          </div>
        </header>

        {/* 旅程档案：只读现有旅程资料 */}
        <aside className={g.dossier} aria-label="旅程档案">
          <h2 className={g.dossierTitle}>旅程档案</h2>
          <dl>
            <div>
              <dt>目的地</dt>
              <dd>{place}</dd>
            </div>
            <div>
              <dt>日期</dt>
              <dd>{fmtDateRange(trip.startDate, trip.endDate)}</dd>
            </div>
            <div>
              <dt>天数</dt>
              <dd>{nDays > 1 ? `${nDays} 天 ${nDays - 1} 夜` : `${nDays} 天`}</dd>
            </div>
            {cities.length > 0 && (
              <div>
                <dt>城市</dt>
                <dd>{cities.join(' · ')}</dd>
              </div>
            )}
            <div>
              <dt>精选亮点</dt>
              <dd>{visibleCount} 个</dd>
            </div>
          </dl>
        </aside>
      </div>

      {/* 封面下的亮点预览：前 3 个 */}
      {preview.length > 0 && (
        <section className={g.preview} aria-labelledby="g-pre">
          <div className={g.wrapInner}>
            <div className={g.previewHead}>
              <h2 id="g-pre" className={g.h2}>
                旅行亮点 <small>The shortlist</small>
              </h2>
              <a href="#g-hl" className={g.moreLink}>
                查看全部
                <Icon name="ChevronRight" size="xs" />
              </a>
            </div>
            <ol className={g.previewList}>
              {preview.map((h, i) => (
                <li key={h.id} className={g.previewCard}>
                  <GuidePhoto photoKey={h.photoKey} focus={h.focus} alt={h.title} className={g.previewPhoto} fallback={<span className={g.previewNum}>{pad(i + 1)}</span>} />
                  <p className={g.previewTitle}>{h.title}</p>
                  {h.desc && <p className={g.previewDesc}>{h.desc}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <div className={g.wrap}>
        {/* B 精选亮点 */}
        <section className={g.section} aria-labelledby="g-hl">
          <h2 id="g-hl" tabIndex={-1} className={g.h2}>
            这一趟的精选亮点 <small>Highlights</small>
          </h2>
          <div className={g.rule} />
          {shown.length === 0 ? (
            <div className={g.empty}>
              <p>{canEdit ? '还没有亮点。先从行程里挑几个想展示的地方，再配上自己的照片和一句话。' : '主用户还没有添加旅行亮点。'}</p>
              {canEdit && (
                <Button
                  icon="Plus"
                  onClick={() => {
                    setEditing(true);
                    setAdding(true);
                  }}
                >
                  添加亮点
                </Button>
              )}
            </div>
          ) : !edit ? (
            <ReadHighlights list={shown} dayOf={(h) => h.dayIndex ?? (h.itemId && itemById.get(h.itemId) ? td.dayById.get(itemById.get(h.itemId)!.dayId)?.index : undefined)} />
          ) : (
            <ol className={g.hList} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {shown.map((h, i) => {
                const it = h.itemId ? itemById.get(h.itemId) : undefined;
                const ls = linkState(h, td.items);
                const day = h.dayIndex ?? (it ? td.dayById.get(it.dayId)?.index : undefined);
                const url = it && it.place ? navLink(it, td.dayById.get(it.dayId)?.tz ?? trip.homeTz, settings) : undefined;
                const pos = ids.indexOf(h.id);
                const classes = [g.hCard, i === 0 ? g.hFirst : '', h.hidden ? g.hCardHidden : '', drag?.id === h.id ? g.hCardDrag : '', drag && drag.id !== h.id && drag.over === pos ? g.hCardOver : ''].join(' ');
                return (
                  <li key={h.id} className={classes} data-hl={h.id} ref={(el) => { if (el) cardRefs.current.set(h.id, el); else cardRefs.current.delete(h.id); }}>
                    {(edit || h.photoKey) && (
                      <div className={g.hPhotoWrap}>
                        <GuidePhoto
                          photoKey={h.photoKey}
                          focus={h.focus}
                          alt={h.title}
                          className={g.hPhoto}
                          fallback={edit ? <span>点「照片」添加一张</span> : <span>{CATEGORY_LABEL[h.category]}</span>}
                        />
                        {edit && (
                          <button type="button" className={g.photoEdit} onClick={() => setPhotoFor(h.id)}>
                            <Icon name="Camera" size="sm" />
                            {h.photoKey ? '换照片' : '照片'}
                          </button>
                        )}
                      </div>
                    )}
                    <div>
                      <span className={g.hNum}>{pad(i + 1)}</span>
                      <div className={g.hMeta}>
                        <span>{CATEGORY_LABEL[h.category]}</span>
                        {day !== undefined && <span className={g.dot}>Day {day}</span>}
                        {h.hidden && <span className={g.dot}>已隐藏</span>}
                      </div>
                      <EditableText
                        as="h3"
                        className={g.hTitle}
                        editing={edit}
                        required
                        max={LIMITS.title}
                        label="亮点标题"
                        placeholder="标题"
                        value={h.title}
                        onCommit={(v) => run(() => updateHighlight(h.id, { title: v }))}
                      />
                      <EditableText
                        className={g.hDesc}
                        editing={edit}
                        multiline
                        max={LIMITS.desc}
                        label="亮点描述"
                        placeholder="写一两句话（可选）"
                        value={h.desc ?? ''}
                        onCommit={(v) => run(() => updateHighlight(h.id, { desc: v }))}
                      />
                      {ls === 'missing' && edit && <p className={g.warn}>原行程里这一项已经不存在，这条亮点仍然保留。</p>}
                      {!edit && url && it && (
                        <button type="button" className={g.navLink} onClick={() => openExternal(url, placeCopyText(it.place!))}>
                          <Icon name="Navigation" size="sm" />
                          导航
                        </button>
                      )}
                      {edit && (
                        <div className={g.tools}>
                          <button type="button" className={`${g.tool} ${g.grip}`} aria-label={`拖动「${h.title}」调整顺序`} onPointerDown={(e) => startDrag(h.id, e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
                            <Icon name="GripVertical" size="sm" />
                          </button>
                          <button type="button" className={g.tool} disabled={pos === 0} aria-label={`上移「${h.title}」`} onClick={() => reorder(moveId(ids, h.id, -1))}>
                            <Icon name="ChevronUp" size="sm" />
                          </button>
                          <button type="button" className={g.tool} disabled={pos === ids.length - 1} aria-label={`下移「${h.title}」`} onClick={() => reorder(moveId(ids, h.id, 1))}>
                            <Icon name="ChevronDown" size="sm" />
                          </button>
                          <button type="button" className={g.tool} onClick={() => run(() => updateHighlight(h.id, { hidden: !h.hidden }))}>
                            <Icon name={h.hidden ? 'Eye' : 'EyeOff'} size="sm" />
                            {h.hidden ? '显示' : '隐藏'}
                          </button>
                          <button type="button" className={`${g.tool} ${g.toolDanger}`} onClick={() => setConfirmDel(h)}>
                            <Icon name="Trash2" size="sm" />
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {edit && shown.length > 0 && (
            <div className={g.addBtn}>
              <Button variant="outline" icon="Plus" block onClick={() => setAdding(true)}>
                添加亮点
              </Button>
            </div>
          )}
        </section>

        {/* C 每日精选 */}
        <section className={g.section} aria-labelledby="g-days">
          <h2 id="g-days" className={g.h2}>
            {nDays} 天的故事 <small>Daily picks</small>
          </h2>
          <div className={g.rule} />
          <DaysSection
            picks={picks}
            edit={edit}
            customTitle={(id) => G.days?.[id]?.title ?? ''}
            onOpenDay={openDay}
            onTitle={(id, v) => run(() => setDayTitle(trip.id, id, v))}
            onPhoto={(id) => setPhotoFor(`day:${id}`)}
            onHidden={(id, v) => run(() => setDayHidden(trip.id, id, v))}
          />
        </section>

        {/* 第四页：实用信息与私人便签 */}
        <InfoSection
          tips={G.tips}
          edit={edit}
          canEdit={canEdit}
          stay={stayRows}
          places={placeRows.map(({ h, it, url, copy }) => ({ id: h.id, title: h.title, place: it.place?.name ?? '', onNav: () => openExternal(url, copy) }))}
          onAdd={(c, text) => persist(() => addTip(trip.id, c, text))}
          onUpdate={(id, v) => run(() => updateTip(trip.id, id, v))}
          onRemove={(id) => run(() => removeTip(trip.id, id))}
          onMove={(id, dir) => run(() => moveTip(trip.id, id, dir))}
          onToggle={(id, done) => saver.run(() => toggleTip(trip.id, id, done))}
        />
      </div>

      <PhotoSheet
        open={photoFor !== null}
        title={photoFor === 'cover' ? '封面照片' : photoDay ? '当天照片' : '亮点照片'}
        currentKey={photoFor === 'cover' ? (hasCover ? trip.coverBlobKey : undefined) : photoDay ? photoDayOwn?.photoKey : photoTarget?.photoKey}
        currentFocus={photoFor === 'cover' ? G.coverFocus : photoDay ? photoDayOwn?.focus : photoTarget?.focus}
        aspect={photoFor === 'cover' ? '4 / 5' : '4 / 3'}
        onClose={() => setPhotoFor(null)}
        onSave={(blob, focus) =>
          persist(async () => {
            if (photoFor === 'cover') {
              if (blob) await setCover(trip.id, blob);
              await setCoverFocus(trip.id, focus);
            } else if (photoDay) {
              if (blob) await setDayPhoto(trip.id, photoDay, blob);
              await setDayFocus(trip.id, photoDay, focus);
            } else if (photoTarget) {
              if (blob) await setHighlightPhoto(photoTarget.id, blob);
              await updateHighlight(photoTarget.id, { focus });
            }
          })
        }
        onRemove={
          photoTarget
            ? () => persist(() => setHighlightPhoto(photoTarget.id, null))
            : photoDay && photoDayOwn?.photoKey
              ? () => persist(() => setDayPhoto(trip.id, photoDay, null))
              : undefined
        }
      />
      <AddSheet
        open={adding}
        days={td.days}
        items={td.items}
        highlights={all}
        onClose={() => setAdding(false)}
        onPickItem={(c) => persist(() => addHighlight({ tripId: trip.id, title: c.title, category: c.category, dayIndex: c.dayIndex, itemId: c.itemId }))}
        onCreate={(v) => persist(() => addHighlight({ tripId: trip.id, ...v }))}
      />
      <Dialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title={`删除亮点「${confirmDel?.title ?? ''}」？`}
        text={
          confirmDel?.itemId && itemById.has(confirmDel.itemId)
            ? `只会删除这里的展示内容和你上传的照片，不会删除行程里的「${itemById.get(confirmDel.itemId)!.title}」。`
            : '会删除这条亮点和它的照片，不能恢复。'
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                const h = confirmDel!;
                setConfirmDel(null);
                run(() => deleteHighlight(h.id));
              }}
            >
              删除
            </Button>
          </>
        }
      />
    </div>
  );
}
