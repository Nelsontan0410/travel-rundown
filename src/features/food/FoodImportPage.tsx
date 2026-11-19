// 2026-11-19 美食「AI 批量添加」：复制提示词 → 贴给 AI → 把回答贴回来 → 预览勾选 → 一次导入。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import d from './Database.module.css';
import { FoodShell } from './FoodShell';
import { BackHeader } from '../../components/Layout';
import { Button, InfoBanner } from '../../components/Basics';
import { useFoodEntries, useFoodTrip } from '../../hooks/food';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { addFoodEntries } from '../../db/food';
import { FOOD_CATEGORY_LABEL, fmtBudget } from '../../domain/food';
import { buildFoodPrompt, FOOD_WARNING_TEXT, parseFoodText } from '../../importer/foodImport';
import { copyText } from '../../lib/files';
import { toast } from '../../store/ui';
import { backToGallery } from './DatabasePage';

const norm = (s: string) => s.replace(/[\s()（）·\-]/g, '').toLowerCase();

export default function FoodImportPage() {
  const nav = useNavigate();
  const trip = useFoodTrip();
  const foods = useFoodEntries();
  const full = useLiveQuery(async () => (trip ? db.trips.get(trip.id) : undefined), [trip?.id]);
  const [extra, setExtra] = useState('');
  const [text, setText] = useState('');
  const [off, setOff] = useState<Set<number>>(new Set());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const have = useMemo(() => new Set((foods ?? []).map((f) => norm(f.restaurantName) + '|' + norm(f.name))), [foods]);
  const parsed = useMemo(() => parseFoodText(text), [text]);
  const rows = parsed.foods.map((p, i) => {
    const dup = have.has(norm(p.draft.restaurantName) + '|' + norm(p.draft.name));
    return { ...p, i, dup };
  });
  // 重复的默认不勾；用户动过勾选后以用户为准
  const isOn = (r: (typeof rows)[number]) => (touched ? !off.has(r.i) : !r.dup);
  const picked = rows.filter(isOn);

  const copyPrompt = async () => {
    const ok = await copyText(
      buildFoodPrompt({ tripTitle: trip?.title ?? '', startDate: full?.startDate, endDate: full?.endDate, existing: (foods ?? []).map((f) => f.restaurantName), extra }),
    );
    toast(ok ? '提示词已复制，去贴给 AI' : '复制失败，请再试一次');
  };
  const toggle = (i: number) => {
    const base = touched ? off : new Set(rows.filter((r) => r.dup).map((r) => r.i));
    const n = new Set(base);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    setOff(n);
    setTouched(true);
  };
  const run = async () => {
    if (!trip || !picked.length) return;
    setBusy(true);
    try {
      const n = await addFoodEntries(trip.id, picked.map((r) => r.draft));
      toast(`已导入 ${n} 道美食，可以逐个补照片、修改`);
      nav('/food/database', { replace: true });
    } catch (e) {
      toast(`导入失败：${(e as Error).message || '请再试一次'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FoodShell>
      <div className={d.page}>
        <BackHeader title="AI 批量添加美食" onBack={() => backToGallery(nav)} />
        <main className={d.main}>
          {trip === null ? (
            <InfoBanner variant="info">请先导入或选择一份旅程。</InfoBanner>
          ) : (
            <div className={d.form}>
              <section className={d.section}>
                <h2 className={d.sectionTitle}>① 复制提示词</h2>
                <p className={d.emptyText}>会带上「{trip?.title ?? ''}」和已有的店，贴给 ChatGPT / Claude（开联网搜索更准）。</p>
                <label className={d.field}>
                  <span className={d.label}>额外要求（可不填）</span>
                  <textarea className={d.textarea} rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="例如：15 家，口味清淡，要有早餐" />
                </label>
                <Button icon="Copy" block onClick={() => void copyPrompt()}>
                  复制提示词
                </Button>
              </section>
              <section className={d.section}>
                <h2 className={d.sectionTitle}>② 贴回 AI 的回答</h2>
                <textarea className={d.textarea} rows={8} value={text} onChange={(e) => { setText(e.target.value); setTouched(false); setOff(new Set()); }} placeholder="把 AI 整段回答粘贴到这里" aria-label="AI 的回答" />
                {text.trim() && rows.length === 0 && <InfoBanner variant="warning">没读到美食。请确认 AI 按「## 美食名称」加「- 字段: 内容」的格式回答。</InfoBanner>}
              </section>
              {rows.length > 0 && (
                <section className={d.section}>
                  <h2 className={d.sectionTitle}>③ 确认（读到 {rows.length} 道）</h2>
                  <ul className={d.list}>
                    {rows.map((r) => (
                      <li key={r.i} className={d.row}>
                        <label className={d.importRow}>
                          <input type="checkbox" checked={isOn(r)} onChange={() => toggle(r.i)} />
                          <span className={d.rowText}>
                            <strong className={d.rowName}>{r.draft.name}</strong>
                            <span className={d.rowSub}>
                              {r.draft.restaurantName}
                              {r.draft.address ? ` · ${r.draft.address}` : ''}
                            </span>
                            <span className={d.rowMeta}>
                              <span className={d.tag}>{FOOD_CATEGORY_LABEL[r.draft.category]}</span>
                              {r.draft.budget && <span className={d.budget}>{fmtBudget(r.draft.budget)}</span>}
                              {r.dup && <span className={d.warn}>已有这家，默认不导入</span>}
                              {r.warnings.map((w) => (
                                <span key={w} className={d.warn}>
                                  {FOOD_WARNING_TEXT[w]}
                                </span>
                              ))}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button block disabled={busy || !picked.length} onClick={() => void run()}>
                    {busy ? '导入中…' : `导入 ${picked.length} 道`}
                  </Button>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </FoodShell>
  );
}
