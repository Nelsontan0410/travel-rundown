import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import p from './Page.module.css';
import { Screen, BackHeader, Menu } from '../components/Layout';
import { Button, Caption, NoteBox, SectionTitle, StatusChip } from '../components/Basics';
import { BookingCard, KeyValueCard, LocationCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { db } from '../db/schema';
import { setItemStatus } from '../db/repo';
import { statusOf, useTripData } from '../hooks/data';
import { fmtMonthDay, fmtTimeRange, SEP, utcOffsetLabel } from '../domain/format';
import {
  bookingChip,
  bookingIcon,
  bookingStatusOf,
  bookingSubtitle,
  bookingTitle,
  docsForItem,
  itemIcon,
  placeCopyText,
  statusChip,
  TYPE_LABEL,
} from '../domain/rules';
import { copyWithToast, openExternal } from '../links/openLink';
import { translateUrl } from '../links/linkLabel';
import { AddDocSheet } from './AddDoc';
import type { Item, Place } from '../domain/types';

function placeLines(pl: Place, city?: string): string[] {
  const lines: string[] = [];
  if (pl.localName) lines.push(pl.localName);
  const addr = pl.localAddress || pl.address;
  if (addr) lines.push(addr);
  else if (city) lines.push(city);
  return lines;
}

function allText(it: Item, dateLine: string): string {
  const out = [it.title, dateLine];
  const pl = (label: string, x?: Place) => {
    if (!x) return;
    out.push(`${label}: ${[x.name, x.localName].filter(Boolean).join(' | ')}`);
    if (x.address || x.localAddress) out.push(`地址: ${[x.address, x.localAddress].filter(Boolean).join(' | ')}`);
  };
  pl('地点', it.place);
  pl('终点', it.toPlace);
  if (it.bookingRef) out.push(`订单: ${it.bookingRef}`);
  if (it.note) out.push(`备注: ${it.note}`);
  for (const [k, v] of Object.entries(it.meta ?? {})) out.push(`${k}: ${v}`);
  return out.join('\n');
}

/** 02 行程详情（行程 Tab，从 01 点进） */
export default function ItemPage() {
  const nav = useNavigate();
  const { itemId } = useParams();
  const item = useLiveQuery(async () => (itemId ? (await db.items.get(itemId)) ?? null : null), [itemId]);
  const td = useTripData(item?.tripId);
  const [menu, setMenu] = useState(false);
  const [add, setAdd] = useState(false);

  if (item === null) return <Navigate to="/itinerary" replace />;
  if (!item || !td) return <Screen tab="itinerary" header={<BackHeader title="行程详情" />}>{null}</Screen>;

  const day = td.dayById.get(item.dayId)!;
  const status = statusOf(td, item.key);
  const chip = statusChip(status);
  const docs = docsForItem(td.docs, item.key);
  const time = fmtTimeRange(item.start, item.end, item.endDayOffset);
  const dateLine = `${fmtMonthDay(day.date)}${time ? ` ${time}` : ''}${time ? `${SEP}${utcOffsetLabel(day.tz)}` : ''}`;
  const copyPlace = (pl: Place) => void copyWithToast(placeCopyText(pl));
  const hasBooking = !!item.bookingRef || docs.length > 0;
  const metaRows = Object.entries(item.meta ?? {});
  const set = (s: 'todo' | 'done' | 'skipped') => void setItemStatus(td.trip.id, item.key, s);
  const openDoc = (id: string) => nav(`/doc/${id}?item=${encodeURIComponent(item.key)}`);

  return (
    <Screen
      tab="itinerary"
      header={<BackHeader title="行程详情" right={{ icon: 'MoreHorizontal', label: '更多', onClick: () => setMenu(true) }} />}
      bottom={
        status === 'todo' ? (
          <>
            <Button icon="CheckCircle2" onClick={() => set('done')}>
              标记完成
            </Button>
            <Button variant="outline" style={{ flex: '0 0 var(--w-skip)' }} onClick={() => set('skipped')}>
              跳过
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => set('todo')}>
            改为待完成
          </Button>
        )
      }
    >
      <span className={p.tag}>
        <Icon name={itemIcon(item)} size="sm" />
        {TYPE_LABEL[item.type]}
      </span>
      <h1 className={p.h1}>{item.title}</h1>
      <div className={p.metaRow}>
        <span>{dateLine}</span>
        <StatusChip variant={chip.variant}>{chip.label}</StatusChip>
      </div>

      {item.place && (
        <LocationCard name={item.place.name} lines={placeLines(item.place, [day.city, td.trip.destination].filter(Boolean).join(SEP))} onCopy={() => copyPlace(item.place!)} />
      )}
      {item.toPlace && (item.type === 'flight' || item.type === 'transit') && (
        <div className={p.mt8}>
          <LocationCard name={item.toPlace.name} lines={placeLines(item.toPlace)} onCopy={() => copyPlace(item.toPlace!)} />
        </div>
      )}

      <div className={p.btnRow}>
        {item.navUrl && (
          <Button icon="Navigation" onClick={() => openExternal(item.navUrl!, placeCopyText(item.place ?? { name: item.title }))}>
            打开导航
          </Button>
        )}
        <Button variant="outline" icon="Languages" onClick={() => openExternal(translateUrl(td.trip.translate.to))}>
          打开翻译
        </Button>
      </div>
      <div className={p.btnNote}>
        <Caption align="right">复制文字后，在翻译工具中粘贴</Caption>
      </div>

      {hasBooking && (
        <>
          <SectionTitle>关联预订</SectionTitle>
          <BookingCard
            icon={bookingIcon(item)}
            warnIcon={bookingIcon(item) === 'Ticket'}
            title={bookingTitle(item)}
            subtitle={bookingSubtitle(item, day)}
            chip={bookingChip(bookingStatusOf(item, docs.length))}
            bookingRef={item.bookingRef}
            onCopyRef={() => void copyWithToast(item.bookingRef!)}
            files={docs.map((d) => ({ id: d.id, title: d.title, mime: d.mime, blobKey: d.blobKey, saved: td.savedBlobs.has(d.blobKey) }))}
            onOpenFile={openDoc}
            onUpload={() => setAdd(true)}
            footer={
              docs.length > 0 && (
                <Button block variant="outline" icon="FileText" onClick={() => openDoc(docs[0].id)}>
                  查看证明
                </Button>
              )
            }
          />
        </>
      )}

      {item.note && (
        <>
          <SectionTitle>行程备注</SectionTitle>
          <NoteBox>{item.note}</NoteBox>
        </>
      )}

      {metaRows.length > 0 && (
        <>
          <SectionTitle>详细信息</SectionTitle>
          <KeyValueCard rows={metaRows} />
        </>
      )}

      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: '改为待完成', onClick: () => set('todo') },
          { label: '复制全部文字', onClick: () => void copyWithToast(allText(item, dateLine)) },
        ]}
      />
      <AddDocSheet open={add} onClose={() => setAdd(false)} td={td} presetKeys={[item.key]} presetType={item.type} />
    </Screen>
  );
}
