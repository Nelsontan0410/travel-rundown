# AGENTS.md — travel-rundown

React 18 + TypeScript + Vite PWA，本地优先（Dexie/IndexedDB），无后端、无 App 内 AI。

## 必读
- `docs/design-reference.md`（设计唯一依据）、`src/styles/tokens.css`
- V1.1 计划：https://claude.ai/code/artifact/d3db5181-4880-4cba-a896-501d98163fb3
- 设计参考里「窗口更宽时内容区最大 430 居中」已废止，由 B 线响应式规格取代；「只做浅色」「不加阴影（浮层除外）和渐变（hero 保护层除外）」继续有效。

## 双线分工（同一仓库）
- A 线（Claude，分支 `feat/v1.1-functional`）：`src/domain src/importer src/db src/store src/hooks src/links src/lib src/__tests__ qa/fixtures`；页面 TSX 只改逻辑；`src/components` 只新增文件。
- B 线（Codex，分支 `feat/v1.1-responsive`）：`src/styles/** *.module.css`；`src/components/*.tsx` 与 `src/features/*Page.tsx` 只改 JSX 结构和 className，不动 hooks/处理函数/props 含义；`qa/shoot.py qa/baseline`；只新增 `docs/responsive.md`；`src/hooks/layout.ts`（新）。

## 通用规则
1. 断点：手机 <768、平板 768–1023、电脑 ≥1024；mobile-first，`min-width`。
2. 只用 tokens.css 变量；不新增颜色/阴影/渐变；仅浅色主题。
3. 不改现有界面文案；不往 package.json 加依赖（需先在 PR 说明理由）。
4. 每个阶段一个 PR，合并前 rebase main；发现对方范围问题写进 PR「给另一条线」。
5. 完成前：`npm run build`、`npm test` 通过；B 线附 390/768/1280 截图。
