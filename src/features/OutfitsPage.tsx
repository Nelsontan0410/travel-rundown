// 2026-10 第一批 ④：穿搭与打包。三个分页：每日穿搭（Day 1–N）、衣橱（所有旅程共用）、打包清单（衣物自动汇总 + 其他物品）。
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import p from './Page.module.css';
import TripUnavailable from './TripUnavailable';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader, Dialog, Sheet } from '../components/Layout';
import { Button, EmptyState, FilterChips, InfoBanner, SectionTitle } from '../components/Basics';
import { Field, TextInput } from '../components/Form';
import { GarmentPick, GarmentTile, OutfitDayCard, PackProgress, PackRow, type GarmentView } from '../components/Wardrobe';
import { useBlobUrl, useTripData, useTripPacking, useWardrobe, type TripData, type TripPacking } from '../hooks/data';
import { addGarment, addPackItems, deleteGarment, deletePackItem, setOutfit, setPacked, updateGarment } from '../db/repo';
import { fmtMonthDay, SEP } from '../domain/format';
import { dayList, GARMENT_LABEL, GARMENT_ORDER, outfitGarments, PACK_GROUP_LABEL, PACK_GROUP_ORDER, PACK_PRESETS, packingList } from '../domain/packing';
import { pickFile, prepareFile } from '../lib/files';
import { toast } from '../store/ui';
import type { Garment, GarmentCategory, PackGroup } from '../domain/types';

type Tab = 'days' | 'wardrobe' | 'pack';
const TABS: { value: Tab; label: string }[] = [
  { value: 'days', label: '每日穿搭' },
  { value: 'pack', label: '打包清单' },
  { value: 'wardrobe', label: '衣橱' },
];
const CAT_OPTIONS = GARMENT_ORDER.map((value) => ({ value, label: GARMENT_LABEL[value] }));
const GROUP_OPTIONS = PACK_GROUP_ORDER.map((value) => ({ value, label: PACK_GROUP_LABEL[value] }));

export const viewOf = (g: Garment): GarmentView => ({ id: g.id, name: g.name, categoryLabel: GARMENT_LABEL[g.category], photoBlobKey: g.photoBlobKey });

/** 新增 / 编辑一件衣橱单品 */
function GarmentSheet({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing?: Garment; onSaved?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState<GarmentCategory>('top');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const stored = useBlobUrl(editing?.photoBlobKey);
  const fresh = useMemo(() => (photo ? URL.createObjectURL(photo) : undefined), [photo]);
  useEffect(() => () => {
    if (fresh) URL.revokeObjectURL(fresh);
  }, [fresh]);
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setCat(editing?.category ?? 'top');
    setNote(editing?.note ?? '');
    setPhoto(undefined);
    setErr('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = photo === null ? undefined : fresh ?? stored;

  const choose = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      setPhoto(await prepareFile(f));
    } catch {
      toast('照片太大，请换一张');
    }
  };
  const save = async () => {
    if (!name.trim()) return setErr('请填名称，例如「黑色羽绒外套」');
    if (editing) {
      await updateGarment(editing.id, { name, category: cat, note }, photo);
      onSaved?.(editing.id);
    } else {
      const id = await addGarment({ name, category: cat, note, photo: photo ?? undefined });
      onSaved?.(id);
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? '编辑单品' : '新增单品'}>
      <div className={p.garmentPhotoRow}>
        <button type="button" className={p.garmentPhoto} onClick={() => void choose()} aria-label={shown ? '更换照片' : '添加照片'}>
          {shown ? <img src={shown} alt="" /> : <span>＋ 照片</span>}
        </button>
        {shown && (
          <Button variant="link" chevron={false} icon="Trash2" onClick={() => setPhoto(null)}>
            移除照片
          </Button>
        )}
      </div>
      <Field label="名称" error={err || undefined}>
        <TextInput value={name} maxLength={30} placeholder="例如：黑色羽绒外套" onChange={(e) => { setName(e.target.value); setErr(''); }} />
      </Field>
      <div className={p.mt8}>
        <FilterChips options={CAT_OPTIONS} value={cat} onChange={setCat} />
      </div>
      <div className={p.mt12}>
        <Field label="备注（可选）">
          <TextInput value={note} maxLength={60} placeholder="例如：防水、要熨" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className={p.sheetActions}>
        <Button block onClick={() => void save()}>
          保存
        </Button>
        {editing && (
          <Button block variant="link" chevron={false} icon="Trash2" onClick={() => setConfirmDel(true)}>
            从衣橱删除
          </Button>
        )}
      </div>
      <Dialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="从衣橱删除？"
        text="所有旅程的穿搭里都会拿掉这件，打包勾选也会清除。"
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmDel(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDel(false);
                void deleteGarment(editing!.id).then(() => {
                  toast('已删除');
                  onClose();
                });
              }}
            >
              删除
            </Button>
          </>
        }
      />
    </Sheet>
  );
}

