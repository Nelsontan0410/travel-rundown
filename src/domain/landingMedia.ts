// 旅程介绍页（Landing）用的图片库。
// 现在全部是 public/landing/ 里的示意插画（.svg）；用 GPT image 做好真实照片后，
// 把同名 .jpg 放进 public/landing/，再把这里对应的 file 后缀改成 .jpg 即可。
// 提示词见 docs/landing-images.md。匹配规则：行程项标题、地点、当天城市里出现关键词就用这张图。

export type MediaKind = 'scene' | 'food';

export interface LandingMedia {
  id: string;
  file: string;
  kind: MediaKind;
  keywords: string[];
  alt: string;
  /** 示意图还没换成真实照片时为 true，页面会标「示意图」 */
  sample: boolean;
}

const m = (id: string, kind: MediaKind, alt: string, keywords: string[], ext = 'svg'): LandingMedia => ({
  id,
  file: `/landing/${id}.${ext}`,
  kind,
  keywords,
  alt,
  sample: ext === 'svg',
});

export const LANDING_MEDIA: LandingMedia[] = [
  m('fuji-lake', 'scene', '湖边远望富士山', ['富士', '河口湖', '山中湖', '忍野', '新仓', '新倉', '浅间', '本町通', '大石公园']),
  m('old-street', 'scene', '清晨的老街与寺门', ['浅草', '雷门', '仲见世', '寺', '神社', '神宫', '鸟居', '老街', '堺町']),
  m('city-night', 'scene', '城市夜景与灯牌', ['东京铁塔', '银座', '涩谷', '秋叶原', '薄野', '狸小路', '夜景', '霓虹', '购物']),
  m('canal-night', 'scene', '运河边的煤气灯与仓库', ['小樽', '运河', '天狗山', '北一', '音乐盒', '硝子']),
  m('snow-city', 'scene', '雪中的红砖建筑与钟楼', ['札幌', '钟楼', '时计台', '大通', '北海道厅', '白色恋人', '圆山']),
  m('snow-field', 'scene', '雪原上的孤树与丘陵', ['美瑛', '富良野', '精灵', '白须', '青池', '雪原', '旭山', '动物园']),
  m('onsen', 'scene', '雪景露天温泉的蒸汽', ['温泉', '登别', '定山溪', '定山渓', '翠山亭', '泷本', '滝本', '丰平峡', '熊牧场']),
  m('lake-volcano', 'scene', '湖面与远山', ['洞爷', '洞爺', 'Silo', '羊蹄', '湖']),
  m('market', 'scene', '清晨的海鲜市场', ['市场', '市場', '二条', '三角市场', '新南樽']),
  m('runway', 'scene', '机窗外的云层与机翼', ['机场', '空港', '航班', '飞往', '抵达']),
  m('sushi', 'food', '寿司台上的握寿司', ['寿司', '鮨']),
  m('seafood-bowl', 'food', '铺满海胆和鲑鱼卵的海鲜丼', ['海鲜丼', '丼', '海胆', '鲑鱼卵']),
  m('crab', 'food', '现蒸帝王蟹', ['帝王蟹', '螃蟹', '蟹']),
  m('soup-curry', 'food', '北海道汤咖喱', ['汤咖喱', '咖喱']),
  m('grill', 'food', '铁板与炭火烤肉', ['成吉思汗', '羊肉', '神户牛', '和牛', '铁板烧', '烤肉']),
  m('noodles', 'food', '一碗热荞麦面', ['荞麦', '乌冬', '拉面', '面']),
  m('sweets', 'food', '芝士蛋糕与日式甜点', ['蛋糕', '甜点', 'LeTAO', '松饼', '下午茶', '人形烧', '仙贝', '巧克力', '草饼']),
  m('kaiseki', 'food', '旅馆怀石料理', ['怀石', '自助', '旅馆']),
];

export const FALLBACK_SCENES = ['fuji-lake', 'snow-field', 'old-street', 'lake-volcano', 'canal-night', 'snow-city'];
export const FALLBACK_FOOD = ['noodles', 'sweets', 'kaiseki'];

const byId = new Map(LANDING_MEDIA.map((x) => [x.id, x]));
export function mediaById(id: string): LandingMedia {
  return byId.get(id) ?? LANDING_MEDIA[0];
}

/** 按文字找最匹配的图：命中关键词越长、越多越优先 */
export function matchMedia(text: string, kind: MediaKind): LandingMedia | undefined {
  let best: LandingMedia | undefined;
  let bestScore = 0;
  for (const x of LANDING_MEDIA) {
    if (x.kind !== kind) continue;
    const score = x.keywords.reduce((s, k) => (text.includes(k) ? s + k.length : s), 0);
    if (score > bestScore) {
      best = x;
      bestScore = score;
    }
  }
  return best;
}
