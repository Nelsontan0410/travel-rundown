// 类别图标与「选择内容类型」格子（E04），添加和编辑共用
import g from './Guide.module.css';
import { Icon, type IconKey } from '../../components/Icon';
import { CATEGORIES, CATEGORY_LABEL, type HighlightCategory } from '../../domain/guide';

export const CATEGORY_ICON: Record<HighlightCategory, IconKey> = {
  spot: 'Mountain',
  food: 'Utensils',
  culture: 'Building2',
  experience: 'Camera',
  shopping: 'ShoppingBag',
  lodging: 'Home',
  other: 'MoreHorizontal',
};

/** 选择内容类型（E04）：一格一个类别 */
export function CategoryTiles({ value, onPick }: { value?: HighlightCategory; onPick: (c: HighlightCategory) => void }) {
  return (
    <div className={g.tiles} role="group" aria-label="类别">
      {CATEGORIES.map((c) => (
        <button key={c} type="button" className={`${g.tile} ${value === c ? g.tileOn : ''}`} aria-pressed={value === c} onClick={() => onPick(c)}>
          <Icon name={CATEGORY_ICON[c]} />
          <span>{CATEGORY_LABEL[c]}</span>
        </button>
      ))}
    </div>
  );
}

