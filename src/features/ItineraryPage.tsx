import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import p from './Page.module.css';
import { useBreakpoint } from '../hooks/layout';
import TripTools from '../components/TripTools';
import TripUnavailable from './TripUnavailable';
import { NoTripState } from './FirstRun';
import { ItineraryHeader, TripEntries } from '../components/DayGlance';
import { useCloud } from '../store/cloud';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, Sheet, BigHeader } from '../components/Layout';
import { Field, FormActions, TextInput } from '../components/Form';
import { Button, EmptyLine } from '../components/Basics';
import { DayHeading, DayTiles, Timeline, TimelineDivider, TimelineRow } from '../components/Itinerary';
import { checklistOrder } from '../domain/checklist';
import { setItemStatus, updateDay } from '../db/repo';
import { toast } from '../store/ui';
import { readiness, statusOf, useAppShellReady, useCurrentTripId, useSettings, useTripData } from '../hooks/data';
import { navLink } from '../links/maps';
import { LedgerSummaryCard } from '../components/Ledger';
import { useUI } from '../store/ui';
import { fmtDate, fmtDateRange, fmtMoney, nowIn, SEP, utcOffsetLabel } from '../domain/format';
import { currentItemId, defaultDay, docsForItem, itemIcon, itemSubtitle, ledgerSummary, placeCopyText, rightSlot } from '../domain/rules';
import { openExternal } from '../links/openLink';
import { setLastTrip } from '../db/repo';
import PhaseCard from '../components/PhaseCard';
import FlightCountdown from '../components/FlightCountdown';
import { pickToday } from '../domain/today';
import { UpdateNotice } from './CloudParts';

