// 2026-10-21 美食专区的展示组件：只接收 props，不读数据
import type { ReactNode } from 'react';
import s from './Food.module.css';
import { Button, Card } from './Basics';
import { Icon } from './Icon';

export interface FoodCardView {
  name: string;
  localName?: string;
  /** 类型 · 菜系 · 城市 */
  tags: string[];
  /** 推荐理由（只在找备选时有） */
  reasons?: string[];
  meals?: string;
  mustTry?: string[];
  price?: string;
  hours?: string;
  reserve?: boolean;
  note?: string;
  ate?: boolean;
  fav?: boolean;
}

/** 一家店 */
export function FoodCard({
  food,
  onNav,
  onLink,
  onAte,
  onFav,
  onEdit,
  primary,
}: {
  food: FoodCardView;
  onNav?: () => void;
  onLink?: () => void;
  onAte?: () => void;
  onFav?: () => void;
  onEdit?: () => void;
  /** 找备选时的主按钮「改去这家」 */
  primary?: { label: string; onClick: () => void };
}) {
  return (
    <Card className={`${s.card} ${food.ate ? s.ate : ''}`}>
      <div className={s.head}>
        <Icon name="Utensils" size="sm" />
        <div className={s.headText}>
          <div className={s.name}>{food.name}</div>
          {food.localName && <div className={s.local}>{food.localName}</div>}
        </div>
        {onFav && (
          <button type="button" className={food.fav ? s.markOn : ''} aria-pressed={!!food.fav} aria-label={food.fav ? '取消收藏' : '收藏'} onClick={onFav}>
            <Icon name="Star" size="sm" style={food.fav ? { fill: 'currentColor' } : undefined} />
          </button>
        )}
      </div>
      {(!!food.reasons?.length || !!food.tags.length) && (
        <div className={s.tags}>
          {food.reasons?.map((r) => <span key={`r-${r}`} className={`${s.tag} ${s.reason}`}>{r}</span>)}
          {food.tags.map((t) => <span key={t} className={s.tag}>{t}</span>)}
          {food.ate && <span className={s.tag}>吃过了</span>}
          {food.reserve && <span className={s.tag}>需要预约</span>}
        </div>
      )}
      {food.meals && <div className={s.line}>适合：{food.meals}</div>}
      {!!food.mustTry?.length && <div className={s.line}><strong>必吃</strong> {food.mustTry.join('、')}</div>}
      {food.price && <div className={s.line}>价位：{food.price}</div>}
      {food.hours && <div className={s.line}>营业：{food.hours}</div>}
      {food.note && <div className={s.line}>{food.note}</div>}
      <div className={s.actions}>
        {primary && <Button size="sm" icon="CheckCircle2" onClick={primary.onClick}>{primary.label}</Button>}
        {onNav && <Button size="sm" variant="outline" icon="Navigation" onClick={onNav}>导航</Button>}
        {onLink && <Button size="sm" variant="outline" icon="ExternalLink" onClick={onLink}>链接</Button>}
        {onAte && <Button size="sm" variant="link" chevron={false} onClick={onAte}>{food.ate ? '改为没吃过' : '吃过了'}</Button>}
        {onEdit && <Button size="sm" variant="link" chevron={false} icon="Pencil" onClick={onEdit}>编辑</Button>}
      </div>
    </Card>
  );
}

/** 行程里已经安排的一餐 */
export function PlannedMealRow({ title, sub, count, onClick }: { title: string; sub: string; count: string; onClick: () => void }) {
  return (
    <button type="button" className={s.planned} onClick={onClick}>
      <Icon name="Utensils" size="sm" />
      <span className={s.plannedText}>
        <span className={s.plannedTitle}>{title}</span>
        <br />
        <span className={s.plannedSub}>{sub}</span>
      </span>
      <span className={s.count}>{count}</span>
      <Icon name="ChevronRight" size="xs" />
    </button>
  );
}

export function FoodList({ children }: { children: ReactNode }) {
  return <div className={s.list}>{children}</div>;
}

export const foodStyles = s;
