// 2026-10-23 美食资料库：管理界面（实用、清楚）。只能从 Gallery 的「管理」按钮进来。
import { useState, type CSSProperties } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import d from './Database.module.css';
import { FoodShell } from './FoodShell';
import { useThumb } from './photos';
import { BackHeader, Dialog } from '../../components/Layout';
import { Button, FilterChips } from '../../components/Basics';
import { Icon } from '../../components/Icon';
import { useFoodEntries } from '../../hooks/food';
import { deleteFoodEntry } from '../../db/food';
import { filterFoods, fmtBudget, FOOD_CATEGORIES, FOOD_CATEGORY_LABEL, shortAddress, type FoodCategory, type FoodEntry } from '../../domain/food';
import { focusStyle } from '../../domain/guide';
import { toast } from '../../store/ui';

type Cat = FoodCategory | 'all';

/** 回到 Gallery：资料库是从 Gallery 进来的，退一步就是 Gallery */
export function backToGallery(nav: NavigateFunction): void {
  if (window.history.state && window.history.state.idx > 0) nav(-1);
  else nav('/food', { replace: true });
}

export default function DatabasePage() {
  const nav = useNavigate();
  const foods = useFoodEntries();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('all');
  const [del, setDel] = useState<FoodEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const list = foods ? filterFoods(foods, cat, q) : [];

  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await deleteFoodEntry(del.id);
      toast(`已删除「${del.name}」`);
      setDel(null);
    } catch (e) {
      toast(`删除失败：${(e as Error).message || '请再试一次'}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <FoodShell>
      <div className={d.page}>
        <BackHeader title="美食资料库" onBack={() => backToGallery(nav)} right={{ icon: 'Plus', label: '新增美食', onClick: () => nav('/food/database/new'), primary: true }} />
        <main className={d.main}>
          <div className={d.tools}>
            <label className={d.search}>
              <Icon name="Search" size="sm" />
              <input type="search" enterKeyHint="search" placeholder="搜索美食、店名、地址…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索美食" />
            </label>
            <Button className={d.addBtn} icon="Plus" onClick={() => nav('/food/database/new')}>
              新增
            </Button>
          </div>
          <FilterChips
            options={[{ value: 'all' as Cat, label: '全部' }, ...FOOD_CATEGORIES.map((c) => ({ value: c.key as Cat, label: c.label }))]}
            value={cat}
            onChange={setCat}
          />
          {foods === undefined ? null : foods.length === 0 ? (
            <div className={d.empty}>
              <Icon name="Utensils" size="lg" />
              <p className={d.emptyTitle}>还没有美食</p>
              <p className={d.emptyText}>新增第一道美食：上传照片、填写店名和地址，就会出现在美食专区的照片墙上。</p>
              <Button icon="Plus" onClick={() => nav('/food/database/new')}>
                新增美食
              </Button>
            </div>
          ) : (
            <>
              <p className={d.count}>{list.length === foods.length ? `共 ${foods.length} 道` : `${list.length} / ${foods.length} 道`}</p>
              {list.length === 0 ? (
                <p className={d.none}>没有符合的美食，换个关键字或分类试试。</p>
              ) : (
                <ul className={d.list}>
                  {list.map((f) => (
                    <Row key={f.id} f={f} onEdit={() => nav(`/food/database/${f.id}`)} onDelete={() => setDel(f)} />
                  ))}
                </ul>
              )}
            </>
          )}
        </main>
        <Dialog
          open={!!del}
          onClose={() => !deleting && setDel(null)}
          title={`删除「${del?.name ?? ''}」？`}
          text="这道美食和它的照片都会删除，不能恢复。"
          actions={
            <>
              <Button variant="outline" disabled={deleting} onClick={() => setDel(null)}>
                取消
              </Button>
              <Button variant="danger" disabled={deleting} onClick={() => void remove()}>
                {deleting ? '删除中…' : '删除'}
              </Button>
            </>
          }
        />
      </div>
    </FoodShell>
  );
}

function Row({ f, onEdit, onDelete }: { f: FoodEntry; onEdit: () => void; onDelete: () => void }) {
  const src = useThumb(f.photoKey);
  const budget = fmtBudget(f.budget);
  return (
    <li className={d.row}>
      <button type="button" className={d.rowMain} onClick={onEdit} aria-label={`编辑 ${f.name}`}>
        <span className={d.thumb}>{src ? <img src={src} alt="" loading="lazy" style={focusStyle(f.photoFocus) as CSSProperties} /> : <Icon name="Utensils" size="sm" />}</span>
        <span className={d.rowText}>
          <strong className={d.rowName}>{f.name}</strong>
          <span className={d.rowSub}>
            {f.restaurantName} · {shortAddress(f.address)}
          </span>
          <span className={d.rowMeta}>
            <span className={d.tag}>{FOOD_CATEGORY_LABEL[f.category]}</span>
            {budget && <span className={d.budget}>{budget}</span>}
          </span>
        </span>
      </button>
      <span className={d.rowBtns}>
        <button type="button" className={d.iconBtn} aria-label={`编辑 ${f.name}`} onClick={onEdit}>
          <Icon name="Pencil" size="sm" />
        </button>
        <button type="button" className={`${d.iconBtn} ${d.danger}`} aria-label={`删除 ${f.name}`} onClick={onDelete}>
          <Icon name="Trash2" size="sm" />
        </button>
      </span>
    </li>
  );
}
