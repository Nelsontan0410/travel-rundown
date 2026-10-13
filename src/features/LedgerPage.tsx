import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader, Sheet } from '../components/Layout';
import { Button, Card, EmptyState, FilterChips, SectionTitle } from '../components/Basics';
import { Field, FormActions, TextInput } from '../components/Form';
import { CategoryBreakdown, ExpenseRow, LedgerDay, LedgerSummaryCard } from '../components/Ledger';
import type { IconKey } from '../components/Icon';
import { useTripData, type TripData } from '../hooks/data';
import { addExpense, deleteExpense, setBudget, updateExpense } from '../db/repo';
import { deviceTz, fmtDate, fmtMoney, nowIn, parseMoney, SEP } from '../domain/format';
import { categoryForType, EXPENSE_LABEL, ledgerSummary } from '../domain/rules';
import { CURRENCY, type Expense, type ExpenseCategory } from '../domain/types';
import { toast } from '../store/ui';

const CAT_ICON: Record<ExpenseCategory, IconKey> = {
  flight: 'Plane',
  lodging: 'Building2',
  transit: 'TrainFront',
  meal: 'Utensils',
  ticket: 'Ticket',
  shopping: 'Wallet',
  other: 'StickyNote',
};

const CAT_OPTIONS = (Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((value) => ({ value, label: EXPENSE_LABEL[value] }));

const moneyText = (sen: number) => (sen / 100).toFixed(2).replace(/\.00$/, '');

/** 记一笔 / 修改一笔 */
function ExpenseSheet({
  open,
  onClose,
  td,
  editing,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  td: TripData;
  editing?: Expense;
  preset?: { itemKey?: string };
}) {
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('meal');
  const [date, setDate] = useState('');
  const [itemKey, setItemKey] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (editing) {
      setAmount(moneyText(editing.amount));
      setTitle(editing.title);
      setCategory(editing.category);
      setDate(editing.date);
      setItemKey(editing.itemKey ?? '');
      setNote(editing.note ?? '');
      return;
    }
    const it = preset?.itemKey ? td.items.find((i) => i.key === preset.itemKey) : undefined;
    const day = it ? td.dayById.get(it.dayId) : undefined;
    const today = nowIn(day?.tz ?? td.days[0]?.tz ?? deviceTz()).date;
    setAmount('');
    setTitle(it?.title ?? '');
    setCategory(categoryForType(it?.type));
    setDate(day?.date ?? today);
    setItemKey(it?.key ?? '');
    setNote('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const sen = parseMoney(amount);
    if (sen === null || sen <= 0) return setErr('请输入金额，例如 25 或 25.50');
    if (!date) return setErr('请选择日期');
    const data = { amount: sen, title: title.trim() || EXPENSE_LABEL[category], category, date, itemKey: itemKey || undefined, note: note.trim() || undefined };
    if (editing) await updateExpense(editing.id, data);
    else await addExpense({ tripId: td.trip.id, ...data });
    toast(editing ? '已更新' : '已记下');
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    await deleteExpense(editing.id);
    toast('已删除');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? '修改花费' : '记一笔'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={`金额（${CURRENCY}）`} error={err || undefined}>
          <TextInput money inputMode="decimal" placeholder="0.00" value={amount} autoFocus={!editing} onChange={(e) => { setAmount(e.target.value); setErr(''); }} />
        </Field>
        <Field label="内容">
          <TextInput placeholder={EXPENSE_LABEL[category]} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className={p.mt12}>
          <FilterChips options={CAT_OPTIONS} value={category} onChange={setCategory} />
        </div>
        <div className={p.mt12}>
          <Field label="日期">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="关联行程项（可选）">
          <select className={p.select} value={itemKey} onChange={(e) => setItemKey(e.target.value)}>
            <option value="">不关联</option>
            {td.items
              .filter((i) => i.type !== 'note')
              .map((i) => {
                const d = td.dayById.get(i.dayId);
                return (
                  <option key={i.id} value={i.key}>
                    {d ? `Day ${d.index}${SEP}` : ''}
                    {i.title}
                  </option>
                );
              })}
          </select>
        </Field>
        <Field label="备注（可选）">
          <TextInput value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormActions>
          {editing && (
            <Button variant="outline" onClick={() => void remove()}>
              删除
            </Button>
          )}
          <Button type="submit">保存</Button>
        </FormActions>
      </form>
    </Sheet>
  );
}

function BudgetSheet({ open, onClose, td }: { open: boolean; onClose: () => void; td: TripData }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setV(td.trip.budget !== undefined ? moneyText(td.trip.budget) : '');
      setErr('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!v.trim()) {
      await setBudget(td.trip.id, undefined);
      return onClose();
    }
    const sen = parseMoney(v);
    if (sen === null) return setErr('请输入数字，例如 8000');
    await setBudget(td.trip.id, sen);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="总预算">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={`金额（${CURRENCY}）`} hint="留空表示不设预算" error={err || undefined}>
          <TextInput money inputMode="decimal" placeholder="0.00" value={v} autoFocus onChange={(e) => { setV(e.target.value); setErr(''); }} />
        </Field>
        <FormActions>
          <Button type="submit">保存</Button>
        </FormActions>
      </form>
    </Sheet>
  );
}