/** 安排某一天的穿搭：从衣橱里勾选，也可以当场新增 */
function OutfitSheet({
  open,
  onClose,
  td,
  pk,
  wardrobe,
  dayIndex,
}: {
  open: boolean;
  onClose: () => void;
  td: TripData;
  pk: TripPacking;
  wardrobe: Garment[];
  dayIndex: number;
}) {
  const cur = pk.outfits.find((o) => o.dayIndex === dayIndex);
  const prev = pk.outfits.find((o) => o.dayIndex === dayIndex - 1);
  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSel(cur?.garmentIds ?? []);
    setNote(cur?.note ?? '');
  }, [open, dayIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = td.days.find((d) => d.index === dayIndex);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = async () => {
    await setOutfit(td.trip.id, dayIndex, sel, note);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Day ${dayIndex} 穿搭${day ? `${SEP}${fmtMonthDay(day.date)}` : ''}`}>
      {prev && prev.garmentIds.length > 0 && (
        <Button variant="link" chevron={false} icon="Copy" onClick={() => setSel([...new Set([...sel, ...prev.garmentIds])])}>
          沿用 Day {dayIndex - 1} 的单品
        </Button>
      )}
      {wardrobe.length === 0 ? (
        <p className={p.lockNote}>衣橱还是空的，先新增几件。</p>
      ) : (
        GARMENT_ORDER.filter((c) => wardrobe.some((g) => g.category === c)).map((c) => (
          <div key={c} className={p.pickGroup}>
            <p className={p.groupLabel}>{GARMENT_LABEL[c]}</p>
            <div className={p.pickGrid}>
              {wardrobe
                .filter((g) => g.category === c)
                .map((g) => (
                  <GarmentPick key={g.id} g={viewOf(g)} on={sel.includes(g.id)} onToggle={() => toggle(g.id)} />
                ))}
            </div>
          </div>
        ))
      )}
      <Button variant="outline" icon="Plus" onClick={() => setAdding(true)}>
        新增单品
      </Button>
      <div className={p.mt12}>
        <Field label="备注（可选）">
          <TextInput value={note} maxLength={60} placeholder="例如：去雪地，穿防滑鞋" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className={p.sheetActions}>
        <Button block onClick={() => void save()}>
          保存（{sel.length} 件）
        </Button>
      </div>
      <GarmentSheet open={adding} onClose={() => setAdding(false)} onSaved={(id) => setSel((s) => (s.includes(id) ? s : [...s, id]))} />
    </Sheet>
  );
}

function AddPackSheet({ open, onClose, tripId }: { open: boolean; onClose: () => void; tripId: string }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<PackGroup>('other');
  const [qty, setQty] = useState('');
  useEffect(() => {
    if (open) {
      setName('');
      setQty('');
    }
  }, [open]);
  const save = async () => {
    if (!name.trim()) return;
    const n = await addPackItems(tripId, [{ name, group, qty: Number(qty) || undefined }]);
    toast(n ? '已加入' : '清单里已经有了');
    setName('');
    setQty('');
  };
  return (
    <Sheet open={open} onClose={onClose} title="加入打包清单">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="物品">
          <TextInput value={name} maxLength={30} placeholder="例如：自拍杆" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className={p.mt8}>
          <FilterChips options={GROUP_OPTIONS} value={group} onChange={setGroup} />
        </div>
        <div className={p.mt12}>
          <Field label="数量（可选）">
            <TextInput type="number" inputMode="numeric" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
        <div className={p.sheetActions}>
          <Button block type="submit">
            加入
          </Button>
          <Button block variant="outline" type="button" onClick={onClose}>
            完成
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export default function OutfitsPage() {
  const { tripId } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (['days', 'wardrobe', 'pack'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'days') as Tab;
  const td = useTripData(tripId);
  const pk = useTripPacking(tripId);
  const wardrobe = useWardrobe();
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editG, setEditG] = useState<Garment | 'new' | null>(null);
  const [addPack, setAddPack] = useState(false);

  if (td === null) return <TripUnavailable tripId={tripId ?? ''} title="穿搭与打包" />;
  if (!td || !pk || !wardrobe) return <Screen tab="itinerary" header={<BackHeader title="穿搭与打包" />}>{null}</Screen>;

  const byId = new Map(wardrobe.map((g) => [g.id, g]));
  const list = packingList(td.days, pk.outfits, byId, pk.items, pk.packed);
  const wornDays = (id: string) => pk.outfits.filter((o) => o.garmentIds.includes(id)).length;
  const setTab = (t: Tab) => setSp(t === 'days' ? {} : { tab: t }, { replace: true });
  const addPreset = async (k: keyof typeof PACK_PRESETS) => {
    const n = await addPackItems(td.trip.id, PACK_PRESETS[k].rows);
    toast(n ? `已加入 ${n} 项` : '这些都已经在清单里了');
  };

  return (
    <>
      <TripThemeScope theme={td.trip.theme} />
      <Screen tab="itinerary" header={<BackHeader title="穿搭与打包" />}>
        <FilterChips options={TABS} value={tab} onChange={setTab} />

        {tab === 'days' && (
          <div className={`${p.stack} ${p.mt12}`}>
            {list.unplanned.length > 0 && wardrobe.length > 0 && (
              <InfoBanner variant="info">还有 {list.unplanned.length} 天没安排：{dayList(list.unplanned)}</InfoBanner>
            )}
            {wardrobe.length === 0 && (
              <InfoBanner
                variant="info"
                action={
                  <Button size="sm" variant="outline" onClick={() => setEditG('new')}>
                    新增单品
                  </Button>
                }
              >
                先把要带的衣服加进衣橱，再给每天搭配。
              </InfoBanner>
            )}
            <div className={p.outfitGrid}>
              {td.days.map((d) => {
                const o = pk.outfits.find((x) => x.dayIndex === d.index);
                return (
                  <OutfitDayCard
                    key={d.id}
                    label={`Day ${d.index}`}
                    sub={[fmtMonthDay(d.date), d.title ?? d.city].filter(Boolean).join(SEP)}
                    garments={outfitGarments(o, byId).map(viewOf)}
                    note={o?.note}
                    onEdit={() => setEditDay(d.index)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {tab === 'wardrobe' && (
          <div className={`${p.stack} ${p.mt12}`}>
            <p className={p.lockNote}>衣橱是所有旅程共用的；在这里改名或换照片，每一天的穿搭都会跟着更新。</p>
            {wardrobe.length === 0 ? (
              <EmptyState title="衣橱还是空的" text="拍一张或从相册选，也可以只写名称" compact />
            ) : (
              GARMENT_ORDER.filter((c) => wardrobe.some((g) => g.category === c)).map((c) => (
                <div key={c}>
                  <SectionTitle>{GARMENT_LABEL[c]}</SectionTitle>
                  <div className={p.wardrobeGrid}>
                    {wardrobe
                      .filter((g) => g.category === c)
                      .map((g) => {
                        const n = wornDays(g.id);
                        return <GarmentTile key={g.id} g={viewOf(g)} meta={n ? `这次穿 ${n} 天` : undefined} onClick={() => setEditG(g)} />;
                      })}
                  </div>
                </div>
              ))
            )}
            <Button icon="Plus" onClick={() => setEditG('new')}>
              新增单品
            </Button>
          </div>
        )}

        {tab === 'pack' && (
          <div className={`${p.stack} ${p.mt12}`}>
            <PackProgress packed={list.packed} total={list.total} />
            {list.unplanned.length > 0 && (
              <InfoBanner variant="warning">
                {dayList(list.unplanned)} 还没安排穿搭，衣物清单可能不完整。
              </InfoBanner>
            )}
            <div>
              <SectionTitle>衣物（来自每日穿搭）</SectionTitle>
              {list.clothes.length === 0 ? (
                <p className={p.lockNote}>安排好每日穿搭后，用到的衣物会自动出现在这里，同一件只出现一次。</p>
              ) : (
                <ul className={p.packList}>
                  {list.clothes.map((c) => (
                    <PackRow
                      key={c.garment.id}
                      label={c.garment.name}
                      sub={`${GARMENT_LABEL[c.garment.category]}${SEP}${dayList(c.days)}`}
                      thumb={viewOf(c.garment)}
                      packed={c.packed}
                      onToggle={() => void setPacked(td.trip.id, `garment:${c.garment.id}`, !c.packed)}
                    />
                  ))}
                </ul>
              )}
            </div>
            {list.groups.map((g) => (
              <div key={g.group}>
                <SectionTitle>{PACK_GROUP_LABEL[g.group]}</SectionTitle>
                <ul className={p.packList}>
                  {g.rows.map((r) => (
                    <PackRow
                      key={r.item.id}
                      label={r.item.qty ? `${r.item.name} × ${r.item.qty}` : r.item.name}
                      packed={r.packed}
                      onToggle={() => void setPacked(td.trip.id, `item:${r.item.id}`, !r.packed)}
                      onDelete={() => void deletePackItem(r.item.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
            <div className={p.btnRow}>
              <Button icon="Plus" onClick={() => setAddPack(true)}>
                加物品
              </Button>
              <Button variant="outline" onClick={() => void addPreset('basic')}>
                + {PACK_PRESETS.basic.label}
              </Button>
            </div>
            <Button variant="link" chevron={false} onClick={() => void addPreset('cold')}>
              + {PACK_PRESETS.cold.label}（暖宝宝、防滑鞋套…）
            </Button>
          </div>
        )}

        {editDay !== null && (
          <OutfitSheet open onClose={() => setEditDay(null)} td={td} pk={pk} wardrobe={wardrobe} dayIndex={editDay} />
        )}
        <GarmentSheet open={editG !== null} onClose={() => setEditG(null)} editing={editG && editG !== 'new' ? editG : undefined} />
        <AddPackSheet open={addPack} onClose={() => setAddPack(false)} tripId={td.trip.id} />
      </Screen>
    </>
  );
}
