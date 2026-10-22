import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import ImportSteps from '../components/ImportSteps';
import { Screen, BackHeader } from '../components/Layout';
import { Button, InfoBanner } from '../components/Basics';
import { KeyValueCard } from '../components/Cards';
import { toast, useUI } from '../store/ui';
import { saveImport, loadDiffOld } from '../db/repo';
import SourceSheet from '../components/SourceSheet';
import CheckList from '../components/CheckList';
import { checkTrip } from '../domain/check';
import DiffSection from '../components/DiffSection';
import { diffImport, flattenParsed, type ImportDiff } from '../importer/diff';
import { fmtDate, fmtDateRange, fmtMoney, SEP, tripDays } from '../domain/format';
import { shiftDraft } from '../importer/shift';
import { buildPrompt } from '../importer/promptTemplate';
import { copyWithToast } from '../links/openLink';
import { Field, TextInput } from '../components/Form';
import { DraftDay, TypeCounts } from '../components/DraftReview';
import { itemIcon, itemSubtitle, plannedTotal, TYPE_LABEL } from '../domain/rules';
import type { Item, ItemType } from '../domain/types';
import { useTrips } from '../hooks/data';
import { DroppedList, FixList, MappingSummaryCard, UnmappedList, type FixRow, type UnmappedRow } from '../components/MappingReview';
import { confirmFlag, mapUnmapped, setDayDate, setItemType, setTripTitle, type UnmappedTarget } from '../importer/corrections';
import type { ParseResult } from '../importer/parseMd';

const FORMAT_LABEL = { md: 'Markdown', text: '文字', json: 'JSON', csv: 'CSV' } as const;
const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as ItemType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }));
const MAP_TARGETS: { value: UnmappedTarget; label: string }[] = [
  { value: 'note', label: '备注' },
  { value: 'timeNote', label: '时间说明' },
  { value: 'place', label: '地点' },
  { value: 'address', label: '地址' },
];

const TYPE_ORDER: ItemType[] = ['flight', 'lodging', 'spot', 'meal', 'transit', 'note'];
const TYPE_ICON = { flight: 'Plane', lodging: 'Building2', spot: 'MapPin', meal: 'Utensils', transit: 'TrainFront', note: 'StickyNote' } as const;

