import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import p from './Page.module.css';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader, Menu } from '../components/Layout';
import { Button, Caption, NoteBox, SectionTitle, StatusChip } from '../components/Basics';
import { BookingCard, KeyValueCard, LocationCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { db } from '../db/schema';
import { setItemChecked, setItemStatus } from '../db/repo';
import { statusOf, useSettings, useTripData } from '../hooks/data';
import { navLink } from '../links/maps';
import MustDoList from '../components/MustDoList';
import { fmtMoney, fmtMonthDay, fmtTimeRange, SEP, utcOffsetLabel } from '../domain/format';
import {
  bookingChip,
  bookingIcon,
  bookingStatusOf,
  bookingSubtitle,
  bookingTitle,
  docsForItem,
  itemIcon,
  MEAL_LABEL,
  mustDoTitle,
  placeCopyText,
  statusChip,
  typeInfo,
  TYPE_LABEL,
} from '../domain/rules';
import { copyWithToast, openExternal } from '../links/openLink';
import { isLinkDoc, OFFLINE_LABEL, offlineState } from '../domain/bookings';
import { BookingFooter } from '../components/BookingExtras';
import { PassViewer } from '../components/PassViewer';
import { AddressCardSheet } from '../components/AddressCard';
import { addressCard } from '../domain/address';
import { translateUrl } from '../links/linkLabel';
import { AddDocSheet } from './AddDoc';
import SourceSheet from '../components/SourceSheet';
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
  const info = typeInfo(it);
  for (const [k, v] of info?.rows ?? []) out.push(`${k}: ${v}`);
  if (it.mustDo?.length) out.push(`${mustDoTitle(it)}: ${it.mustDo.join('；')}`);
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
  const settings = useSettings();
  const [menu, setMenu] = useState(false);
  const [add, setAdd] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);

  if (item === null) return <Navigate to="/itinerary" replace />;
  if (!item || !td) return <Screen tab="itinerary" header={<BackHeader title="行程详情" />}>{null}</Screen>;

  const day = td.dayById.get(item.dayId)!;
  const status = statusOf(td, item.key);
  const chip = statusChip(status);
  const docs = docsForItem(td.docs, item.key);
  const fileDocs = docs.filter((d) => !isLinkDoc(d));
  const time = fmtTimeRange(item.start, item.end, item.endDayOffset);
  // 航班起飞时间是出发地当地时间，和当天时区可能不同，所以不标 UTC 偏移
  const dateLine = `${fmtMonthDay(day.date)}${time ? ` ${time}` : ''}${time && item.type !== 'flight' ? `${SEP}${utcOffsetLabel(day.tz)}` : ''}`;
  const copyPlace = (pl: Place) => void copyWithToast(placeCopyText(pl));
  const hasBooking = !!item.bookingRef || docs.length > 0 || item.type === 'flight' || item.type === 'lodging';
  const metaRows = Object.entries(item.meta ?? {});
  const set = (s: 'todo' | 'done' | 'skipped') => void setItemStatus(td.trip.id, item.key, s);
  const openDoc = (id: string) => nav(`/doc/${id}?item=${encodeURIComponent(item.key)}`);
  const navUrl = navLink(item, day.tz, settings);
  // 地址卡的「请带我到这里」按地点所在时区：第一天的航班在出发地
  const addr = addressCard(item, item.type === 'flight' && day.index === 1 ? td.trip.homeTz : day.tz);
  const openRoute = () => navUrl && openExternal(navUrl, placeCopyText(item.toPlace ?? item.place ?? { name: item.title }));
  const info = typeInfo(item);
  const checked = td.checked.get(item.key) ?? [];
  const toggleCheck = (t: string) =>
    void setItemChecked(td.trip.id, item.key, checked.includes(t) ? checked.filter((x) => x !== t) : [...checked, t]);

  return (
    <>
    <TripThemeScope theme={td.trip.theme} />
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
        {item.type === 'meal' && item.meal ? `${TYPE_LABEL.meal}${SEP}${MEAL_LABEL[item.meal]}` : TYPE_LABEL[item.type]}
      </span>
      <h1 className={p.h1}>{item.title}</h1>
      <div className={p.editLink}>
        <Button variant="link" chevron={false} icon="Pencil" onClick={() => nav(`/item/${item.id}/edit`)}>
          编辑这一项
        </Button>
      </div>
      {item.fixed && <span className={p.tag}>固定时间</span>}
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
        {navUrl && (
          <Button icon="Navigation" onClick={openRoute}>
            看路线
          </Button>
        )}
        {addr ? (
          <Button variant="outline" icon="MapPin" onClick={() => setAddrOpen(true)}>
            给司机看
          </Button>
        ) : (
          <Button variant="outline" icon="Languages" onClick={() => openExternal(translateUrl(td.trip.translate.to))}>
            打开翻译
          </Button>
        )}
      </div>
      <div className={p.btnNote}>
        {addr ? (
          <Button variant="link" chevron={false} icon="Languages" onClick={() => openExternal(translateUrl(td.trip.translate.to))}>
            打开翻译
          </Button>
        ) : (
          <Caption align="right">复制文字后，在翻译工具中粘贴</Caption>
        )}
      </div>
      {addr && (
        <AddressCardSheet
          open={addrOpen}
          onClose={() => setAddrOpen(false)}
          card={addr}
          onCopy={(text, what) => void copyWithToast(text, `已复制${what}`)}
          onRoute={navUrl ? openRoute : undefined}
        />
      )}

      {info && (
        <>
          <SectionTitle>{info.title}</SectionTitle>
          <KeyValueCard rows={info.rows} />
        </>
      )}

      {item.budget !== undefined && (
        <>
          <SectionTitle>预算</SectionTitle>
          <KeyValueCard
            rows={[
              ['预算', fmtMoney(item.budget)],
              ['已花', fmtMoney(td.expenses.filter((x) => x.itemKey === item.key).reduce((a, x) => a + x.amount, 0))],
            ]}
          />
        </>
      )}

      {!!item.mustDo?.length && (
        <>
          <SectionTitle>{mustDoTitle(item)}</SectionTitle>
          <MustDoList title={item.type === 'meal' ? '推荐必吃' : '必逛 / 必体验'} items={item.mustDo} checked={checked} onToggle={toggleCheck} />
        </>
      )}

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
            files={fileDocs.map((d) => ({ id: d.id, title: d.title, mime: d.mime, blobKey: d.blobKey, saved: td.savedBlobs.has(d.blobKey), locked: !!d.lock }))}
            onOpenFile={openDoc}
            onUpload={docs.length ? undefined : () => setAdd(true)}
            footer={
              <>
                <BookingFooter
                  offline={OFFLINE_LABEL[offlineState(item, docs, td.savedBlobs).level]}
                  links={docs.filter(isLinkDoc).map((d) => ({ id: d.id, title: d.title, dynamic: d.codeKind === 'dynamic', app: d.app }))}
                  onOpenLink={(id) => {
                    const d = docs.find((x) => x.id === id);
                    if (d?.url) openExternal(d.url);
                  }}
                  onShow={docs.length || item.bookingRef ? () => setShow(true) : undefined}
                />
                {fileDocs.length > 0 && (
                  <Button block variant="outline" icon="FileText" onClick={() => openDoc(fileDocs[0].id)}>
                    查看证明
                  </Button>
                )}
                {docs.length > 0 && (
                  <Button block variant="link" icon="Plus" chevron={false} onClick={() => setAdd(true)}>
                    再添加一份
                  </Button>
                )}
              </>
            }
          />
          <PassViewer
            open={show}
            onClose={() => setShow(false)}
            title={bookingTitle(item)}
            subtitle={bookingSubtitle(item, day)}
            bookingRef={item.bookingRef}
            docs={docs.map((d) => ({
              id: d.id, title: d.title, mime: d.mime, blobKey: d.blobKey, saved: td.savedBlobs.has(d.blobKey), locked: !!d.lock,
              codeKind: d.codeKind, url: d.url, app: d.app, link: isLinkDoc(d),
            }))}
            onCopyRef={() => void copyWithToast(item.bookingRef!)}
            onOpenDoc={openDoc}
            onOpenLink={(url) => openExternal(url)}
          />
        </>
      )}

      {item.alt && (
        <>
          <SectionTitle>备选方案</SectionTitle>
          <NoteBox>{item.alt}</NoteBox>
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
          { label: '编辑这一项', onClick: () => nav(`/item/${item.id}/edit`) },
          { label: '改为待完成', onClick: () => set('todo') },
          { label: '复制全部文字', onClick: () => void copyWithToast(allText(item, dateLine)) },
          { label: '记一笔花费', onClick: () => nav(`/trip/${td.trip.id}/ledger?add=1&item=${encodeURIComponent(item.key)}`) },
          ...(!hasBooking ? [{ label: '添加预订证明', onClick: () => setAdd(true) }] : []),
          ...(item.src ? [{ label: '查看原文', onClick: () => setSrcOpen(true) }] : []),
        ]}
      />
      {item.src && <SourceSheet open={srcOpen} onClose={() => setSrcOpen(false)} md={td.trip.sourceMd} from={item.src.from} to={item.src.to} />}
      <AddDocSheet open={add} onClose={() => setAdd(false)} td={td} presetKeys={[item.key]} presetType={item.type} />
    </Screen>
    </>
  );
}