/** 01 每日行程（行程 Tab 的首页） */
export default function ItineraryPage() {
  const nav = useNavigate();
  const mobile = useBreakpoint() === 'mobile';
  const { tripId: paramId } = useParams();
  const currentId = useCurrentTripId();
  const tripId = paramId ?? currentId;
  const td = useTripData(tripId);
  const app = useAppShellReady();
  const settings = useSettings();
  const selected = useUI((s) => (tripId ? s.selectedDay[tripId] : undefined));
  const selectDay = useUI((s) => s.selectDay);
  const [now, setNow] = useState(() => new Date());
  const updates = useCloud((st) => st.updates);
  const [dayEdit, setDayEdit] = useState<{ title: string; city: string; note: string } | null>(null);

  useEffect(() => {
    if (paramId) void setLastTrip(paramId);
  }, [paramId]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const day = useMemo(() => {
    if (!td) return undefined;
    return td.days.find((d) => d.id === selected) ?? defaultDay(td.days, now);
  }, [td, selected, now]);

  // 选中格自动滚动到可见位置
  useEffect(() => {
    if (!day) return;
    document.querySelector(`[data-day="${day.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [day?.id]);

  // 2026-10-19：这台设备上没有这份旅程时说明原因、给加入入口（以前会跳到「还没有旅程」）
  if (paramId && td === null) return <TripUnavailable tripId={paramId} tab="itinerary" />;
  if (currentId === undefined || td === undefined) return <Screen tab="itinerary">{null}</Screen>;

  if (!td) {
    return (
      <Screen tab="itinerary" header={<BigHeader title="每日行程" />}>
        <NoTripState text="创建或加入一份旅程后，每天的安排、导航和完成勾选会显示在这里。" />
      </Screen>
    );
  }

  const { trip } = td;
  const ready = readiness(td, app);
  const items = day ? td.items.filter((i) => i.dayId === day.id) : [];
  const cur = day ? currentItemId(day, items, (k) => statusOf(td, k), now) : undefined;
  const dayTitle = day ? `Day ${day.index}${SEP}${day.title || day.city}` : '';
  const daySub = day ? `${fmtDate(day.date)}${SEP}当地时间 ${utcOffsetLabel(day.tz, now)}` : '';
  const ledger = ledgerSummary(trip.budget, td.expenses);

  // 2026-10-19 手机新层级：旅程名 / 日期 / 当天城市与主题 / 下一站 / 当天列表 / 资料与同伴
  const phase = pickToday(td.days, now);
  const todayIdx = phase.mode === 'today' && phase.day ? phase.day.index : undefined;
  const firstLocal = td.days[0] ? nowIn(td.days[0].tz, now).date : '';
  const daysToGo = phase.mode === 'before' && td.days[0] ? Math.max(1, Math.round((Date.parse(td.days[0].date) - Date.parse(firstLocal)) / 86_400_000)) : 0;
  const phaseText =
    phase.mode === 'before' ? `${daysToGo} 天后出发 · 共 ${td.days.length} 天` : phase.mode === 'today' ? `旅程第 ${todayIdx} 天 · 共 ${td.days.length} 天` : '旅程已结束';
  const pendingUpdate = updates[trip.id];
  const syncState = trip.cloud
    ? pendingUpdate
      ? { label: `有新版本 v${pendingUpdate.version}`, attention: true }
      : { label: trip.cloud.role === 'owner' ? `主用户 · 已发布 v${trip.cloud.version}` : `同伴 · 已套用 v${trip.cloud.version}` }
    : undefined;
  // 下一站：选中今天 → 第一个还没完成的；选中以后的日子 → 当天第一站；已经过去的日子不显示
  const tools = (
    <>
      {phase.day && (
        <div>
          <Button block variant="link" icon="CalendarDays" onClick={() => nav(`/trip/${trip.id}/today`)}>
            今日行程
          </Button>
        </div>
      )}
      <div className={p.tripShortcutLinks}>
        <Button variant="link" icon="Image" onClick={() => nav(`/trip/${trip.id}/story`)}>
          旅程概览
        </Button>
        <Button variant="link" icon="StickyNote" onClick={() => nav(`/trip/${trip.id}/outfits`)}>
          穿搭与行李
        </Button>
      </div>
      <details className={p.tripPreparation}>
        <summary>出发准备</summary>
        <PhaseCard td={td} now={now} hideDepartureCountdown />
        <Button variant="link" icon="Settings" onClick={() => nav(`/trip/${trip.id}/settings`)}>查看准备事项</Button>
      </details>
    </>
  );
  const sideTools = (
    <>
      {phase.day && (
        <div>
          <Button block variant="link" icon="CalendarDays" onClick={() => nav(`/trip/${trip.id}/today`)}>
            今日行程
          </Button>
        </div>
      )}
      <details className={p.tripPreparation}>
        <summary>出发准备</summary>
        <PhaseCard td={td} now={now} hideDepartureCountdown />
        <Button variant="link" icon="Settings" onClick={() => nav(`/trip/${trip.id}/settings`)}>查看准备事项</Button>
      </details>
    </>
  );
  const countdown = <FlightCountdown compactMobile key={trip.id} td={td} dateRange={fmtDateRange(trip.startDate, trip.endDate)} offline={ready.allGreen} />;

  return (
    <>
    <TripThemeScope theme={td.trip.theme} />
    <Screen
      tab="itinerary"
      sidebarMobile={false}
      header={
        <ItineraryHeader
          mobileActions={<TripTools
            onShare={() => nav(`/trip/${trip.id}/settings#sync`)}
            onToday={phase.day ? () => nav(`/trip/${trip.id}/today`) : undefined}
            onStory={() => nav(`/trip/${trip.id}/story`)}
            onOutfits={() => nav(`/trip/${trip.id}/outfits`)}
            preparation={<>
              <PhaseCard td={td} now={now} hideDepartureCountdown />
              <Button variant="link" icon="Settings" onClick={() => nav(`/trip/${trip.id}/settings`)}>查看准备事项</Button>
            </>}
          />}
          title={trip.title}
          phase={phaseText}
          sync={syncState}
          onSwitch={() => nav('/trips')}
          onSettings={() => nav(`/trip/${trip.id}/settings`)}
        />
      }
      sidebarHeader={
        // 2026-10-20：旅程名、设置、旅程封面、穿搭已经在侧栏导航里；这里只留今天和出发准备
        <div className={p.tripShortcuts}>
          <nav aria-label="旅程工具">{sideTools}</nav>
        </div>
      }
    >
      <UpdateNotice tripId={trip.id} role={trip.cloud?.role} />
      <div className={p.mobileItineraryHidden}>{(mobile || phase.mode === 'before') && countdown}</div>
      <DayTiles days={td.days} selectedId={day?.id} onSelect={(id) => selectDay(trip.id, id)} />
      {day && (
        // 2026-10-20：「添加一项」「编辑当天」和当天标题放在同一排（窄屏自动换行）
        <div className={p.dayHeadRow}>
          <div className={p.dayHeadText}>
            <DayHeading title={dayTitle} sub={daySub} />
          </div>
        <div className={p.dayTools}>
          <Button size="sm" variant="outline" icon="Plus" onClick={() => nav(`/trip/${trip.id}/add?day=${day.id}`)}>
            添加一项
          </Button>
          <Button size="sm" variant="outline" icon="Pencil" onClick={() => setDayEdit({ title: day.title ?? '', city: day.city, note: day.note ?? '' })}>
            编辑当天
          </Button>
        </div>
        </div>
      )}
      {day && (
        <Sheet open={!!dayEdit} onClose={() => setDayEdit(null)} title={`编辑 Day ${day.index}`}>
          {dayEdit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!dayEdit.city.trim()) return toast('城市不能空着');
                void updateDay(day.id, dayEdit).then(() => toast('已保存'));
                setDayEdit(null);
              }}
            >
              <Field label="当天主题">
                <TextInput value={dayEdit.title} placeholder="例如：小樽一日游" onChange={(e) => setDayEdit({ ...dayEdit, title: e.target.value })} />
              </Field>
              <Field label="城市">
                <TextInput value={dayEdit.city} onChange={(e) => setDayEdit({ ...dayEdit, city: e.target.value })} />
              </Field>
              <Field label="当天备注">
                <TextInput value={dayEdit.note} onChange={(e) => setDayEdit({ ...dayEdit, note: e.target.value })} />
              </Field>
              <FormActions>
                <Button type="submit">保存</Button>
              </FormActions>
            </form>
          )}
        </Sheet>
      )}
      {items.length === 0 ? (
        <EmptyLine>这一天还没有安排</EmptyLine>
      ) : (
        <Timeline>
          {(() => {
            const { open, done } = checklistOrder(items, (k) => statusOf(td, k));
            const row = (it: (typeof items)[number], i: number) => {
            const status = statusOf(td, it.key);
            const docs = docsForItem(td.docs, it.key);
            const isCur = it.id === cur;
            const target = it.type === 'transit' ? it.toPlace ?? it.place : it.place;
            const copy = target ? placeCopyText(target) : it.title;
            const url = day ? navLink(it, day.tz, settings) : undefined;
            const openNav = () => url && openExternal(url, copy);
            const slot = rightSlot(it, status, docs.length, !!url);
            return (
              <TimelineRow
                key={it.id}
                first={i === 0}
                time={it.start ?? it.timeNote}
                dot={status === 'done' ? 'done' : isCur ? 'current' : 'pending'}
                icon={itemIcon(it)}
                title={it.title}
                subtitle={itemSubtitle(it)}
                note={it.note}
                slot={slot}
                current={isCur}
                actions={{
                  proof: docs.length ? () => nav(`/doc/${docs[0].id}?item=${encodeURIComponent(it.key)}`) : undefined,
                  nav: url && slot.kind !== 'nav' ? openNav : undefined,
                }}
                onOpen={() => nav(`/item/${it.id}`)}
                onNav={openNav}
                checked={status === 'done'}
                onCheck={(v) => void setItemStatus(trip.id, it.key, v ? 'done' : 'todo')}
              />
            );
            };
            return (
              <>
                {open.map((it, i) => row(it, i))}
                {done.length > 0 && <TimelineDivider label={`已完成（${done.length}）`} />}
                {done.map((it, i) => row(it, i))}
              </>
            );
          })()}
        </Timeline>
      )}
      <TripEntries
        docs={td.docs.length ? `预订资料（${td.docs.length}）` : '预订资料'}
        mates={trip.cloud ? '同伴与同步' : '邀请同伴'}
        onDocs={() => nav('/docs')}
        onMates={() => nav(`/trip/${trip.id}/settings#sync`)}
      />
      {!mobile && phase.mode !== 'before' && <div className={`${p.mt16} ${p.mobileItineraryHidden}`}>{countdown}</div>}
      <div className={p.mobileItineraryHidden} style={{ marginTop: 'var(--space-6)' }}>
        <LedgerSummaryCard
          budget={ledger.budget}
          spent={ledger.spent}
          left={ledger.left}
          fmt={fmtMoney}
          onClick={() => nav(`/trip/${trip.id}/ledger`)}
        />
      </div>
      <nav className={`${p.mobileTools} ${p.tabletTools} ${p.mobileItineraryHidden}`} aria-label="旅程工具">
        <p className={p.tripToolsTitle}>旅程工具</p>
        {tools}
      </nav>
    </Screen>
    </>
  );
}
