// 2026-10 第一批 ⑤：「今天」页 —— 出门后主要看这一页：下一项、今晚住哪里、今天穿什么、今天的交通与订单、今天的完整安排。
// 下一项由用户点「完成」或「跳过」推进，不按时间自动判定；可以手动切换日期提前查看。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import p from './Page.module.css';
import TripUnavailable from './TripUnavailable';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader } from '../components/Layout';
import { Button, EmptyState, InfoBanner } from '../components/Basics';
import { DayTiles } from '../components/Itinerary';
import { ActionGrid, Agenda, AgendaRow, InfoCard, NextCard, QuickAction, TodayBanner, TodaySection } from '../components/Today';
import { OutfitStrip } from '../components/Wardrobe';
import { OfflineChip } from '../components/BookingExtras';
import { AddressCardSheet } from '../components/AddressCard';
import { PassViewer } from '../components/PassViewer';
import { setItemStatus, setLastTrip } from '../db/repo';
import { statusOf, useCurrentTripId, useSettings, useTripData, useTripPacking, useWardrobe, type TripData } from '../hooks/data';
import { navLink } from '../links/maps';
import { copyWithToast, openExternal } from '../links/openLink';
import { fmtDate, fmtMonthDay, fmtTimeRange, nowIn, SEP } from '../domain/format';
import { bookingSubtitle, bookingTitle, docsForItem, inBookingList, isToday, itemIcon, placeCopyText } from '../domain/rules';
import { isLinkDoc, OFFLINE_LABEL, offlineState } from '../domain/bookings';
import { addressCard } from '../domain/address';
import { outfitGarments } from '../domain/packing';
import { fmtLate, lateBy, lodgingTonight, nextItem, pickToday, scheduledNow } from '../domain/today';
import { viewOf } from './OutfitsPage';
import type { Day, Item } from '../domain/types';

