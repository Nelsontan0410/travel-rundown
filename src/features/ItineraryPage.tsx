import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Screen, RootHeader } from '../components/Layout';
import { Button, EmptyLine, EmptyState } from '../components/Basics';
import { DayHeading, DayTiles, HeroCover, Timeline, TimelineRow } from '../components/Itinerary';
import { readiness, statusOf, useAppShellReady, useBlobUrl, useCurrentTripId, useSettings, useTripData } from '../hooks/data';
import { navLink } from '../links/maps';
import { LedgerSummaryCard } from '../components/Ledger';
import { useUI } from '../store/ui';
import { fmtDate, fmtDateRange, fmtMoney, SEP, utcOffsetLabel } from '../domain/format';
import { currentItemId, defaultDay, docsForItem, itemIcon, itemSubtitle, ledgerSummary, placeCopyText, rightSlot } from '../domain/rules';
import { openExternal } from '../links/openLink';
import { setLastTrip } from '../db/repo';
import PhaseCard from '../components/PhaseCard';

/** 01 每日行程（行程 Tab 的首页） */
export default function ItineraryPage() {
  const nav = useNavigate();
  const { tripId: paramId } = useParams();
  const currentId = useCurrentTripId();
  const tripId = paramId ?? currentId;
  const td = useTripData(tripId);
  const app = useAppShellReady();
  const cover = useBlobUrl(td?.trip.coverBlobKey);
  const settings = useSettings();
  const selected = useUI((s) => (tripId ? s.selectedDay[tripId] : undefined));
  const selectDay = useUI((s) => s.selectDay);
  const [now, setNow] = useState(() => new Date());

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
    <Screen
      tab="itinerary"
      header={<RootHeader title={trip.title} icon="Settings" iconLabel="旅程设置" onIcon={() => nav(`/trip/${trip.id}/settings`)} />}
    >
      <HeroCover coverUrl={cover} dateRange={fmtDateRange(trip.startDate, trip.endDate)} offline={ready.allGreen} />
      <PhaseCard td={td} now={now} />
      <DayTiles days={td.days} selectedId={day?.id} onSelect={(id) => selectDay(trip.id, id)} />
      {day && <DayHeading title={dayTitle} sub={daySub} />}
      {items.length === 0 ? (
        <EmptyLine>这一天还没有安排</EmptyLine>
      ) : (
        <Timeline>
          {items.map((it, i) => {
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
              />
            );
          })}
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
  );
}
