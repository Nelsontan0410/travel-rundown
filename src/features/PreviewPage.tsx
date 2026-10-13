import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import p from './Page.module.css';
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
import { itemIcon, itemSubtitle, TYPE_LABEL } from '../domain/rules';
import type { Item, ItemType } from '../domain/types';

const TYPE_ORDER: ItemType[] = ['flight', 'lodging', 'spot', 'meal', 'transit', 'note'];
const TYPE_ICON = { flight: 'Plane', lodging: 'Building2', spot: 'MapPin', meal: 'Utensils', transit: 'TrainFront', note: 'StickyNote' } as const;

/** 导入预览页 */
export default function PreviewPage() {
  const nav = useNavigate();
  const draft = useUI((s) => s.draft);
  const setDraft = useUI((s) => s.setDraft);
  const setPaste = useUI((s) => s.setPasteText);
  const [open, setOpen] = useState(false);
  const [srcLine, setSrcLine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const target = draft?.targetTripId;
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
  if (!draft) return <Navigate to="/trips" replace />;
  const { result } = draft;
  const empty = result.itemCount === 0;
  const blocked = empty || result.errors.length > 0;
  const repairPrompt = buildPrompt().replace('（把你的行程粘贴在这里）', draft.md);

  const all = result.days.flatMap((d) => d.items);
  const counts = TYPE_ORDER.map((t) => ({ icon: TYPE_ICON[t], label: TYPE_LABEL[t], n: all.filter((i) => i.type === t).length })).filter((c) => c.n > 0);
  const changeStart = (v: string) => {
    if (!v || v === result.trip.startDate) return;
    setDraft({ ...draft, result: shiftDraft(result, v) });
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
      tab="trips"
      header={<BackHeader title="导入预览" onBack={back} />}
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
      {blocked ? (
        <div className={p.mt8}>
          <InfoBanner variant="warning">{empty ? '没有识别到任何行程项' : '这份内容不是 App 能用的格式，不能导入'}</InfoBanner>
          {result.errors.length > 0 && (
            <ul className={p.warnList}>
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <p className={p.lead}>把下面的「修复提示词」复制给 ChatGPT 或 Claude（已经附上你的原文），把它回复的内容重新粘贴进来即可。</p>
          <div className={p.mt12}>
            <Button block icon="Copy" onClick={() => void copyWithToast(repairPrompt)}>
              复制修复提示词
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={p.mt8}>
            <KeyValueCard
              rows={[
                ['目的地', result.trip.title],
                ['日期范围', result.trip.startDate ? fmtDateRange(result.trip.startDate, result.trip.endDate) : '—'],
                ['天数', result.trip.startDate ? `${tripDays(result.trip.startDate, result.trip.endDate)}天` : `${result.days.length}天`],
                ['行程项数', String(result.itemCount)],
                ['总预算', result.trip.budget !== undefined ? fmtMoney(result.trip.budget) : '未写（可以之后在账本里设置）'],
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
                {result.warnings.length} 条提示
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
