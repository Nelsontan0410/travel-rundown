import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BigHeader } from '../components/Layout';
import { Button, Caption, EmptyState, FilterChips, InfoBanner } from '../components/Basics';
import { BookingCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { useCurrentTripId, useTripData } from '../hooks/data';
import { bookingChip, bookingIcon, bookingStatusOf, bookingSubtitle, bookingTitle, docsForItem, inBookingList } from '../domain/rules';
import { bookingGroup, GROUP_LABEL, isLinkDoc, OFFLINE_LABEL, offlineReport, offlineState, type BookingGroup } from '../domain/bookings';
import { BookingFooter } from '../components/BookingExtras';
import { PassViewer, type PassDoc } from '../components/PassViewer';
import { copyWithToast, openExternal } from '../links/openLink';
import { setDocItemKeys } from '../db/repo';
import { AddDocSheet, ItemPickerSheet } from './AddDoc';
import type { Doc, DocKind, Item, ItemType } from '../domain/types';

// 2026-10：按「酒店 / 交通 / 门票」集中（交通 = 机票 + 交通）
type Filter = 'all' | BookingGroup;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'lodging', label: GROUP_LABEL.lodging },
  { value: 'transport', label: GROUP_LABEL.transport },
  { value: 'ticket', label: GROUP_LABEL.ticket },
];
const DOC_KINDS_FOR: Record<BookingGroup, DocKind[]> = { lodging: ['lodging'], transport: ['flight'], ticket: ['ticket'] };