export default function TodayPage() {
  const nav = useNavigate();
  const { tripId: paramId } = useParams();
  const currentId = useCurrentTripId();
  const tripId = paramId ?? currentId;
  const td = useTripData(tripId);
  const pk = useTripPacking(tripId);
  const wardrobe = useWardrobe();
  const settings = useSettings();
  const [now, setNow] = useState(() => new Date());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [addrFor, setAddrFor] = useState<Item | null>(null);
  const [passFor, setPassFor] = useState<Item | null>(null);

  useEffect(() => {
    if (paramId) void setLastTrip(paramId);
  }, [paramId]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (paramId && td === null) return <TripUnavailable tripId={paramId} title="今天" />;
  if (currentId === undefined || td === undefined || !pk || !wardrobe) return <Screen tab="itinerary" header={<BackHeader title="今天" />}>{null}</Screen>;
  if (!td) {
    return (
      <Screen tab="itinerary" header={<BackHeader title="今天" />}>
        <EmptyState title="还没有旅程" text="先到「旅程」页导入一份行程" />
      </Screen>
    );
  }

  const auto = pickToday(td.days, now);
  const day = td.days.find((d) => d.id === pickedId) ?? auto.day;
  if (!day) {
    return (
      <Screen tab="itinerary" header={<BackHeader title="今天" />}>
        <EmptyState title="这份旅程还没有日期" />
      </Screen>
    );
  }
  const live = isToday(day, now);
  const items = td.items.filter((i) => i.dayId === day.id);
  const st = (k: string) => statusOf(td, k);
  const next = nextItem(items, st);
  const late = next ? lateBy(day, next, now) : undefined;
  // 「原定现在」只提示还没处理的项；已完成或跳过的不再提
  const schedRaw = scheduledNow(day, items, now);
  const sched = schedRaw && st(schedRaw.key) === 'todo' ? schedRaw : undefined;
  const dayDate = (it: Item) => td.dayById.get(it.dayId)?.date ?? '';
  const hotel = lodgingTonight(day.date, td.items, dayDate);
  const outfit = pk.outfits.find((o) => o.dayIndex === day.index);
  const byId = new Map(wardrobe.map((g) => [g.id, g]));
  const bookings = items.filter((it) => it.type !== 'lodging' && inBookingList(it, docsForItem(td.docs, it.key).length));

  const kicker = live
    ? `今天${SEP}Day ${day.index}`
    : day.id === auto.day?.id && auto.mode === 'before'
      ? `还没出发${SEP}先预览 Day ${day.index}`
      : day.id === auto.day?.id && auto.mode === 'after'
        ? `旅程已结束${SEP}Day ${day.index}`
        : `预览${SEP}Day ${day.index}`;
  const sub = [fmtDate(day.date), day.city, live ? `当地时间 ${nowIn(day.tz, now).time}` : ''].filter(Boolean).join(SEP);

  return (
    <>
      <TripThemeScope theme={td.trip.theme} />
      <Screen
        tab="itinerary"
        header={<BackHeader title="今天" right={{ icon: 'CalendarDays', label: '完整行程', onClick: () => nav(`/itinerary/${td.trip.id}`) }} />}
      >
        <TodayBanner kicker={kicker} title={day.title ?? day.city} sub={sub} />
        <DayTiles days={td.days} selectedId={day.id} onSelect={setPickedId} />
        {pickedId && auto.day && pickedId !== auto.day.id && (
          <Button variant="link" chevron={false} icon="RotateCcw" onClick={() => setPickedId(null)}>
            {auto.mode === 'today' ? '回到今天' : `回到 Day ${auto.day.index}`}
          </Button>
        )}

        <TodaySection title="下一项" id="h-next">
          {next ? (
            <NextBlock
              td={td}
              day={day}
              it={next}
              late={late}
              sched={sched && sched.key !== next.key ? sched : undefined}
              onAddr={() => setAddrFor(next)}
              onPass={() => setPassFor(next)}
              settingsNav={(it) => navLink(it, day.tz, settings)}
            />
          ) : (
            <InfoBanner variant="success">这一天的安排都已完成或跳过。</InfoBanner>
          )}
        </TodaySection>

        <TodaySection title="今晚住" id="h-hotel">
          {hotel ? (
            <HotelBlock td={td} it={hotel} onAddr={() => setAddrFor(hotel)} onPass={() => setPassFor(hotel)} url={navLink(hotel, day.tz, settings)} />
          ) : (
            <p className={p.lockNote}>这一晚没有住宿安排。</p>
          )}
        </TodaySection>

        <TodaySection
          title="今天穿"
          id="h-outfit"
          action={
            <Button variant="link" chevron={false} icon="Pencil" onClick={() => nav(`/trip/${td.trip.id}/outfits`)}>
              {outfit?.garmentIds.length ? '修改' : '安排穿搭'}
            </Button>
          }
        >
          <OutfitStrip garments={outfitGarments(outfit, byId).map(viewOf)} empty="这一天还没安排穿搭。" />
          {outfit?.note && <p className={p.lockNote}>{outfit.note}</p>}
        </TodaySection>

        {bookings.length > 0 && (
          <TodaySection title="今天的交通与订单" id="h-bookings">
            <div className={p.stack}>
              {bookings.map((it) => {
                const docs = docsForItem(td.docs, it.key);
                const off = OFFLINE_LABEL[offlineState(it, docs, td.savedBlobs).level];
                return (
                  <InfoCard key={it.id} icon={itemIcon(it)} title={bookingTitle(it)} sub={bookingSubtitle(it, day)}>
                    <div className={p.todayRow}>
                      <OfflineChip variant={off.variant} label={off.label} />
                      <Button size="sm" variant="outline" icon="Eye" onClick={() => setPassFor(it)}>
                        出示
                      </Button>
                    </div>
                  </InfoCard>
                );
              })}
            </div>
          </TodaySection>
        )}

        <TodaySection title={`Day ${day.index} 全部安排`} id="h-agenda">
          {items.length ? (
            <Agenda>
              {items.map((it) => (
                <AgendaRow
                  key={it.id}
                  time={it.start ?? it.timeNote}
                  icon={itemIcon(it)}
                  title={it.title}
                  state={st(it.key)}
                  isNext={it.key === next?.key}
                  hint={live && it.key === sched?.key && it.key !== next?.key ? '原定现在' : undefined}
                  onClick={() => nav(`/item/${it.id}`)}
                />
              ))}
            </Agenda>
          ) : (
            <p className={p.lockNote}>这一天还没有安排。</p>
          )}
        </TodaySection>

        {addrFor && (() => {
          const d = td.dayById.get(addrFor.dayId) ?? day;
          const card = addressCard(addrFor, addrFor.type === 'flight' && d.index === 1 ? td.trip.homeTz : d.tz);
          const url = navLink(addrFor, d.tz, settings);
          return card ? (
            <AddressCardSheet
              open
              onClose={() => setAddrFor(null)}
              card={card}
              onCopy={(text, what) => void copyWithToast(text, `已复制${what}`)}
              onRoute={url ? () => openExternal(url, placeCopyText(addrFor.toPlace ?? addrFor.place ?? { name: addrFor.title })) : undefined}
            />
          ) : null;
        })()}
        {passFor && (
          <PassViewer
            open
            onClose={() => setPassFor(null)}
            title={bookingTitle(passFor)}
            subtitle={bookingSubtitle(passFor, td.dayById.get(passFor.dayId) ?? day)}
            bookingRef={passFor.bookingRef}
            docs={docsForItem(td.docs, passFor.key).map((d) => ({
              id: d.id, title: d.title, mime: d.mime, blobKey: d.blobKey, saved: td.savedBlobs.has(d.blobKey), locked: !!d.lock,
              codeKind: d.codeKind, url: d.url, app: d.app, link: isLinkDoc(d),
            }))}
            onCopyRef={() => void copyWithToast(passFor.bookingRef!)}
            onOpenDoc={(id) => nav(`/doc/${id}?item=${encodeURIComponent(passFor.key)}`)}
            onOpenLink={(url) => openExternal(url)}
          />
        )}
      </Screen>
    </>
  );
}

function NextBlock({
  td,
  day,
  it,
  late,
  sched,
  onAddr,
  onPass,
  settingsNav,
}: {
  td: TripData;
  day: Day;
  it: Item;
  late?: number;
  sched?: Item;
  onAddr: () => void;
  onPass: () => void;
  settingsNav: (it: Item) => string | undefined;
}) {
  const nav = useNavigate();
  const url = settingsNav(it);
  const docs = docsForItem(td.docs, it.key);
  const hasPass = docs.length > 0 || !!it.bookingRef;
  const off = offlineState(it, docs, td.savedBlobs);
  const addr = addressCard(it, it.type === 'flight' && day.index === 1 ? td.trip.homeTz : day.tz);
  const time = fmtTimeRange(it.start, it.end, it.endDayOffset);
  const target = it.type === 'transit' ? it.toPlace ?? it.place : it.place;
  return (
    <>
      <NextCard
        icon={itemIcon(it)}
        title={it.title}
        time={time ? `原定 ${time}` : it.timeNote ? `原定 ${it.timeNote}` : undefined}
        late={late ? fmtLate(late) : undefined}
        place={target ? [target.name, target.localName].filter(Boolean).join(SEP) : undefined}
        onOpen={() => nav(`/item/${it.id}`)}
      >
        <div className={p.btnRow} style={{ marginTop: 0 }}>
          <Button icon="CheckCircle2" onClick={() => void setItemStatus(td.trip.id, it.key, 'done')}>
            完成
          </Button>
          <Button variant="outline" onClick={() => void setItemStatus(td.trip.id, it.key, 'skipped')}>
            跳过
          </Button>
        </div>
        <ActionGrid>
          {url && <QuickAction icon="Navigation" label="看路线" onClick={() => openExternal(url, placeCopyText(target ?? { name: it.title }))} />}
          {addr && <QuickAction icon="MapPin" label="给司机看" onClick={onAddr} />}
          {hasPass && <QuickAction icon="Ticket" label={off.level === 'ok' ? '出示预订' : `出示（${OFFLINE_LABEL[off.level].label}）`} warn={off.level !== 'ok' && off.level !== 'ref'} onClick={onPass} />}
        </ActionGrid>
      </NextCard>
      {sched && (
        <p className={p.lockNote}>
          按原定时间，现在应在「{sched.title}」。下一项不会自动跳过，按你的实际进度点「完成」或「跳过」。
        </p>
      )}
    </>
  );
}

function HotelBlock({ td, it, onAddr, onPass, url }: { td: TripData; it: Item; onAddr: () => void; onPass: () => void; url?: string }) {
  const docs = docsForItem(td.docs, it.key);
  const off = OFFLINE_LABEL[offlineState(it, docs, td.savedBlobs).level];
  const out = it.lodging?.checkOut;
  const sub = [it.place?.localName, out ? `${fmtMonthDay(out)} 退房` : undefined].filter(Boolean).join(SEP);
  const addr = addressCard(it, td.dayById.get(it.dayId)?.tz ?? 'UTC');
  return (
    <InfoCard icon="Building2" title={bookingTitle(it)} sub={sub || undefined}>
      <div className={p.todayRow}>
        <OfflineChip variant={off.variant} label={off.label} />
      </div>
      <ActionGrid>
        {addr && <QuickAction icon="MapPin" label="给司机看" onClick={onAddr} />}
        {(docs.length > 0 || it.bookingRef) && <QuickAction icon="Ticket" label="出示预订" onClick={onPass} />}
        {url && <QuickAction icon="Navigation" label="看路线" onClick={() => openExternal(url, placeCopyText(it.place ?? { name: it.title }))} />}
      </ActionGrid>
    </InfoCard>
  );
}
