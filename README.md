# 旅程 Rundown

把 AI 做好的行程 md 导入，变成出行时直接执行的行程面板：按天展示、一键调出预订证明、一键唤起导航和翻译。

- 纯前端、本地优先的 PWA：数据全部存在设备的 IndexedDB，没有后端。
- 技术：React + TypeScript + Vite、vite-plugin-pwa、Dexie、Zustand、React Router、lucide-react、pdf.js、fflate。
- 设计依据：`docs/design/` 里的两张设计稿，以及「旅程 Rundown — 设计参考 v0.1」和「旅程 Rundown PWA — PRD v0.1」。
- 设计令牌只在 `src/styles/tokens.css`，组件里不写死色值和尺寸。

## 本地开发

```bash
npm install
npm run dev        # 开发
npm test           # md 解析和展示规则的单元测试
npm run build      # 构建到 dist/
npm run preview    # 预览构建结果（Service Worker 在这里生效）
```

## 部署到 Netlify

仓库里已有 `netlify.toml`（构建命令 `npm run build`，发布目录 `dist`，SPA 路由回退）。
在 Netlify 选 **Add new site → Import an existing project → GitHub → travel-rundown**，其余保持默认即可。

## 目录

```
src/
  domain/      types.ts, rules.ts, format.ts, itemKey.ts
  importer/    parseMd.ts, promptTemplate.ts
  db/          schema.ts, repo.ts（含完整备份 zip）
  links/       openLink.ts, linkLabel.ts
  components/  组件库（设计参考「组件库」一节）
  features/    01–06 和导入模板、粘贴、预览页
qa/            视觉验收脚本和示例行程
```

## 测试

- `npm test`：单元测试（解析、差异、准备检查、阶段判定、北海道行程整链）
- `npm run e2e`：端到端冒烟（导入 → 标记 → 加证明 → 导出备份 → 全新环境恢复 → 断网打开），需要 Playwright（Python）
