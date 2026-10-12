// 导入模板页的转换提示词。正文以 PRD「导入窗口」为准，
// 加上设计参考「数据绑定」新增的三个可选项：目的地、Day 主题、预订状态（以及 03 用到的「退房日期」「房型」）。
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

const TEMPLATE = `你是旅行行程格式转换助手。请把我在最后给出的旅行行程（任何格式都可以），转换成下面规定的 Markdown 格式。只输出转换后的 Markdown 本身，不要解释，不要用代码块包起来。

【格式】
第一部分是行程标题和基本信息：

# 行程标题
- 日期: YYYY-MM-DD ~ YYYY-MM-DD
- 出发地时区: IANA 时区，例如 Asia/Singapore
- 目的地: 国家或地区，例如 日本（可选）

每一天一个二级标题，最后一段是当天的主题（可选）：

## Day N | YYYY-MM-DD | 城市 | 当地时区（IANA，例如 Asia/Tokyo） | 当天主题，例如 抵达与入住

每个行程项一个三级标题：

### [类型] 开始时间-结束时间 标题

- 类型只能是：flight（航班）、lodging（住宿）、spot（景点、餐厅、活动）、transit（市内交通）、note（其他提醒）。
- 时间用 24 小时制 HH:mm，是当地时间；没有明确时间就省略。航班到达在第二天时，结束时间后加 +1，例如 23:30-06:10+1。
- 行程项按当天的先后顺序排列。

行程项下面用「- 键: 值」列出字段，可用的键：
- 地点: 显示名 | 当地语言名
- 地址: 地址 | 当地语言地址
- 终点: 显示名 | 当地语言名（仅 flight 和 transit）
- 导航: 一条完整的导航链接（规则见下）
- 订单: 订单号或确认码
- 预订状态: 已确认 或 待确认（原行程写明了才写）
- 备注: 自由文本
- 备选: 原行程写明的备选方案，例如 天气不好时改去洞爷湖周边（可选）
- 固定: 是（航班、有预约、不能移动的时间才写；否则省略）
- 时间说明: 只知道大概时段时写，例如 早上、傍晚（可选；有明确时间就不要写）
- 其他有用的信息可以用自定义键，例如 航班号、航站楼、退房日期（YYYY-MM-DD）、退房时间、房型、线路。

【导航链接】
flight、lodging、spot、transit 每一项都要写「导航」。{导航规则}
链接模板（把 <…> 换成真实内容，并做 URL 编码）：
{链接规则}
- 链接里的地点文本用「当地语言名 + 当地语言地址」；没有当地语言信息时用显示名 + 地址。
- flight 导航到起点机场；transit 导航到终点，模板支持时再带上起点和出行方式。
- 不要在链接里放坐标，也不要加模板以外的参数。

【规则】
1. 当地语言名和当地语言地址必须用目的地当地的文字书写（日本写日文，韩国写韩文，中国大陆写简体中文，其他地区写当地通用文字），用于导航搜索和给司机看。不确定就省略，不要编造。
2. flight 和 transit：起点写在「地点」，终点写在「终点」。spot 和 lodging 没有写「地点」时，会用标题当地点名。
3. 不要编造订单号、航班号、时间、价格、预订状态、备选方案；原行程没有的信息就省略。
4. 价格、天气、长篇介绍不需要保留，必要时压缩成一句「备注」。

【我的行程】
（把你的行程粘贴在这里）`;

export function buildPrompt(china: NavApp, elsewhere: NavApp): string {
  return TEMPLATE.replace('{导航规则}', navRule(china, elsewhere)).replace('{链接规则}', linkRules(china, elsewhere));
}