/** 导入预览页 */
export default function PreviewPage() {
  const nav = useNavigate();
  const draft = useUI((s) => s.draft);
  const setDraft = useUI((s) => s.setDraft);
  const setPaste = useUI((s) => s.setPasteText);
  const [open, setOpen] = useState(true); // 2026-10-19：提示默认展开，不要让用户以为都识别成功了
  const [srcLine, setSrcLine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const trips = useTrips();
  const target = draft?.targetTripId;
  // 进入预览时是不是「重新导入到指定旅程」（从旅程设置进来）；同名旅程的「更新」选择不算
  const [fixedTarget] = useState(() => draft?.targetTripId);
  const parsed = draft?.result;
  const newFlat = useMemo(() => (parsed ? flattenParsed(parsed.days) : []), [parsed]);
  useEffect(() => {
    if (!target) return;
    let live = true;
    void loadDiffOld(target).then((old) => {
      if (!live) return;
      const d = diffImport(old, newFlat);
      setDiff(d);
      setAccepted(new Set(d.renamed.map((r) => r.oldKey)));
    });
    return () => {
      live = false;
    };
  }, [target, newFlat]);
  const issues = useMemo(
    () =>
      parsed
        ? checkTrip(
            parsed.days.flatMap((d) =>
              d.items.map((i) => ({ key: i.key, type: i.type, title: i.title, date: d.date, dayIndex: d.index, start: i.start, fixed: i.fixed, place: i.place, navUrl: i.navUrl, bookingStatus: i.bookingStatus })),
            ),
          )
        : [],
    [parsed],
  );
  // 2026-10-19：刷新后预览没了，就回到第 1 步（草稿还在）
  if (!draft) return <Navigate to="/import/paste" replace />;
  const { result } = draft;
  const empty = result.itemCount === 0;
  const blocked = empty || result.errors.length > 0;
  const repairPrompt = buildPrompt().replace('（把你的行程粘贴在这里）', draft.md);

  const all = result.days.flatMap((d) => d.items);
  const itemSum = plannedTotal(all);
  const counts = TYPE_ORDER.map((t) => ({ icon: TYPE_ICON[t], label: TYPE_LABEL[t], n: all.filter((i) => i.type === t).length })).filter((c) => c.n > 0);
  const changeStart = (v: string) => {
    if (!v || v === result.trip.startDate) return;
    setDraft({ ...draft, result: shiftDraft(result, v) });
  };

  // —— 映射检查与就地修正（只改草稿）
  const fix = (fn: (r: ParseResult) => ParseResult) => setDraft({ ...draft, result: fn(result) });
  const rep = result.mapping;
  const dayLabel = (i: number) => {
    const d = result.days[i];
    return d ? `Day ${d.index}${d.title || d.city ? `${SEP}${d.title || d.city}` : ''}` : '旅程';
  };
  const KIND_ORDER = { title: 0, date: 1, 'ambiguous-date': 2, type: 3 } as const;
  const fixRows: FixRow[] = [...(rep?.flags ?? [])].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).map((f) => {
    if (f.kind === 'title') return { id: f.id, kind: 'title', where: '旅程标题', value: '', onChange: (v: string) => v.trim() && fix((r) => setTripTitle(r, v)) };
    if (f.kind === 'date')
      return { id: f.id, kind: 'date', where: dayLabel(f.dayIdx), raw: f.raw, value: result.days[f.dayIdx]?.date ?? '', onChange: (v: string) => fix((r) => setDayDate(r, f.dayIdx, v, f.id)) };
    if (f.kind === 'ambiguous-date')
      return {
        id: f.id,
        kind: 'ambiguous',
        where: dayLabel(f.dayIdx),
        raw: f.raw,
        options: [
          { value: f.iso, label: `${fmtDate(f.iso)}（日-月-年，当前）` },
          { value: f.alt, label: `${fmtDate(f.alt)}（月-日-年）` },
        ],
        onChange: (v: string) => fix((r) => (v === f.iso ? confirmFlag(r, f.id) : setDayDate(r, f.dayIdx, v, f.id))),
      };
    const it = result.days[f.dayIdx]?.items[f.itemIdx];
    return {
      id: f.id,
      kind: 'type',
      where: `${dayLabel(f.dayIdx)}${SEP}${it?.title ?? ''}`,
      raw: f.raw,
      options: TYPE_OPTIONS,
      onChange: (v: string) => fix((r) => setItemType(r, f.dayIdx, f.itemIdx, v as ItemType, f.id)),
    };
  });
  const unmappedRows: UnmappedRow[] = (rep?.unmapped ?? []).map((u) => {
    const it = u.level === 'item' && u.dayIdx != null && u.itemIdx != null ? result.days[u.dayIdx]?.items[u.itemIdx] : undefined;
    const where = u.level === 'trip' ? '旅程信息' : u.level === 'day' ? dayLabel(u.dayIdx ?? 0) : `${dayLabel(u.dayIdx ?? 0)}${SEP}${it?.title ?? ''}`;
    return {
      id: u.id,
      where,
      field: u.field,
      value: u.value,
      keptAs: u.level === 'item' ? '保留在「其他信息」' : u.level === 'day' ? '保留在当天备注' : '只保存在原始文本里',
      targets: u.level === 'item' ? MAP_TARGETS : u.level === 'day' ? [MAP_TARGETS[0]] : [],
      onMap: (t: string) => fix((r) => mapUnmapped(r, u.id, t as UnmappedTarget)),
    };
  });
  const summary = {
    format: FORMAT_LABEL[draft.format ?? rep?.format ?? 'md'],
    days: result.days.length,
    items: result.itemCount,
    errors: result.errors.length,
    toConfirm: fixRows.length,
    unmapped: unmappedRows.length,
    dropped: rep?.dropped.length ?? 0,
  };
  // 同名旅程：不能未经确认就覆盖，让用户选新建还是更新
  const dupes = !fixedTarget ? (trips ?? []).filter((t) => t.title === result.trip.title) : [];
  const chooseTarget = (id: string | undefined) => {
    setDiff(null);
    setDraft({ ...draft, targetTripId: id });
  };

  const back = () => {
    // 回到粘贴页修改：文件导入的内容也带过去
    setPaste(draft.md);
    nav(`/import/paste${draft.targetTripId ? `?trip=${draft.targetTripId}` : ''}`, { replace: true });
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const renames: Record<string, string> = {};
      for (const r of diff?.renamed ?? []) if (accepted.has(r.oldKey)) renames[r.oldKey] = r.newKey;
      const id = await saveImport(result, draft.md, draft.targetTripId, renames);
      setPaste('');
      nav(`/itinerary/${id}`, { replace: true });
      setTimeout(() => {
        setDraft(null);
        setPaste('');
      }, 0);
    } catch {
      toast('保存失败：本机存储不可用或空间不足');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<BackHeader title="导入行程" onBack={back} />}
      bottom={
        <>
          <Button disabled={blocked || busy} onClick={() => void confirm()}>
            确认导入
          </Button>
          <Button variant="outline" onClick={back}>
            返回修改
          </Button>
        </>
      }
    >
      <ImportSteps step={2} />
      <div className={p.mt8}>
        <MappingSummaryCard sum={summary} />
      </div>
      {fixRows.length > 0 && (
        <div className={p.mt12}>
          <FixList rows={fixRows} />
        </div>
      )}
      {unmappedRows.length > 0 && (
        <div className={p.mt12}>
          <UnmappedList rows={unmappedRows} />
        </div>
      )}
      {(rep?.dropped.length ?? 0) > 0 && (
        <div className={p.mt12}>
          <DroppedList rows={rep!.dropped} />
        </div>
      )}
      {blocked ? (
        <div className={p.mt8}>
          <InfoBanner variant="warning">{empty ? '没有识别到任何行程项' : fixRows.length ? '还缺必要信息，暂时不能导入' : '这份内容不是 App 能用的格式，不能导入'}</InfoBanner>
          {result.errors.length > 0 && (
            <ul className={p.warnList}>
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {fixRows.length > 0 && <p className={p.lead}>先试试在上面「需要你确认」里补上缺的信息；补全后就能导入。</p>}
          <p className={p.lead}>也可以把下面的「修复提示词」复制给 ChatGPT 或 Claude（已经附上你的原文），把它回复的内容重新粘贴进来。</p>
          <div className={p.mt12}>
            <Button block icon="Copy" onClick={() => void copyWithToast(repairPrompt)}>
              复制修复提示词
            </Button>
          </div>
        </div>
      ) : (
        <>
          {dupes.length > 0 && (
            <div className={p.mt12}>
              <InfoBanner variant="warning">已经有同名旅程「{result.trip.title}」，请选择怎么处理</InfoBanner>
              <div className={p.mt8} role="radiogroup" aria-label="同名旅程处理方式">
                <button type="button" role="radio" aria-checked={!target} className={`${p.option} ${!target ? p.optionOn : ''}`} onClick={() => chooseTarget(undefined)}>
                  另存为新旅程（原旅程不变）
                </button>
                {dupes.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={target === t.id} className={`${p.option} ${target === t.id ? p.optionOn : ''}`} onClick={() => chooseTarget(t.id)}>
                    更新「{t.title}」{t.startDate ? `（${fmtDateRange(t.startDate, t.endDate)}）` : ''}，保留完成状态、证明和账本
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={p.mt8}>
            <KeyValueCard
              rows={[
                ['目的地', result.trip.title],
                ['人数', result.trip.participants ? `${result.trip.participants} 人` : '未设置'],
                ['日期范围', result.trip.startDate ? fmtDateRange(result.trip.startDate, result.trip.endDate) : '—'],
                ['天数', result.trip.startDate ? `${tripDays(result.trip.startDate, result.trip.endDate)}天` : `${result.days.length}天`],
                ['行程项数', String(result.itemCount)],
                ['总预算', result.trip.budget !== undefined ? fmtMoney(result.trip.budget) : itemSum !== undefined ? `${fmtMoney(itemSum)}（按各项预算合计）` : '未写（可以之后在账本里设置）'],
                ...(itemSum !== undefined && result.trip.budget !== undefined ? ([['各项预算合计', fmtMoney(itemSum)]] as [string, string][]) : []),
              ]}
            />
          </div>
          {result.trip.startDate && (
            <div className={p.mt12}>
              <Field label="出发日期" hint="日期不对时直接选正确的出发日，整份行程会一起平移">
                <TextInput type="date" value={result.trip.startDate} onChange={(e) => changeStart(e.target.value)} />
              </Field>
            </div>
          )}
          <div className={p.mt12}>
            <TypeCounts items={counts} />
          </div>
          <div className={p.mt12}>
            <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 600, margin: '0 0 var(--space-2)' }}>准备检查</h3>
            <CheckList issues={issues} />
          </div>
          {diff && (
            <div className={p.mt12}>
              <DiffSection
                diff={diff}
                accepted={accepted}
                onToggleRename={(k) =>
                  setAccepted((cur) => {
                    const n = new Set(cur);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                  })
                }
              />
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className={p.mt12}>
              <InfoBanner variant="warning" onClick={() => setOpen((o) => !o)}>
                有 {result.warnings.length} 处没完全识别（下面列出；可以导入，也可以返回修改）{open ? '' : ' · 点开查看'}
              </InfoBanner>
              {open && (
                <ul className={p.warnList}>
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      {w.message}
                      {w.line ? (
                        <>
                          {' '}
                          <button type="button" onClick={() => setSrcLine(w.line!)} style={{ color: 'var(--color-primary)', background: 'none', border: 0, padding: 0, font: 'inherit' }}>
                            查看原文
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 600, margin: 'var(--space-4) 0 0' }}>将要导入的内容</h3>
          {result.days.map((d) => (
            <DraftDay
              key={d.index}
              title={`Day ${d.index}${SEP}${d.title || d.city}`}
              date={d.date ? fmtDate(d.date) : '日期未识别'}
              rows={d.items.map((i) => ({
                key: i.key,
                time: i.start ?? i.timeNote,
                icon: itemIcon(i as Item),
                title: i.title,
                sub: itemSubtitle(i as Item) || undefined,
              }))}
            />
          ))}
        </>
      )}
      {srcLine != null && <SourceSheet open onClose={() => setSrcLine(null)} md={draft.md} from={srcLine} to={srcLine} context={2} />}
    </Screen>
  );
}