/** 03 预订资料（资料 Tab） */
export default function DocsPage() {
  const nav = useNavigate();
  const tripId = useCurrentTripId();
  const td = useTripData(tripId);
  const [filter, setFilter] = useState<Filter>('all');
  const [add, setAdd] = useState<{ keys: string[]; type?: ItemType } | null>(null);
  const [linkDoc, setLinkDoc] = useState<Doc | null>(null);
  const [show, setShow] = useState<Item | null>(null);

  if (tripId === undefined || td === undefined) return <Screen tab="docs">{null}</Screen>;
  if (!td) {
    return (
      <Screen tab="docs" header={<BigHeader title="预订资料" />}>
        <EmptyState title="还没有预订资料" text="点右上角「添加」，或在行程详情里上传" />
      </Screen>
    );
  }

  const dayDate = (it: Item) => td.dayById.get(it.dayId)?.date ?? '';
  const booked = td.items
    .filter((it) => inBookingList(it, docsForItem(td.docs, it.key).length))
    .sort((a, b) => dayDate(a).localeCompare(dayDate(b)) || (a.start ?? '99').localeCompare(b.start ?? '99') || a.order - b.order);
  const listed = booked.filter((it) => filter === 'all' || bookingGroup(it) === filter);
  const report = offlineReport(booked, (k) => docsForItem(td.docs, k), td.savedBlobs);
  const itemKeys = new Set(td.items.map((i) => i.key));
  const unlinked = td.docs
    .filter((d) => !d.itemKeys.some((k) => itemKeys.has(k)))
    .filter((d) => filter === 'all' || DOC_KINDS_FOR[filter].includes(d.kind));
  const fileDocs = td.docs.filter((d) => !isLinkDoc(d));
  const allSaved = fileDocs.length > 0 && fileDocs.every((d) => td.savedBlobs.has(d.blobKey));
  const nothing = listed.length === 0 && unlinked.length === 0 && filter === 'all';
  const openDoc = (id: string, key?: string) => nav(`/doc/${id}${key ? `?item=${encodeURIComponent(key)}` : ''}`);
  const fileOf = (d: Doc) => ({ id: d.id, title: d.title, mime: d.mime, blobKey: d.blobKey, saved: td.savedBlobs.has(d.blobKey), locked: !!d.lock });
  const passOf = (d: Doc): PassDoc => ({ ...fileOf(d), codeKind: d.codeKind, url: d.url, app: d.app, link: isLinkDoc(d) });
  const openLink = (id: string) => {
    const d = td.docs.find((x) => x.id === id);
    if (d?.url) openExternal(d.url);
  };
  const showDocs = show ? docsForItem(td.docs, show.key) : [];
  const showDay = show ? td.dayById.get(show.dayId) : undefined;

  return (
    <>
    <TripThemeScope theme={td.trip.theme} />
    <Screen
      tab="docs"
      header={<BigHeader title="预订资料" sub={td.trip.title} action={{ label: '添加', onClick: () => setAdd({ keys: [] }) }} />}
    >
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      {nothing ? (
        <EmptyState title="还没有预订资料" text="点右上角「添加」，或在行程详情里上传" compact />
      ) : (
        <div className={`${p.stack} ${p.mt12}`}>
          {allSaved && report.todo === 0 && <InfoBanner variant="success">已保存附件可离线查看</InfoBanner>}

          {unlinked.length > 0 && (
            <>
            <p className={p.groupLabel}>未关联</p>
            <div className={p.bookingGrid}>
              {unlinked.map((d) => (
                <BookingCard
                  key={d.id}
                  icon="FileText"
                  title={d.title}
                  files={[]}
                  onOpenFile={() => openDoc(d.id)}
                  footer={
                    <div className={p.unlinkedRow}>
                      <Button variant="outline" size="sm" onClick={() => setLinkDoc(d)}>
                        关联到行程项
                      </Button>
                    </div>
                  }
                />
              ))}
            </div>
            </>
          )}

          <div className={p.bookingGrid}>
          {listed.map((it) => {
            const day = td.dayById.get(it.dayId)!;
            const docs = docsForItem(td.docs, it.key);
            const icon = bookingIcon(it);
            return (
              <BookingCard
                key={it.id}
                icon={icon}
                warnIcon={icon === 'Ticket'}
                title={bookingTitle(it)}
                subtitle={bookingSubtitle(it, day)}
                chip={bookingChip(bookingStatusOf(it, docs.length))}
                bookingRef={it.bookingRef}
                onCopyRef={() => void copyWithToast(it.bookingRef!)}
                files={docs.filter((d) => !isLinkDoc(d)).map(fileOf)}
                withEye
                onOpenFile={(id) => openDoc(id, it.key)}
                onUpload={docs.length ? undefined : () => setAdd({ keys: [it.key], type: it.type })}
                footer={
                  <BookingFooter
                    offline={OFFLINE_LABEL[offlineState(it, docs, td.savedBlobs).level]}
                    links={docs.filter(isLinkDoc).map((d) => ({ id: d.id, title: d.title, dynamic: d.codeKind === 'dynamic', app: d.app }))}
                    onOpenLink={openLink}
                    onShow={docs.length || it.bookingRef ? () => setShow(it) : undefined}
                  />
                }
              />
            );
          })}
          </div>
        </div>
      )}
      <div className={p.listFoot}>
        <Icon name="Info" size="xs" color="var(--color-icon)" />
        <Caption>PDF / JPG / PNG · 单份不超过 20 MiB</Caption>
      </div>

      {show && (
        <PassViewer
          open
          onClose={() => setShow(null)}
          title={bookingTitle(show)}
          subtitle={showDay ? bookingSubtitle(show, showDay) : undefined}
          bookingRef={show.bookingRef}
          docs={showDocs.map(passOf)}
          onCopyRef={() => void copyWithToast(show.bookingRef!)}
          onOpenDoc={(id) => openDoc(id, show.key)}
          onOpenLink={(url) => openExternal(url)}
        />
      )}
      <AddDocSheet open={!!add} onClose={() => setAdd(null)} td={td} presetKeys={add?.keys} presetType={add?.type} />
      {linkDoc && (
        <ItemPickerSheet
          open
          td={td}
          value={linkDoc.itemKeys}
          onDone={(keys) => void setDocItemKeys(linkDoc.id, keys)}
          onClose={() => setLinkDoc(null)}
        />
      )}
    </Screen>
    </>
  );
}
