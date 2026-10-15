// 导入模板页的提示词（v2）：按「旅程 → 每天 → 六种类型的行程项」逐字段对应 App 的数据结构。
// 用户在自己的 ChatGPT / Claude 等工具里用它整理行程，再贴回 App 导入。
import type { NavApp } from '../domain/types';

export const NAV_APP_NAME: Record<NavApp, string> = {
  amap: '高德地图',
  'google-maps': 'Google Maps',
  'apple-maps': 'Apple Maps',
};

const LINK_RULE: Record<NavApp, string> = {
  amap: '- 高德地图：https://uri.amap.com/search?keyword=<地点文本>&callnative=1',
  'google-maps':
    '- Google Maps：https://www.google.com/maps/dir/?api=1&destination=<地点文本>；transit 项可加 &origin=<起点文本>&travelmode=transit',
  'apple-maps': '- Apple Maps：https://maps.apple.com/?daddr=<地点文本>',
};

export function navRule(china: NavApp, elsewhere: NavApp): string {
  if (china === elsewhere) return `所有行程项都用${NAV_APP_NAME[china]}链接。`;
  return `中国大陆境内的行程项用${NAV_APP_NAME[china]}链接，其他地区用${NAV_APP_NAME[elsewhere]}链接。`;
}

export function linkRules(china: NavApp, elsewhere: NavApp): string {
  const apps = china === elsewhere ? [china] : [china, elsewhere];
  return apps.map((a) => LINK_RULE[a]).join('\n');
}

const TEMPLATE = `你是旅行行程整理助手。请把我在最后给出的旅行行程（任何格式都可以，聊天记录也可以），整理成下面规定的格式，导入「旅程 Rundown」App 使用。
把整份结果放进一个代码块（三个反引号加 text 开头的代码块）里输出，这样行首的 #、##、### 符号不会被聊天界面吃掉，我可以一键复制。代码块之外不要写任何解释，里面不要加 Markdown 加粗。

【一、旅程信息】放在最前面：

# 地区，国家
- 日期: DD-MM-YYYY ~ DD-MM-YYYY
- 出发地时区: IANA 时区，例如 Asia/Kuala_Lumpur
- 预算: 数字（单位 MYR，原行程写了总预算才写）
- 人数: 数字（原行程写了同行人数才写）

标题只写「城市或更大的地区，国家」，例如「北海道，日本」「首尔，韩国」「曼谷，泰国」。不要写更小的地方（例如登别、小樽），也不要写「冬日之旅」这类描述。
日期一律写「日-月-年」，例如 13-01-2027，绝对不要写成月在前。

【二、每一天】一个二级标题，五段用 | 分隔：

## Day N | DD-MM-YYYY | 当天所在城市 | 当地时区（IANA，例如 Asia/Tokyo） | 当天主题

【三、行程项】每一项一个三级标题，按当天先后顺序排列：

### [类型] HH:mm-HH:mm 标题

类型只能是下面六种之一（方括号里写英文）：
- flight：机票 / 航班
- lodging：住宿
- spot：景点、活动、购物
- transit：交通（地铁、巴士、JR、出租车、租车、步行等）
- meal：餐饮（早餐、午餐、晚餐、小吃）
- note：其他提醒

时间用 24 小时制当地时间。没有确切时间就不写时间，改用「- 时间说明: 早上」这类说明。航班到达在第二天时，结束时间后加 +1，例如 23:30-06:10+1。

【四、各类型的字段】在标题下面用「- 字段: 值」逐行写。没有的信息就整行省略，绝对不要编造。

所有类型都可以用：
- 地点: 显示名 | 当地语言名
- 地址: 地址 | 当地语言地址
- 订单: 订单号或确认码
- 预订状态: 已确认 或 待确认
- 备注: 一句话补充
- 备选: 备选方案，例如 下雪太大就改去室内展
- 固定: 是（航班、预约等不能移动的时间才写）

flight 另外写：
- 航班号: 例如 MH 88
- 航空公司:
- 航站楼:
- 地点: 出发机场 | 当地语言名
- 终点: 到达机场 | 当地语言名

lodging 另外写：
- 入住日期: DD-MM-YYYY
- 退房日期: DD-MM-YYYY
- 房型:
（lodging 写在入住那一天；只写一次，不要每晚重复）

spot 另外写：
- 必逛: 必逛或必体验的事情，用「；」分隔，例如 运河拍照；音乐盒堂；北一硝子
（也可以写成「- 必逛:」后面换行，每件事一行缩进的「  - xxx」）

meal 另外写：
- 餐别: 早餐 / 午餐 / 晚餐 / 小吃
- 必吃: 推荐的菜，用「；」分隔

transit 另外写：
- 方式: 地铁 / 巴士 / JR / 出租车 / 租车 / 步行 等
- 线路: 线路名称
- 地点: 起点 | 当地语言名
- 终点: 终点 | 当地语言名

【五、规则】
1. 当地语言名和当地语言地址用目的地当地文字（日本写日文，韩国写韩文，中国大陆写简体中文）。App 会用它们自动生成地图导航，所以请尽量写准确；不确定就省略。
2. 不要写导航链接、经纬度、价格明细、天气、长篇介绍。
3. 不要编造订单号、航班号、时间、预订状态。原行程没有的就省略。
4. 每一天都要有，日期要连续，和旅程的日期范围一致。

【我的行程】
（把你的行程粘贴在这里）`;

/** v2：导航链接改由 App 生成，提示词不再包含链接规则；参数保留以兼容调用方 */
export function buildPrompt(_china?: NavApp, _elsewhere?: NavApp): string {
  return TEMPLATE;
}
