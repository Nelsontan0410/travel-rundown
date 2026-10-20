// 旅行亮点：口袋旅行指南。读取 Rundown 的日期、天数、行程项；用户自己的内容（封面摆位、简介、亮点、照片、贴士）
// 存在独立的 guides / highlights 表里，编辑它们不会改动行程。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import g from './Guide.module.css';
import TripUnavailable from '../TripUnavailable';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Basics';
import { Dialog } from '../../components/Layout';
import { TripThemeScope } from '../../components/TripTheme';
import { BrandLockup } from '../../components/Brand';
import { makeThumb } from '../../lib/photo';
import { db } from '../../db/schema';
import { setCover } from '../../db/repo';
import { moveTip, setDayFocus, setDayHidden, setDayPhoto, setDayTitle, toggleTip } from '../../db/guide';
import { addHighlight, addTip, deleteHighlight, removeTip, reorderHighlights, setCoverFocus, setHighlightPhoto, setIntro, updateHighlight, updateTip } from '../../db/guide';
import { useBlobUrl, useSettings, useTripData } from '../../hooks/data';
import {
  dayPicks,
  moveId,
  LIMITS,
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
import { CoverEditor, DayEditor, EditPanel, HighlightEditor, ManageList, useWide } from './Editor';
import { DesktopOverview } from './Desktop';
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
  const [sel, setSel] = useState<{ kind: 'cover' } | { kind: 'tips' } | { kind: 'manage' } | { kind: 'hl'; id: string } | { kind: 'day'; id: string } | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  // 编辑面板里还没离开输入框的文字（草稿），用来提醒离开前没保存
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const onDirty = useCallback((key: string, d: boolean) => {
    setDirtyKeys((cur) => {
      if (cur.has(key) === d) return cur;
      const next = new Set(cur);
      if (d) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const wide = useWide();
  const unsaved = dirtyKeys.size > 0 || saver.state === 'saving' || saver.state === 'error';
  // 关掉或刷新页面时，有没保存的修改先提醒
  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsaved]);

  const all = useMemo(() => sortHighlights(hs ?? []), [hs]);

  if (td === null) return <TripUnavailable tripId={tripId ?? ''} title="旅行亮点" />;
  if (!td || hs === undefined || guide === undefined) return <div className={g.page} />;

  const { trip } = td;
  const canEdit = trip.cloud?.role !== 'member';
  const edit = editing && canEdit;
  const G: Guide = guide ?? { tripId: trip.id, tips: [], updatedAt: '' };
  const shown = edit ? all : all.filter((h) => !h.hidden);
  const persist = async (fn: () => Promise<unknown>) => {
    const r = await saver.run(fn);
    if (r !== true) throw new Error(r);
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

  const reorder = (next: string[]) => run(() => reorderHighlights(trip.id, next));

  const openDay = (dayId: string) => {
    selectDay(trip.id, dayId);
    if (unsaved) setLeaveTo(`/itinerary/${trip.id}`);
    else nav(`/itinerary/${trip.id}`);
  };
  /** 有还没保存的修改时，离开前先问一下 */
  const guardLeave = (e: React.MouseEvent, to: string) => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!unsaved) return;
    e.preventDefault();
    setLeaveTo(to);
  };
  const selHl = sel?.kind === 'hl' ? all.find((h) => h.id === sel.id) : undefined;
  const selDay = sel?.kind === 'day' ? picks.find((p) => p.day.id === sel.id) : undefined;
  const panelTitle = !sel ? '' : sel.kind === 'cover' ? '编辑封面' : sel.kind === 'tips' ? '编辑实用信息' : sel.kind === 'manage' ? '管理亮点' : sel.kind === 'day' ? `编辑 Day ${selDay?.day.index ?? ''}` : `编辑亮点：${selHl?.title ?? ''}`;
  const panelOpen = edit && !!sel && (sel.kind === 'cover' || sel.kind === 'tips' || sel.kind === 'manage' || !!selHl || !!selDay);
  const closePanel = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setSel(null);
  };
  const toggleEdit = () => {
    // 先让正在输入的框失去焦点，草稿会立即保存
    (document.activeElement as HTMLElement | null)?.blur?.();
    setSel(null);
    setEditing(!edit);
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
    <div className={`${g.page} ${edit ? g.pageEditing : ''} ${edit && sel && wide ? g.withPanel : ''}`}>
      <TripThemeScope theme={trip.theme} />
      {wide ? (
        <DesktopOverview
          tripId={trip.id}
          tripTitle={trip.title}
          place={place}
          dates={fmtDateRange(trip.startDate, trip.endDate)}
          nightsLabel={nDays > 1 ? `${nDays} 天 ${nDays - 1} 夜` : `${nDays} 天`}
          cities={cities}
          coverKey={hasCover ? trip.coverBlobKey : undefined}
          coverFocus={G.coverFocus}
          intro={G.intro}
          highlights={all}
          picks={picks}
          tips={G.tips}
          stay={stayRows}
          places={placeRows.map(({ h, it, url, copy }) => ({ id: h.id, title: h.title, place: it.place?.name ?? '', onNav: () => openExternal(url, copy) }))}
          canEdit={canEdit}
          edit={edit}
          ownerName={trip.cloud?.ownerName}
          save={{ state: saver.state, msg: saver.msg, onRetry: saver.retry }}
          dayOf={(h) => h.dayIndex ?? (h.itemId && itemById.get(h.itemId) ? td.dayById.get(itemById.get(h.itemId)!.dayId)?.index : undefined)}
          guard={guardLeave}
          onToggleEdit={toggleEdit}
          onCoverPhoto={() => setPhotoFor('cover')}
          onCoverEdit={() => setSel({ kind: 'cover' })}
          onAdd={() => {
            if (!edit) setEditing(true);
            setAdding(true);
          }}
          onManage={() => setSel({ kind: 'manage' })}
          onOpenHl={(id) => setSel({ kind: 'hl', id })}
          onOpenDay={openDay}
          onEditDay={(id) => setSel({ kind: 'day', id })}
          onEditTips={() => setSel({ kind: 'tips' })}
          onToggleTip={(id, done) => void saver.run(() => toggleTip(trip.id, id, done))}
        />
      ) : (
        <>
      <div className={g.bar}>
        <div className={g.barRow}>
          <Link to={`/trip/${trip.id}/story`} className={g.iconBtn} aria-label="返回旅程概览" onClick={(e) => guardLeave(e, `/trip/${trip.id}/story`)}>
            <Icon name="ChevronLeft" />
          </Link>
          <Link to="/trips" className={g.brand} aria-label="tongxing8 · 我的旅程" onClick={(e) => guardLeave(e, '/trips')}>
            <BrandLockup height={26} />
          </Link>
          <span className={g.barSpacer} />
          {edit && <SaveBadge state={saver.state} msg={saver.msg} onRetry={saver.retry} />}
          {canEdit && (
            <button
              type="button"
              className={`${g.editBtn} ${edit ? g.editBtnOn : ''}`}
              onClick={toggleEdit}
            >
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
              <span className={g.coverBtns}>
                <button type="button" className={g.coverPhotoBtn} onClick={() => setPhotoFor('cover')}>
                  <Icon name="Camera" size="sm" />
                  {hasCover ? '更换封面' : '添加封面照片'}
                </button>
                <button type="button" className={g.coverPhotoBtn} onClick={() => setSel({ kind: 'cover' })}>
                  <Icon name="Pencil" size="sm" />
                  编辑封面
                </button>
              </span>
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
                  <GuidePhoto thumb photoKey={h.photoKey} focus={h.focus} alt={h.title} className={g.previewPhoto} fallback={<span className={g.previewNum}>{pad(i + 1)}</span>} />
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
            <>
              <p className={g.hint}>点一条亮点就能改照片和文字；按住 ⋮⋮ 拖动，或用上下箭头调整顺序。</p>
              <ManageList
                list={all}
                selected={sel?.kind === 'hl' ? sel.id : undefined}
                onOpen={(id) => setSel({ kind: 'hl', id })}
                onReorder={reorder}
                onToggle={(h) => run(() => updateHighlight(h.id, { hidden: !h.hidden }))}
              />
            </>
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
        </>
      )}

      <EditPanel open={panelOpen} wide={wide} title={panelTitle} onClose={closePanel}>
        {sel?.kind === 'cover' ? (
          <CoverEditor
            photoKey={hasCover ? trip.coverBlobKey : undefined}
            place={place}
            dates={fmtDateRange(trip.startDate, trip.endDate)}
            days={nDays > 1 ? `${nDays} 天 ${nDays - 1} 夜` : `${nDays} 天`}
            intro={G.intro ?? ''}
            onPhoto={() => setPhotoFor('cover')}
            onIntro={(v) => run(() => setIntro(trip.id, v))}
            onDirty={onDirty}
          />
        ) : sel?.kind === 'tips' ? (
          <InfoSection
            compact
            tips={G.tips}
            edit
            canEdit={canEdit}
            stay={[]}
            places={[]}
            onAdd={(c, text) => persist(() => addTip(trip.id, c, text))}
            onUpdate={(id, v) => run(() => updateTip(trip.id, id, v))}
            onRemove={(id) => run(() => removeTip(trip.id, id))}
            onMove={(id, dir) => run(() => moveTip(trip.id, id, dir))}
            onToggle={(id, done) => saver.run(() => toggleTip(trip.id, id, done))}
          />
        ) : sel?.kind === 'manage' ? (
          <>
            <p className={g.hint}>点一条就能改照片和文字；按住 ⋮⋮ 拖动，或用上下箭头调整顺序。</p>
            <ManageList list={all} onOpen={(id) => setSel({ kind: 'hl', id })} onReorder={reorder} onToggle={(h) => run(() => updateHighlight(h.id, { hidden: !h.hidden }))} />
            <div className={g.addBtn}>
              <Button variant="outline" icon="Plus" block onClick={() => setAdding(true)}>
                添加亮点
              </Button>
            </div>
          </>
        ) : selDay ? (
          <DayEditor
            key={selDay.day.id}
            dayId={selDay.day.id}
            label={`Day ${selDay.day.index}`}
            defaultTitle={selDay.day.title || selDay.day.city}
            title={G.days?.[selDay.day.id]?.title ?? ''}
            photoKey={selDay.photoKey}
            focus={selDay.focus}
            hidden={selDay.hidden}
            onTitle={(v) => run(() => setDayTitle(trip.id, selDay.day.id, v))}
            onPhoto={() => setPhotoFor(`day:${selDay.day.id}`)}
            onHidden={(v) => run(() => setDayHidden(trip.id, selDay.day.id, v))}
            onDirty={onDirty}
          />
        ) : selHl ? (
          <HighlightEditor
            key={selHl.id}
            h={selHl}
            items={td.items}
            days={td.days}
            onPatch={(patch) => run(() => updateHighlight(selHl.id, patch))}
            onPhoto={() => setPhotoFor(selHl.id)}
            onDelete={() => setConfirmDel(selHl)}
            onDirty={onDirty}
            order={{
              pos: all.findIndex((h) => h.id === selHl.id),
              total: all.length,
              onMove: (dir) => reorder(moveId(all.map((h) => h.id), selHl.id, dir)),
            }}
          />
        ) : null}
      </EditPanel>
      <Dialog
        open={!!leaveTo}
        onClose={() => setLeaveTo(null)}
        title={saver.state === 'error' ? '有修改保存失败' : '还有修改没保存完'}
        text={saver.state === 'error' ? '离开后这些修改会丢失。可以留下来点「重试」。' : '正在保存或还有没离开输入框的文字，离开可能会丢失。'}
        actions={
          <>
            <Button variant="outline" onClick={() => setLeaveTo(null)}>
              留下
            </Button>
            <Button
              onClick={() => {
                const to = leaveTo!;
                setLeaveTo(null);
                setDirtyKeys(new Set());
                nav(to);
              }}
            >
              仍然离开
            </Button>
          </>
        }
      />
      <PhotoSheet
        open={photoFor !== null}
        title={photoFor === 'cover' ? '封面照片' : photoDay ? '当天照片' : '亮点照片'}
        currentKey={photoFor === 'cover' ? (hasCover ? trip.coverBlobKey : undefined) : photoDay ? photoDayOwn?.photoKey : photoTarget?.photoKey}
        currentFocus={photoFor === 'cover' ? G.coverFocus : photoDay ? photoDayOwn?.focus : photoTarget?.focus}
        aspect={photoFor === 'cover' ? '4 / 5' : '4 / 3'}
        ratios={!!photoTarget}
        onClose={() => setPhotoFor(null)}
        onSave={(blob, focus) =>
          persist(async () => {
            if (photoFor === 'cover') {
              if (blob) await setCover(trip.id, blob);
              await setCoverFocus(trip.id, focus);
            } else if (photoDay) {
              if (blob) await setDayPhoto(trip.id, photoDay, blob, await makeThumb(blob));
              await setDayFocus(trip.id, photoDay, focus);
            } else if (photoTarget) {
              if (blob) await setHighlightPhoto(photoTarget.id, blob, await makeThumb(blob));
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
        onPickItem={async (c) => {
          let id = '';
          await persist(async () => {
            id = await addHighlight({ tripId: trip.id, title: c.title, category: c.category, dayIndex: c.dayIndex, itemId: c.itemId });
          });
          setSel({ kind: 'hl', id });
        }}
        onCreate={async (v) => {
          let id = '';
          await persist(async () => {
            id = await addHighlight({ tripId: trip.id, ...v, thumb: v.photo ? await makeThumb(v.photo) : undefined });
          });
          setSel({ kind: 'hl', id });
        }}
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
                setSel(null);
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
