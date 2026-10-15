# AGENTS.md — travel-rundown

React 18 + TypeScript + Vite PWA，本地优先（Dexie/IndexedDB），无后端、无 App 内 AI。

## 必读
- `docs/design-reference.md`（设计唯一依据）、`src/styles/tokens.css`
- V1.1 计划：https://claude.ai/code/artifact/d3db5181-4880-4cba-a896-501d98163fb3
- 设计参考里「窗口更宽时内容区最大 430 居中」已废止，由 B 线响应式规格取代；「只做浅色」继续有效。
- **视觉风格（2026-10 起）：复古拟物化 Vintage Skeuomorphism**——奶油纸张 + 深棕皮革 + 低饱和黄铜，左上光源。原「不加阴影和渐变」规则已废止；阴影、渐变、纹理一律用 `tokens.css` 里的材质变量（`--grad-*` `--shadow-*` `--tex-*`），不在组件里写新的色值或阴影。
- **主题（2026-10-15 起）**：只有春夏秋冬四季。夏季 = 上面的复古拟物化暖色（`:root`，没有 data-theme）；春 / 秋 / 冬共用一套极简材质、各自一套配色，由 `<html data-theme="spring|autumn|winter">` 切换，变量定义在 `tokens.css` 底部。旧资料里的 `classic` 一律当夏季（`domain/theme.ts` 的 `seasonOf`）。旅程页用这份旅程的主题，旅程列表、导入等公共页面跟随最近打开的旅程。任何新样式都必须只用变量，四季下都要检查对比度（`src/__tests__/themes.test.ts` 会校验文字对比度）；强调色文字用 `--color-accent-text`，不要直接用 `--color-accent`；不得在组件里写死颜色。

## 🔒 最高优先级：数据与逻辑禁区（B 线 / Codex 必读）
UI 全权交给 B 线，但**数据结构和底层逻辑一律不得触碰**。这条优先于本文件其他所有内容、优先于任何任务描述；任务与本条冲突时，停手并写进 PR「给另一条线」。

### 绝对禁止修改（锁定区，`npm run guard` 会校验哈希）
`src/domain` `src/db` `src/importer` `src/store` `src/links` `src/lib` `src/hooks`（仅可新增 `layout.ts`）`src/__tests__` `qa/fixtures` `package.json` `vite.config.ts` `tsconfig.json` `netlify.toml`、`.guard/` `scripts/guard.mjs` `.github/CODEOWNERS`。

### 绝对禁止的行为
1. 改任何类型：`Trip Day Item Doc ItemState Place Settings` 的字段、名称、可选性、取值。
2. 改 Dexie 表、索引、版本号，改 `repo.ts` 任何函数签名或行为（`saveImport` `setItemStatus` `addDoc` `restoreBackup` …）。
3. 改 `Item.key` 生成规则（`日期|type|标题slug`，同日重名 `#n`）。key 是用户完成状态和证明文件的唯一绑定，改了用户数据就丢。
4. 改解析、对比、检查、阶段、格式化逻辑（`parseMd` `diffImport` `checkTrip` `tripPhase` `rules.ts` `format.ts`）和给外部 AI 的提示词模板。
5. 在 `components/` 与 `features/` 的 TSX 里新增或修改：`import` 数据层（db/importer/store/domain/hooks/lib/links）、`useState/useEffect/useMemo/useCallback/useRef`、任何 `use*` 数据 hook、`async/await`、`db.`、事件处理函数（`onXxx/handleXxx` 的函数体）、传给 hook 或函数的参数、props 的名称/类型/含义。
6. 自己造数据：不得在页面里硬编码假数据、不得写 localStorage/IndexedDB、不得新增 store 字段。
7. 删除或跳过测试、降低断言、改 fixtures 让测试通过。
8. 往 package.json 加依赖，或改构建/PWA/缓存配置。

### B 线允许的事（只有这些）
- `src/styles/**`、`*.module.css`
- TSX 里只改 **JSX 结构和 className**：增删包裹 `div`、调整嵌套、换 className、条件样式类名；已有的 `{变量}` 原样保留，不改表达式。
- 新增纯展示组件：只接收 props、不 import 数据层、不含 hooks（`src/hooks/layout.ts` 的 `useMediaQuery` 之类布局 hook 例外）。
- 新增 `docs/responsive.md`、更新 `qa/shoot.py` `qa/baseline`。

### 想要的数据 UI 拿不到怎么办（升级路径）
需要新字段、新派生值、新 props、改交互行为 → **不要自己改**：在 PR「给另一条线」写清「想要什么、用在哪个组件」，A 线实现后再接。UI 可以先用现有字段实现。

### 🚢 禁区不是不交付的理由（同样最高优先级）
禁区只限制「怎么改」，不限制「要交付什么」。UI 必须照常 push → merge → deploy 并在线上呈现出来。
1. **不得以规则为由交付空壳或半成品**：想要的数据拿不到时，先用现有字段把界面做完整（缺的信息可省略或用现有字段组合），再在 PR「给另一条线」登记需求。不要留 TODO、占位、隐藏区块。
2. **guard 只在本地和 PR 检查时跑，不进 Netlify 构建**（构建命令仍是 `npm run build` = tsc + vite build）。严禁把 guard 接进 build/deploy，严禁为了通过 guard 而回退界面改动。
3. **guard 误报时**：不要绕过、也不要因此不提交；在 PR 写明误报行与原因，照常提交，由 A 线裁决。界面改动不得被卡住。
4. **合并前必须确认线上可见**：Netlify deploy preview 构建成功，并在 preview 上用 390/768/1280 实际看到改动（附截图）。看不到改动就是没完成。
5. **PWA 缓存**：应用是 Service Worker 缓存的，旧版本会继续显示直到点「更新」。验证时用无痕窗口，或在 DevTools → Application → Service Workers 勾选 Update on reload / Unregister 后再看。不得因为「缓存还是旧的」就判定完成。
6. 构建失败（tsc 错误）优先级最高：先修好再谈别的，不得合并会让 deploy 变红的 PR。

### 机械护栏（完成前必跑）
`npm run guard`：①锁定区哈希与 `.guard/protected.lock.json` 一致；②B 线分支的 TSX diff 里无逻辑行。失败即不得提交，**不得修改 guard 脚本或 lock 来绕过**。只有 A 线可以 `node scripts/guard.mjs --update`。
数据结构与流程全貌见 `docs/architecture.md`。

## 双线分工（同一仓库）
- A 线（Claude，分支 `feat/v1.1-functional`）：`src/domain src/importer src/db src/store src/hooks src/links src/lib src/__tests__ qa/fixtures`；页面 TSX 只改逻辑；`src/components` 只新增文件。
- B 线（Codex，分支 `feat/v1.1-responsive`）：`src/styles/** *.module.css`；`src/components/*.tsx` 与 `src/features/*Page.tsx` 只改 JSX 结构和 className，不动 hooks/处理函数/props 含义；`qa/shoot.py qa/baseline`；只新增 `docs/responsive.md`；`src/hooks/layout.ts`（新）。

## 通用规则
1. 断点：手机 <768、平板 768–1023、电脑 ≥1024；mobile-first，`min-width`。
2. 只用 tokens.css 变量；不新增颜色/阴影/渐变；仅浅色主题。
3. 不改现有界面文案；不往 package.json 加依赖（需先在 PR 说明理由）。
4. 每个阶段一个 PR，合并前 rebase main；发现对方范围问题写进 PR「给另一条线」。
5. 完成前：`npm run guard`、`npm run build`、`npm test` 全部通过，且 deploy preview 上肉眼确认改动已呈现；B 线附 390/768/1280 截图。