/** 旅行账本：总预算、已花、剩余，分类和每日明细。目前只支持 MYR */
export default function LedgerPage() {
  const nav = useNavigate();
  const { tripId } = useParams();
  const [sp, setSp] = useSearchParams();
  const td = useTripData(tripId);
  const [sheet, setSheet] = useState<'add' | 'budget' | null>(null);
  const [editing, setEditing] = useState<Expense | undefined>();
  const [preset, setPreset] = useState<{ itemKey?: string } | undefined>();

  // 从行程详情「记一笔花费」进来：自动打开并带上那一项
  useEffect(() => {
    if (td && sp.get('add')) {
      setPreset({ itemKey: sp.get('item') ?? undefined });
      setEditing(undefined);
      setSheet('add');
      setSp({}, { replace: true });
    }
  }, [td?.trip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    if (!td) return [];
    const out: { date: string; rows: Expense[]; total: number }[] = [];
    for (const e of td.expenses) {
      const last = out[out.length - 1];
      if (last && last.date === e.date) {
        last.rows.push(e);
        last.total += e.amount;
      } else out.push({ date: e.date, rows: [e], total: e.amount });
    }
    return out;
  }, [td]);

  if (td === null) return <Navigate to="/itinerary" replace />;
  if (!td) return <Screen tab="itinerary" header={<BackHeader title="旅行账本" />}>{null}</Screen>;

  const sum = ledgerSummary(td.trip.budget, td.expenses);
  const dayOf = new Map(td.days.map((d) => [d.date, d]));
  const itemTitle = new Map(td.items.map((i) => [i.key, i.title]));
  const openAdd = () => {
    setEditing(undefined);
    setPreset(undefined);
    setSheet('add');
  };

  return (
    <Screen
      tab="itinerary"
      header={<BackHeader title="旅行账本" right={{ icon: 'Pencil', label: '修改总预算', onClick: () => setSheet('budget') }} />}
      bottom={
        <Button block icon="Plus" onClick={openAdd}>
          记一笔
        </Button>
      }
    >
      <p className={p.lead}>
        {td.trip.title}
        {SEP}金额单位 {CURRENCY}
      </p>
      <div className={p.mt12}>
        <LedgerSummaryCard
          title="总览"
          budget={sum.budget}
          spent={sum.spent}
          left={sum.left}
          fmt={fmtMoney}
          action={
            sum.budget === undefined ? (
              <Button variant="link" onClick={() => setSheet('budget')}>
                设置预算
              </Button>
            ) : undefined
          }
        />
      </div>

      {sum.byCategory.length > 0 && (
        <>
          <SectionTitle>分类</SectionTitle>
          <CategoryBreakdown rows={sum.byCategory.map((c) => ({ label: EXPENSE_LABEL[c.category], amount: c.amount }))} fmt={fmtMoney} />
        </>
      )}

      <SectionTitle>明细</SectionTitle>
      {groups.length === 0 ? (
        <Card>
          <EmptyState compact title="还没有花费记录" text="旅途中每花一笔，点下面的「记一笔」" />
        </Card>
      ) : (
        groups.map((g) => {
          const d = dayOf.get(g.date);
          return (
            <div key={g.date}>
              <LedgerDay label={`${d ? `Day ${d.index}${SEP}` : ''}${fmtDate(g.date)}`} total={fmtMoney(g.total)} />
              <Card>
                {g.rows.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    icon={CAT_ICON[e.category]}
                    title={e.title}
                    sub={[EXPENSE_LABEL[e.category], e.itemKey && itemTitle.get(e.itemKey), e.note].filter(Boolean).join(SEP)}
                    amount={fmtMoney(e.amount)}
                    onClick={() => {
                      setEditing(e);
                      setSheet('add');
                    }}
                  />
                ))}
              </Card>
            </div>
          );
        })
      )}
      <div className={p.mt16}>
        <Button variant="link" onClick={() => nav(`/itinerary/${td.trip.id}`)}>
          回到行程
        </Button>
      </div>

      <ExpenseSheet open={sheet === 'add'} onClose={() => setSheet(null)} td={td} editing={editing} preset={preset} />
      <BudgetSheet open={sheet === 'budget'} onClose={() => setSheet(null)} td={td} />
    </Screen>
  );
}
