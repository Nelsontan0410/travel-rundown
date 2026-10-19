import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import p from './Page.module.css';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, Sheet } from '../components/Layout';
import { Field, FormActions, TextInput } from '../components/Form';
import { Button, EmptyLine, EmptyState } from '../components/Basics';
import { DayHeading, DayTiles, Timeline, TimelineDivider, TimelineRow } from '../components/Itinerary';
import { checklistOrder } from '../domain/checklist';
import { setItemStatus, updateDay } from '../db/repo';
import { toast } from '../store/ui';
import { readiness, statusOf, useAppShellReady, useCurrentTripId, useSettings, useTripData } from '../hooks/data';
import { navLink } from '../links/maps';
import { LedgerSummaryCard } from '../components/Ledger';
import { useUI } from '../store/ui';
import { fmtDate, fmtDateRange, fmtMoney, SEP, utcOffsetLabel } from '../domain/format';
import { currentItemId, defaultDay, docsForItem, itemIcon, itemSubtitle, ledgerSummary, placeCopyText, rightSlot } from '../domain/rules';
import { openExternal } from '../links/openLink';
import { setLastTrip } from '../db/repo';
import PhaseCard from '../components/PhaseCard';
import FlightCountdown, { FlightTripHeader } from '../components/FlightCountdown';
import { pickToday } from '../domain/today';
import { UpdateNotice } from './CloudParts';

/** 01 每日行程（行程 Tab 的首页） */
export default function ItineraryPage() {
  const nav = useNavigate();
  const { tripId: paramId } = useParams();
  const currentId = useCurrentTripId();
  const tripId = paramId ?? currentId;
  const td = useTripData(tripId);
  const app = useAppShellReady();
  const settings = useSettings();
  const selected = useUI((s) => (tripId ? s.selectedDay[tripId] : undefined));
  const selectDay = useUI((s) => s.selectDay);
  const [now, setNow] = useState(() => new Date());
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

  if (paramId && td === null) return <Navigate to="/itinerary" replace />;
  if (currentId === undefined || td === undefined) return <Screen tab="itinerary">{null}</Screen>;

  if (!td) {
    return (
      <Screen tab="itinerary">
        <EmptyState
          title="还没有旅程"
          text="先到「旅程」页导入一份行程"
          action={
            <Button variant="link" onClick={() => nav('/trips')}>
              去导入
            </Button>
          }
        />
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

  return (
    <>
    <TripThemeScope theme={td.trip.theme} />
    <Screen
      tab="itinerary"
      sidebarHeader={<>
        <FlightTripHeader title={trip.title} onSettings={() => nav(`/trip/${trip.id}/settings`)} />
        <div className={p.tripShortcuts}>
          <p className={p.tripToolsTitle}>旅程工具</p>
          <nav aria-label="旅程工具">
      {(() => {
        // 2026-10：「今天」页入口。行程中最显眼；出发前和结束后用来预览
        const t = pickToday(td.days, now);
        if (!t.day) return null;
        return (
          <div>
            <Button block variant="link" icon="CalendarDays" onClick={() => nav(`/trip/${trip.id}/today`)}>
              今日行程
            </Button>
          </div>
        );
      })()}
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
          </nav>
        </div>
      </>}
    >
      <UpdateNotice tripId={trip.id} role={trip.cloud?.role} />
      <FlightCountdown key={trip.id} td={td} dateRange={fmtDateRange(trip.startDate, trip.endDate)} offline={ready.allGreen} />
      <DayTiles days={td.days} selectedId={day?.id} onSelect={(id) => selectDay(trip.id, id)} />
      {day && <DayHeading title={dayTitle} sub={daySub} />}
      {day && (
        <div className={p.dayTools}>
          <Button size="sm" variant="outline" icon="Plus" onClick={() => nav(`/trip/${trip.id}/add?day=${day.id}`)}>
            添加一项
          </Button>
          <Button size="sm" variant="outline" icon="Pencil" onClick={() => setDayEdit({ title: day.title ?? '', city: day.city, note: day.note ?? '' })}>
            编辑当天
          </Button>
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
      <div style={{ marginTop: 'var(--space-6)' }}>
        <LedgerSummaryCard
          budget={ledger.budget}
          spent={ledger.spent}
          left={ledger.left}
          fmt={fmtMoney}
          onClick={() => nav(`/trip/${trip.id}/ledger`)}
        />
      </div>
    </Screen>
    </>
  );
}
