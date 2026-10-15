# 修订需求交付说明（2026-10-15）

对应《旅程 Rundown 产品修改需求报告 V1.0 / 2026.10.14》。按报告推荐顺序拆成 3 个 PR，均已合并部署。

| 步骤 | PR | Commit | 内容 |
|---|---|---|---|
| P0 | #12 | `eb9d63c` | ISSUE-004 多格式导入与 Smart Mapping |
| P1 | #13 | `b53b555` | ISSUE-001 历史旅程卡片 / ISSUE-002 倒计时 / ISSUE-003 Checklist |
| P2 | #14 | `ff3e128` | ISSUE-005 Classic + Winter 主题 |

修订前的基线：`17a7c5f`。

## 修改范围

**数据结构 / 存储**
- `Trip` 新增 3 个可选字段：`participants`（人数）、`theme`（`classic` / `winter`）、`departTime`（出发时刻 HH:mm）。
- 数据库版本、表、索引不变；没有迁移，没有破坏性变更。旧旅程缺这些字段时：人数显示「未设置」，主题按 Classic，出发时刻按 00:00。
- 备份和恢复照常包含这些字段。
- 重新导入时，`theme` 和 `departTime` 保留用户原来的设置；`participants` 以导入内容为准，没写就保留原值。
- 完成状态继续存在 `itemStates`，按旅程 ID + 行程项 key 绑定，Checklist 没有另存一份。

**导入逻辑**（`src/importer/`）
- `mapping.ts`：别名表（Layer 2），供 MD、JSON、CSV 共用。
- `structured.ts`：格式识别、JSON 和 CSV 解析、日期歧义判断。JSON 和 CSV 先整理成标准文本，再交给同一个解析器，保证字段规则一致。
- `corrections.ts`：预览里的人工修正（Layer 3），都是纯函数，只改草稿，不写数据库。
- `templates.ts`：官方 JSON / CSV 模板。
- `parseMd.ts`：
  - 接上别名表。
  - 新增映射报告：未识别字段、待确认项、没能导入的内容。
  - 支持「时间 / Time」字段和「人数」。
  - 认不出的当天字段放进当天备注，不再丢弃。
  - 抽出 `computeErrors`、`rekey` 两个函数，供修正后重新计算。
- 给外部 AI 的提示词新增一行「人数」。

**UI**
- 导入：
  - `PreviewPage`：新增映射摘要、需要你确认、认不出的字段、没能导入的内容、同名旅程的处理选择。
  - `components/MappingReview`：上面这几块的展示组件。
  - `TripsPage`、`PastePage`、`TemplatePage`：入口文案改为支持多格式，模板页可下载 JSON / CSV 模板。
- 旅程列表：`components/TripDeck` + `TripsPage`，包括删除确认。
- 倒计时：`components/Countdown` + `PhaseCard`；`TripSettingsPage` 新增「出发时间」「参与人数」。
- Checklist：`components/Itinerary`（打卡框和已完成分隔）+ `ItineraryPage`。
- 主题：
  - `components/TripTheme`：负责切换 `<html data-theme>`。
  - `tokens.css`：新增 Winter 变量；把散落在组件里的写死色值收成变量，Classic 外观不变。
  - `TripSettingsPage`：新增「外观 → 主题」。
  - 旅程介绍页在 Winter 下雪景照片优先。

## 测试

**自动化**
- `npm test`：116 条，全部通过。新增 `importer.test.ts`（15 条）和 `p1.test.ts`（6 条）。
- `npm run guard` 通过，锁定 48 个文件。
- `npm run build` 通过，Netlify deploy preview 三次都成功。

**浏览器验收**（Playwright + Chromium，脚本都在 `qa/`）

| 验收场景（报告第 9 页） | 脚本 | 结果 |
|---|---|---|
| 历史旅程 1、3、4、7 份：尺寸一致，每组 ≤ 3，前后切换 | `p1_flow.py` | 1280 / 768 / 390 通过 |
| 删除先确认，取消不删，确认只删选中项，刷新后结果正确 | `p1_flow.py` | 通过 |
| 倒计时四个单位：固定时钟逐秒走、跨分钟进位、页面不漂移 | `p1_flow.py` + `p1.test.ts` | 通过；到点归零、缺日期不出现 NaN 由单测覆盖 |
| Checklist：打卡归底、刷新保留、撤销复位、Day 2 不受影响、点卡片仍进详情 | `p1_flow.py` | 通过 |
| MD / JSON / CSV / 粘贴：解析、预览、修正、确认 | `import_flow.py` | 390 / 1280 通过 |
| 字段映射错误能识别、能修正；确认前不写入；同名旅程不被覆盖 | `import_flow.py` | 通过 |
| 北海道和其他旅程切换：Winter / Classic 不串色，不重置状态 | `theme_flow.py` | 1280 / 768 / 390 通过 |
| 桌面、平板、手机：无横向溢出，无报错 | 上面各脚本 + 旅程介绍页检查（含 320） | 通过 |
| 回归 | `e2e.py`、`v2_flow.py` | 通过 |

`e2e.py` 原来检查「距出发 4 天」文案，按新需求改为检查四单位倒计时。

## 已知限制

- **单个证明文件的查看页**（`/doc/...`）没有接主题，始终是 Classic。
- **出发时间**只能在旅程设置里填，导入时不解析起飞时间。原因是 AI 行程里的航班时间常常是抵达时间，自动当作出发时间容易出错。
- **MD 的日期**按「日-月-年」理解，不标歧义，因为提示词已经规定了这个格式。JSON 和 CSV 只有写 YYYY-MM-DD 才算无歧义，其他写法会标出来让你确认。
- **旅程层认不出的字段**只保存在原始文本（`Trip.sourceMd`）里，没有放进任何可见字段；预览里会写明这一点。
- **报告里的可选项**：JSON 导出后再导入的往返测试没有做；模板下载已提供。
- **正式站点**：我这边访问不了 `travelrundown.netlify.app`，只确认了 deploy preview 构建成功；正式站需要你打开后点「有新版本」更新确认。
