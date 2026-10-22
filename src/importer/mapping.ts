// 导入的字段映射（Layer 2 · 规则匹配）：把各种写法的字段名对到 App 的统一字段上。
// MD / JSON / CSV 共用同一张别名表，所以「Place / Location / 地点」在三种格式里都落到同一个字段。

/** 统一字段（canonical）。MD 解析器按这些中文名处理 */
export type Canon =
  | '标题' | '类型' | '时间' | '开始' | '结束' | '时间说明'
  | '地点' | '当地名' | '地址' | '当地地址' | '终点' | '终点当地名'
  | '备注' | '备选' | '固定' | '订单' | '预订状态' | '导航'
  | '航班号' | '航空公司' | '航站楼' | '座位'
  | '入住日期' | '退房日期' | '房型'
  | '方式' | '线路' | '餐别' | '必逛'
  | '日期' | '第几天' | '城市' | '时区' | '当天主题'
  | '旅程标题' | '出发日期' | '结束日期' | '出发地时区' | '预算' | '人数' | '目的地' | '项预算';

const ALIASES: Record<Canon, string[]> = {
  标题: ['title', 'name', 'activity', 'activityname', 'event', 'item', '活动', '名称', '项目', '标题'],
  类型: ['type', 'category', 'kind', '类型', '类别', '分类'],
  时间: ['time', 'timerange', '时段', '时间'],
  开始: ['start', 'starttime', 'from', 'begin', '开始', '开始时间'],
  结束: ['end', 'endtime', 'until', 'to_time', '结束', '结束时间'],
  时间说明: ['timenote', 'when', '时间说明'],
  地点: ['place', 'location', 'venue', 'where', 'spot', 'placename', '地点', '地方', '位置', '场所'],
  当地名: ['localname', 'nativename', 'placelocal', '当地名', '当地名称', '原文名'],
  地址: ['address', 'addr', '地址'],
  当地地址: ['localaddress', '当地地址'],
  终点: ['to', 'destination', 'arrive', 'toplace', 'dest', '终点', '目的', '到达'],
  终点当地名: ['tolocalname', '终点当地名'],
  备注: ['note', 'notes', 'remark', 'remarks', 'description', 'desc', 'comment', 'memo', 'details', '备注', '说明', '描述'],
  备选: ['alt', 'alternative', 'planb', 'backup', '备选', '备选方案'],
  固定: ['fixed', 'locked', '固定'],
  订单: ['bookingref', 'booking', 'reservation', 'confirmation', 'order', 'ref', '订单', '订单号', '预订号', '确认号'],
  预订状态: ['bookingstatus', 'status', '预订状态', '状态'],
  导航: ['navurl', 'map', 'mapurl', 'link', 'url', '导航', '链接'],
  航班号: ['flightnumber', 'flightno', 'flight', '航班号', '航班'],
  航空公司: ['airline', 'carrier', '航空公司'],
  航站楼: ['terminal', '航站楼'],
  座位: ['seat', '座位'],
  入住日期: ['checkin', '入住', '入住日期'],
  退房日期: ['checkout', '退房', '退房日期'],
  房型: ['roomtype', 'room', '房型'],
  方式: ['mode', 'transport', 'transportation', 'transitmode', '方式', '交通方式'],
  线路: ['line', 'route', '线路', '路线'],
  餐别: ['meal', 'mealtype', '餐别'],
  必逛: ['mustdo', 'highlights', 'mustsee', 'musteat', 'todo', '必逛', '必玩', '必看', '必做', '必体验', '必吃', '必点', '亮点'],
  日期: ['date', 'day_date', '日期'],
  第几天: ['day', 'daynumber', 'dayno', 'dayindex', '第几天', '天'],
  城市: ['city', 'area', 'region', '城市', '地区'],
  时区: ['timezone', 'tz', 'zone', '时区', '当地时区'],
  当天主题: ['daytitle', 'theme', 'daytheme', '当天主题', '主题'],
  旅程标题: ['triptitle', 'tripname', '旅程标题', '旅程名称'],
  出发日期: ['startdate', 'tripstart', 'departure', 'departuredate', '出发日期', '开始日期'],
  结束日期: ['enddate', 'tripend', 'returndate', '结束日期', '回程日期'],
  出发地时区: ['hometimezone', 'hometz', 'origintimezone', '出发地时区'],
  预算: ['budget', 'totalbudget', '预算', '总预算'],
  人数: ['participants', 'travelers', 'travellers', 'pax', 'people', 'headcount', 'persons', '人数', '参与人数', '同行人数'],
  目的地: ['destination_country', 'country', '目的地', '国家'],
  项预算: ['itembudget', 'cost', 'estimatedcost', 'price', 'expense', '项预算', '预估费用', '预估花费', '预计花费', '费用', '花费'],
};

/** 字段名标准化：小写、去掉空格 / 下划线 / 连字符 / 冒号 */
export function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s_\-:：]/g, '');
}

const INDEX = new Map<string, Canon>();
for (const [canon, list] of Object.entries(ALIASES) as [Canon, string[]][]) {
  for (const a of list) if (!INDEX.has(normKey(a))) INDEX.set(normKey(a), canon);
}

/** 字段名 → 统一字段；认不出返回 undefined。scope 用来消歧：同一个词在旅程层和行程项层含义不同 */
export function canonField(key: string, scope: 'item' | 'day' | 'trip' = 'item'): Canon | undefined {
  const n = normKey(key);
  if (scope === 'trip') {
    if (['title', 'name', '标题', '名称'].includes(n)) return '旅程标题';
    if (['start', 'from', '开始'].includes(n)) return '出发日期';
    if (['end', 'to', 'until', '结束'].includes(n)) return '结束日期';
    if (['timezone', 'tz', '时区'].includes(n)) return '出发地时区';
    if (['destination'].includes(n)) return '目的地';
  }
  if (scope === 'day') {
    if (['title', 'theme', 'name', '标题', '主题'].includes(n)) return '当天主题';
    if (['note', 'notes', '备注'].includes(n)) return '备注';
  }
  return INDEX.get(n);
}

/** 行程项类型的各种写法 → App 的六种类型 */
const TYPE_WORDS: Record<string, string> = {
  flight: 'flight', plane: 'flight', air: 'flight', 机票: 'flight', 航班: 'flight', 飞机: 'flight',
  lodging: 'lodging', hotel: 'lodging', accommodation: 'lodging', stay: 'lodging', hostel: 'lodging', ryokan: 'lodging', 住宿: 'lodging', 酒店: 'lodging', 旅馆: 'lodging',
  spot: 'spot', attraction: 'spot', sightseeing: 'spot', activity: 'spot', visit: 'spot', shopping: 'spot', poi: 'spot', 景点: 'spot', 活动: 'spot', 购物: 'spot', 参观: 'spot',
  transit: 'transit', transport: 'transit', transportation: 'transit', train: 'transit', bus: 'transit', taxi: 'transit', drive: 'transit', car: 'transit', ferry: 'transit', walk: 'transit', 交通: 'transit',
  meal: 'meal', food: 'meal', dining: 'meal', restaurant: 'meal', eat: 'meal', breakfast: 'meal', lunch: 'meal', dinner: 'meal', snack: 'meal', 餐饮: 'meal', 用餐: 'meal', 早餐: 'meal', 午餐: 'meal', 晚餐: 'meal', 小吃: 'meal',
  note: 'note', other: 'note', memo: 'note', reminder: 'note', 其他: 'note', 备注: 'note', 提醒: 'note',
};

export function typeOf(raw: string): string | undefined {
  return TYPE_WORDS[normKey(raw)];
}
