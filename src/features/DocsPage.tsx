import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BigHeader } from '../components/Layout';
import { Button, Caption, EmptyState, FilterChips, InfoBanner } from '../components/Basics';
import { BookingCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { useCurrentTripId, useTripData } from '../hooks/data';
import { bookingChip, bookingIcon, bookingStatusOf, bookingSubtitle, bookingTitle, docsForItem, inBookingList } from '../domain/rules';
import { copyWithToast } from '../links/openLink';
import { setDocItemKeys } from '../db/repo';
import { AddDocSheet, ItemPickerSheet } from './AddDoc';
import type { Doc, DocKind, Item, ItemType } from '../domain/types';

type Filter = 'all' | 'flight' | 'lodging' | 'spot';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'flight', label: '机票' },
  { value: 'lodging', label: '酒店' },
  { value: 'spot', label: '景点' },
];
const DOC_KIND_FOR: Record<Exclude<Filter, 'all'>, DocKind> = { flight: 'flight', lodging: 'lodging', spot: 'ticket' };

/** 03 预订资料（资料 Tab） */
export default function DocsPage() {
  const nav = useNavigate();
  const tripId = useCurrentTripId();
  const td = useTripData(tripId);
  const [filter, setFilter] = useState<Filter>('all');
  const [add, setAdd] = useState<{ keys: string[]; type?: ItemType } | null>(null);
  const [linkDoc, setLinkDoc] = useState<Doc | null>(null);

  if (tripId === undefined || td === undefined) return <Screen tab="docs">{null}</Screen>;
  if (!td) {
    return (
      <Screen tab="docs" header={<BigHeader title="预订资料" />}>
        <EmptyState title="还没有预订资料" text="点右上角「添加」，或在行程详情里上传" />
      </Screen>
    );
  }

  const dayDate = (it: Item) => td.dayById.get(it.dayId)?.date ?? '';
  const listed = td.items
    .filter((it) => inBookingList(it, docsForItem(td.docs, it.key).length))
    .filter((it) => filter === 'all' || it.type === filter)
    .sort((a, b) => dayDate(a).localeCompare(dayDate(b)) || (a.start ?? '99').localeCompare(b.start ?? '99') || a.order - b.order);
  const itemKeys = new Set(td.items.map((i) => i.key));
  const unlinked = td.docs
    .filter((d) => !d.itemKeys.some((k) => itemKeys.has(k)))
    .filter((d) => filter === 'all' || d.kind === DOC_KIND_FOR[filter]);
  const allSaved = td.docs.length > 0 && td.docs.every((d) => td.savedBlobs.has(d.blobKey));
  const nothing = listed.length === 0 && unlinked.length === 0 && filter === 'all';
  const openDoc = (id: string, key?: string) => nav(`/doc/${id}${key ? `?item=${encodeURIComponent(key)}` : ''}`);
  const fileOf = (d: Doc) => ({ id: d.id, title: d.title, mime: d.mime, blobKey: d.blobKey, saved: td.savedBlobs.has(d.blobKey), locked: !!d.lock });

  return (
    <Screen
      tab="docs"
      header={<BigHeader title="预订资料" sub={td.trip.title} action={{ label: '添加', onClick: () => setAdd({ keys: [] }) }} />}
    >
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      {nothing ? (
        <EmptyState title="还没有预订资料" text="点右上角「添加」，或在行程详情里上传" compact />
      ) : (
        <div className={`${p.stack} ${p.mt12}`}>
          {allSaved && <InfoBanner variant="success">已保存附件可离线查看</InfoBanner>}

          {unlinked.length > 0 && (
            <div className={p.bookingGrid}>
              <p className={`${p.groupLabel} ${p.gridFull}`}>未关联</p>
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
                files={docs.map(fileOf)}
                withEye
                onOpenFile={(id) => openDoc(id, it.key)}
                onUpload={() => setAdd({ keys: [it.key], type: it.type })}
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
  );
}
