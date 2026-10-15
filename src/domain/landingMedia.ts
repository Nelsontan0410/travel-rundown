// 旅程介绍页（Landing）用的照片库：public/landing/*.jpg，全部是 Wikimedia Commons 上的真实照片，
// 作者与许可证见 landingCredits.json（同一份也放在 public/landing/credits.json）。
// 匹配规则：行程项标题、地点、当天城市里出现关键词就用这张图。关键词只写照片真的能代表的东西，
// 认不出就不配图，绝不拿别处的照片冒充。拍摄地点或季节与行程不一致的，用 caption 在照片上标明。
import credits from './landingCredits.json';

export type MediaKind = 'scene' | 'food';

export interface LandingCredit {
  file: string;
  title: string;
  author: string;
  license: string;
  license_url: string;
  source: string;
  modifications: string;
  notes?: string;
}

export interface LandingMedia {
  id: string;
  file: string;
  kind: MediaKind;
  keywords: string[];
  /** 照片里真实拍到的东西 */
  alt: string;
  /** 拍摄地点、季节或菜式与行程不完全一致时，显示在照片角落的如实说明 */
  caption?: string;
  /** 旧的示意插画标记；真实照片一律为 false */
  sample: boolean;
  credit?: LandingCredit;
  /** 雪景：Winter 主题时首屏优先 */
  snowy?: boolean;
}

export const LANDING_CREDITS = credits as LandingCredit[];
const byFile = new Map(LANDING_CREDITS.map((c) => [c.file, c]));

const m = (id: string, kind: MediaKind, alt: string, keywords: string[], caption?: string): LandingMedia => ({
  id,
  file: `/landing/${id}.jpg`,
  kind,
  keywords,
  alt,
  caption,
  sample: false,
  credit: byFile.get(`${id}.jpg`),
});

const SNOWY = new Set(['fuji-lake', 'canal-night', 'snow-city', 'snow-field', 'onsen']);

export const LANDING_MEDIA: LandingMedia[] = [
  m('fuji-lake', 'scene', '冬天从河口湖望富士山，湖面倒影', ['富士', '河口湖', '山中湖', '忍野', '新仓', '新倉', '浅间', '本町通', '大石公园']),
  m('old-street', 'scene', '清晨的浅草雷门', ['浅草', '雷门', '仲见世']),
  m('city-night', 'scene', '东京铁塔与港区夜景', ['东京铁塔', '银座', '涩谷', '秋叶原', '夜景']),
  m('canal-night', 'scene', '小樽运河雪夜与仓库群灯光', ['小樽', '运河', '天狗山', '北一', '音乐盒', '硝子', '堺町']),
  m('snow-city', 'scene', '雪中的札幌市钟楼', ['札幌', '钟楼', '时计台', '大通', '北海道厅', '白色恋人', '圆山', '神宫', '狸小路', '薄野']),
  m('snow-field', 'scene', '美瑛雪原上的孤树', ['美瑛', '富良野', '精灵', '白须', '青池', '雪原']),
  m('onsen', 'scene', '秋田乳头温泉乡鹤之汤的雪景露天温泉', ['温泉', '登别', '定山溪', '定山渓', '翠山亭', '泷本', '滝本', '丰平峡'], '实景：秋田 鹤之汤'),
  m('lake-volcano', 'scene', '从洞爷湖望羊蹄山（5 月拍摄）', ['洞爷', '洞爺', 'Silo', '羊蹄'], '5 月拍摄'),
  m('market', 'scene', '小樽三角市场的活蟹海鲜摊', ['市场', '市場', '二条', '三角市场', '新南樽'], '实景：小樽三角市场'),
  m('runway', 'scene', '机窗外的云层与机翼', ['航班', '飞往', '抵达', '机场', '空港']),
  m('sushi', 'food', '在小樽拍的握寿司', ['寿司', '鮨']),
  m('seafood-bowl', 'food', '海胆鲑鱼卵丼', ['海鲜丼', '丼', '海胆', '鲑鱼卵']),
  m('crab', 'food', '帝王蟹腿', ['帝王蟹', '螃蟹', '蟹'], '摄于多伦多'),
  m('soup-curry', 'food', '在札幌拍的汤咖喱', ['汤咖喱']),
  m('grill', 'food', '成吉思汗烤羊肉', ['成吉思汗', '烤羊肉', '羊肉']),
  m('noodles', 'food', '一碗热荞麦面', ['荞麦']),
  m('sweets', 'food', '小樽 LeTAO 的蒙布朗', ['LeTAO', '蒙布朗', '芝士蛋糕', '甜点'], '图为 LeTAO 蒙布朗'),
  m('kaiseki', 'food', '日式旅馆的怀石料理', ['怀石']),
];

for (const x of LANDING_MEDIA) if (SNOWY.has(x.id)) x.snowy = true;

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
