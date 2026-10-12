# 旅程 Rundown — 设计参考 v0.1（给 Codex）

Oct 9, 2026 · @Jing Quan

本文把两张设计稿拆成可直接写进代码的规格：颜色、字号、间距、组件、六个页面、状态和文案。设计稿是视觉的唯一依据，实现时逐页对照，不要凭感觉发挥。

- **设计稿一**：01 每日行程、02 行程详情、03 预订资料
- **设计稿二**：04 旅程与导入、05 旅程设置、06 证明查看
- **原图位置**：把两张原图放进仓库 `docs/design/`，文件名 `design-01-03.png`、`design-04-06.png`，Codex 开工前先看一遍。
- **尺寸换算**：设计稿里手机框宽 446px，按 390dp 屏宽换算，1dp ≈ 1.14px。本文所有尺寸都是换算后的 dp（CSS px），取 2 的倍数；颜色取自原图像素，误差在 ±4 以内。

&#91;image: 设计稿一：01 每日行程、02 行程详情、03 预订资料\]

&#91;image: 设计稿二：04 旅程与导入、05 旅程设置、06 证明查看\]

## 使用规则

视觉以本文和设计稿为准，功能和数据以 PRD 为准；两者冲突的地方，已在「与 PRD 的差异」一节逐条定了，按那一节执行。

1. **令牌优先**：颜色、字号、间距、圆角、高度只能用「风格与设计令牌」里的 CSS 变量，组件里不准写死十六进制或像素值。
2. **组件优先**：界面只能用「组件库」里的组件拼。需要新组件时先停下来问，不要自己造。
3. **内容来自数据**：设计稿里的北海道、DEMO、温泉酒店只是示例，页面文字全部来自导入的行程数据，不写死。
4. **手机优先**：基准屏宽 390dp。窗口更宽时，内容区最大 430dp 并居中，两侧留白，不拉伸。
5. **只做浅色主题**：V1 不做深色模式。
6. **技术约束**：React + TypeScript + Vite；样式用 CSS 变量加 CSS Modules；图标用 lucide-react；不引入 MUI、Ant Design、Chakra 等 UI 组件库。
7. **设计稿里不实现的东西**：手机外框、外面的浅蓝页面背景、顶部「旅程 Rundown · V1」和「核心页面 · 示例数据」、底部的 01–06 编号、证明里的 DEMO 和「示例」水印、手机底部的横条。
8. **设计稿没有的页面**：按「状态与文案」一节的规则，用现有组件拼，不新增视觉风格。

## 页面流转

三个 Tab 各有一个首页，其余页面都是从它们点进去的子页面。

&#91;embedded content: 页面流转 · 3 个 Tab、6 个页面\]

实线框是设计稿里的六个页面，虚线框是设计稿没有、按「状态与文案」补的流程。01 当前项的「预订证明」、02 的「查看证明」、03 的眼睛按钮，都进 06。05 从 01 的设置图标进入，TabBar 固定显示「旅程」激活。

## 风格与设计令牌

整体风格：白底、一个蓝色主色、细边框卡片、大圆角、没有阴影；状态靠芯片和小色点表达，页面干净、信息密度中等。全站只有一份 `tokens.css`，下面的变量名就是它的内容。

### 颜色

| 变量 | 色值 | 用在哪里 | 来源 |
| --- | --- | --- | --- |
| `--color-primary` | `#0B68F3` | 主按钮、选中的日期格和筛选项、当前项的圆点和竖条、链接和描边按钮的文字与描边、激活的 Tab、蓝色线性图标 | 实测 |
| `--color-primary-soft` | `#E0EEFE` | 蓝色芯片底（已预订、已确认）、证明里的状态条 | 实测 |
| `--color-primary-ink` | `#0A57D6` | 蓝色芯片上的文字 | 推导，比主色略深 |
| `--color-info-bg` | `#E8F2FE` | 说明提示条底（离线说明） | 实测 |
| `--color-tile-bg` | `#ECF4FC` | 图标块底、没有封面时的旅程缩略图底 | 实测 |
| `--color-tag-bg` | `#E6EFF9` | 详情页类型标签底（住宿） | 实测 |
| `--color-success` | `#138245` | 已完成圆点、绿色勾选图标 | 实测 |
| `--color-success-soft` | `#E5F7EC` | 绿色芯片和提示条底（已完成、已保存） | 实测 |
| `--color-success-ink` | `#1E7541` | 绿色文字 | 实测 |
| `--color-warning` | `#FEBA0A` | 警告图标 | 实测 |
| `--color-warning-soft` | `#FEF6DE` | 警告提示条底（未上传证明） | 实测 |
| `--color-warning-ink` | `#DC5A14` | 警告文字、景点门票图标 | 实测 |
| `--color-pdf` | `#EF3E40` | PDF 图标底 | 实测 |
| `--color-text` | `#0F1D3A` | 标题、正文 | 推导：原图最暗像素在 `#000018` 到 `#042044`，抗锯齿会拉暗，取偏中间值 |
| `--color-text-2` | `#64789A` | 副标题、说明、灰色芯片文字 | 实测 |
| `--color-text-3` | `#8392AA` | 更弱的文字（当地时间、占位） | 实测 |
| `--color-icon` | `#5C7094` | 次要线性图标（箭头、复制、未激活 Tab） | 实测 |
| `--color-border` | `#E6ECF3` | 卡片、按钮、日期格、Tab 栏的 1px 描边和分隔线 | 实测 |
| `--color-rail` | `#D6DEE8` | 时间轴竖线 | 实测 |
| `--color-dot-pending` | `#92A6BD` | 待完成项的圆点 | 实测 |
| `--color-neutral-soft` | `#ECF0F4` | 灰色芯片底（待完成、状态待确认） | 实测 |
| `--color-surface` | `#FFFFFF` | 页面和卡片底 | 实测 |
| `--color-surface-muted` | `#F2F4F8` | 行程备注底 | 实测 |
| `--color-surface-subtle` | `#F8FAFC` | 卡片里的文件行底 | 实测 |
| `--color-viewer-bg` | `#DEE3E8` | 证明查看页的灰色背景 | 实测 |

### 字号、间距、圆角、尺寸

```css
:root {
  --font-sans: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;

  /* 字号 / 字重，行高统一 1.4；时间和数字加 font-variant-numeric: tabular-nums */
  --fs-h1: 26px;       --fw-h1: 700;       /* 02 行程项标题 */
  --fs-page: 22px;     --fw-page: 700;     /* 03 页面大标题 */
  --fs-title: 20px;    --fw-title: 700;    /* 旅程名、Day 标题、04 页头标题 */
  --fs-nav: 18px;      --fw-nav: 600;      /* 返回型页头的居中标题 */
  --fs-section: 16px;  --fw-section: 700;  /* 区块标题 */
  --fs-card: 15px;     --fw-card: 600;     /* 卡片标题、大按钮文字 */
  --fs-body: 14px;     --fw-body: 400;     /* 正文、副标题、筛选项 */
  --fs-small: 13px;    --fw-small: 400;    /* 说明、时间、小按钮文字（600） */
  --fs-caption: 12px;  --fw-caption: 500;  /* 芯片、Tab 标签、辅助提示 */

  /* 间距：4 的倍数 */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --page-x: 16px;                      /* 页面左右内边距，所有页面一致 */

  /* 圆角 */
  --radius-sm: 8px;    /* 按钮、芯片、日期格、筛选项、文件行、图标块 */
  --radius-md: 12px;   /* 卡片、封面图、提示条 */
  --radius-full: 999px;/* 圆点、缩放按钮 */

  /* 尺寸 */
  --border-w: 1px;
  --h-header: 56px;    --h-tabbar: 64px;   /* Tab 栏另加 env(safe-area-inset-bottom) */
  --h-btn-lg: 44px;    --h-btn-sm: 32px;
  --h-chip: 24px;      --h-filter: 36px;
  --w-day: 64px;       --h-day: 56px;
  --h-hero: 120px;     --h-row: 44px;      --h-file-row: 40px;
  --size-tile: 40px;   --size-dot: 12px;
  --size-icon: 24px;   --size-icon-sm: 20px;   /* 线性图标，描边 1.75 */
}
```

- **卡片没有阴影**：白底加 1px `--color-border`，仅此而已。弹层可以用一层很淡的阴影，别处不加。
- **没有渐变**：唯一的例外是封面图底部为了托住白字加的半透明深色渐变（`rgba(10, 25, 50, 0.55)` 到透明，约占底部 60%），这是推导值。
- **图标**：全部是线性图标；Tab 栏激活时填充。不用 emoji 当图标。

## 组件库

全站只有下面这些组件。每个组件写一次，各页面复用；规格里的 `--xxx` 都是上一节的令牌。

### 页头与导航

- **AppHeader · 根页面型**（01、04）：高 `--h-header`。左边 Logo 24 加标题（`--fs-title`），右边一个 24 的图标按钮（01 是设置，04 是更多），点击区 44×44。无底边线。
- **AppHeader · 返回型**（02、05、06）：左边 ChevronLeft 24，标题居中（`--fs-nav`），右边可放一个图标按钮或留空。无底边线。
- **AppHeader · 大标题型**（03）：左边标题（`--fs-page`）加一行副标题（`--fs-body`、`--color-text-2`），右边一个文字按钮（Plus 图标加文字，`--color-primary`）。
- **TabBar**：三项等宽，旅程（Home）、行程（CalendarDays）、资料（FileText）。高 `--h-tabbar` 加底部安全区，白底，顶部 1px `--color-border`。图标 24，标签 `--fs-caption`。激活项：`--color-primary`、图标填充、标签字重 600；未激活：`--color-icon`。
- **Logo**：两座连续山峰的折线加一条底线，`--color-primary` 描边，24×24，自绘 SVG。

### 列表与卡片

- **HeroCover**（01）：左右 `--page-x`，高 `--h-hero`，`--radius-md`，封面图 cover 铺满，底部加深色渐变托住白字。左下是日期范围（14、600、白字），右下是绿色 StatusChip「行程已离线保存」。没有封面时底色用 `--color-tile-bg`，中间放 40 的山峰图标（主色，40% 不透明度），日期文字改用 `--color-text`。
- **DayTile**（01）：64×56，`--radius-sm`。上面日期数字（18、700），下面月份（12）。选中：`--color-primary` 底、白字；未选：白底、1px `--color-border`、数字 `--color-text`、月份 `--color-text-2`。横向滚动，隐藏滚动条，格间距 8，左右 `--page-x`。
- **TimelineRow**（01）：三列，左列 48 放时间（13、600，tabular-nums，右对齐），中列 12 放圆点和竖线，右列放 ItemCard，列间距 8。圆点 `--size-dot`：已完成 `--color-success`，当前项 `--color-primary`，其余 `--color-dot-pending`。竖线 2px `--color-rail`，穿过所有圆点，首尾各留半截。行与行间距 8。
- **ItemCard**（01）：白底、1px `--color-border`、`--radius-md`、内边距 12、最小高 64。左边类型图标 24（`--color-primary`，景点门票用 `--color-warning-ink`），间距 12，中间标题（`--fs-card`，最多 2 行）和副标题（`--fs-small`、`--color-text-2`，单行省略），右边是「右侧槽」加 ChevronRight 20（`--color-icon`）。点整张卡进 02。
  - **当前项变体**：左侧贴边 4 宽的 `--color-primary` 竖条，卡片下方多一行操作按钮（小号描边按钮，间距 8，按钮靠左）。
- **BookingCard**（02、03）：白底、1px `--color-border`、`--radius-md`、内边距 12，内部各行间距 8。第一行：IconTile 加标题（`--fs-card`）、副标题（`--fs-small`、`--color-text-2`），右上是 StatusChip。第二行：「预订编号」（`--fs-small`、`--color-text-2`）加编号（`--fs-small`、500，`--color-surface-muted` 底、圆角 6、内边距 2×8）加 Copy 图标 20。第三行起：FileRow；没有证明时换成警告 InfoBanner。
- **IconTile**：`--size-tile` 见方，`--radius-sm`，`--color-tile-bg` 底，图标 24 用 `--color-primary`。门票类型用 `--color-warning-soft` 底和 `--color-warning-ink` 图标。
- **LocationCard**（02）：白底、1px `--color-border`、`--radius-md`、内边距 14 16。左边 MapPin 24（`--color-primary`），中间三行：名称（`--fs-card`）、当地语言名（`--fs-small`、`--color-text-2`）、地址或城市（`--fs-small`、`--color-text-2`）。右边是 Copy 图标 24 加下方「复制地点」（`--fs-caption`、`--color-text-2`），整块是一个按钮。
- **TripCard · 大**（04）：白底、1px `--color-border`、`--radius-md`，上面封面图高 76（铺满，无圆角，随卡片裁切），下面内边距 12。第一行是旅程名（`--fs-section`）和右边绿色 StatusChip「已保存到本机」；第二行日期（`--fs-body`、`--color-text-2`）；第三行「N 天 · 目的地」（`--fs-small`、`--color-text-3`），右下是小号描边按钮「查看行程」加 ChevronRight 16。
- **TripCard · 紧凑**（04）：同样的边框和圆角，高 72，左边 56 见方的 IconTile（Building2 图标，`--color-tile-bg` 底），中间旅程名（`--fs-card`）、日期（`--fs-small`、`--color-text-2`）、天数（`--fs-small`、`--color-text-3`），右边 ChevronRight。整张卡可点。没有封面图的旅程一律用这个变体。
- **SettingsGroup**（05）：区块标题（`--fs-section`）加一张白底卡片（1px `--color-border`、`--radius-md`），卡片内是若干 Row，Row 之间 1px 分隔线。组下方可跟一行说明（`--fs-caption`、`--color-text-2`）。
  - **SettingsRow**：高 `--h-row`，内边距 0 12。左边图标 24（`--color-primary`），间距 12，标签（`--fs-body`、500），右边值（`--fs-body`、`--color-text-2`）加 ChevronRight 20。
  - **ReadinessRow**：同样的行，但右边是绿色的勾圆图标 20 加绿色文字（`--color-success-ink`），没有箭头。
- **SectionTitle**：`--fs-section`，上间距 24，下间距 8。
- **NoteBox**（02）：`--color-surface-muted` 底，`--radius-sm`，内边距 10 12，文字 `--fs-body`、`--color-text-2`。

### 按钮、芯片与提示条

- **Button**：字重 600，`--radius-sm`，图标 20（小号 16）放在文字左边，间距 8。
  - 大号 `--h-btn-lg`，字号 `--fs-card`；小号 `--h-btn-sm`，字号 `--fs-small`，左右内边距 12。
  - **primary**：`--color-primary` 底、白字。
  - **outline**：白底、1px `--color-primary` 描边、`--color-primary` 文字。
  - **link**：无框，`--color-primary` 文字，右边 ChevronRight 16。
  - 禁用状态：整体 40% 不透明度。
- **IconButton**：36×36，`--radius-full`，1px `--color-border`，图标 20（`--color-primary`），用于 03 的「查看」（Eye）。
- **StatusChip**：高 `--h-chip`，内边距 0 8，`--radius-sm`，`--fs-caption`。变体：success（`--color-success-soft` 底、`--color-success-ink` 字、左边 14 的勾圆图标）、info（`--color-primary-soft` 底、`--color-primary-ink` 字）、neutral（`--color-neutral-soft` 底、`--color-text-2` 字）。
- **FilterChips**（03）：四个等宽，高 `--h-filter`，间距 8，`--radius-sm`，字号 `--fs-body`。选中：`--color-primary` 底、白字、600；未选：白底、1px `--color-border`、`--color-text`。
- **InfoBanner**：最小高 40，`--radius-md`，内边距 8 12，图标 20，间距 8。
  - **success**：`--color-success-soft` 底、勾圆图标、`--color-success-ink` 文字。
  - **info**：`--color-info-bg` 底、Info 图标（`--color-icon`）、`--fs-small`、`--color-text-2` 文字。
  - **warning**：`--color-warning-soft` 底、实心 AlertCircle（`--color-warning`）、`--color-warning-ink` 文字（600），右边可放小号描边按钮。
- **ActionBar**（02）：固定在 TabBar 上方，白底，顶部 1px `--color-border`，内边距 8 `--page-x`，里面是并排的大号按钮，间距 8。

### 证明

- **FileRow**：高 `--h-file-row`，`--color-surface-subtle` 底、1px `--color-border`、`--radius-sm`，内边距 0 8。左边文件图标 20（PDF 用 `--color-pdf` 底、白色 7 号粗体「PDF」；图片用 24×24 缩略图，圆角 4），文件名（`--fs-small`、500，单行省略），右边绿色 StatusChip「已保存」。03 里行右侧另有一个 IconButton（Eye），与行间距 8。
- **DocViewer**（06）：整块 `--color-viewer-bg`，证明页居中，白底，四周留 16。底部悬浮缩放条：`--color-surface-subtle` 底、`--radius-full`、高 40，里面是减号按钮、百分比（`--fs-small`）、加号按钮（28 的圆形描边按钮，图标 `--color-primary`）；缩放条右侧是页码「1 / 1」（`--fs-small`、`--color-text-2`）。图片支持双指缩放。

### 图标对照

| 用在 | lucide-react 图标 |
| --- | --- |
| 行程项类型：航班、交通、住宿、餐饮、景点门票、景点、备注 | `Plane`、`Car`（线路是地铁、电车类时用 `TrainFront`）、`Building2`、`Utensils`、`Ticket`、`MapPin`、`StickyNote` |
| 页头与导航：设置、更多、返回、箭头 | `Settings`、`MoreHorizontal`、`ChevronLeft`、`ChevronRight` |
| 动作：导航、翻译、复制、添加 | `Navigation`、`Languages`、`Copy`、`Plus` |
| 证明与文件：预订证明、查看、下载、上传、附件 | `FileText`、`Eye`、`Download`、`Upload`、`Paperclip`；04 导入卡片的大图标用 `FileUp` |
| 状态：完成、警告、说明 | `CheckCircle2`、`AlertCircle`（实心）、`Info` |
| 其他：恢复备份、翻译语言、删除 | `RotateCcw`、`Globe`、`Trash2` |
| 添加证明弹层：拍照、相册、文件 | `Camera`、`Image`、`FileUp` |
| 没有封面时的占位 | `Mountain`（01 封面）、`Building2`（04 紧凑卡、05 缩略图） |
| Tab：旅程、行程、资料 | `Home`、`CalendarDays`、`FileText` |

lucide-react 新版本给部分图标改了名（例如 `CheckCircle2` 现名 `CircleCheck`，`AlertCircle` 现名 `CircleAlert`，`MoreHorizontal` 现名 `Ellipsis`），旧名作为别名仍可用。以项目里装的版本实际导出的名字为准，不要因为改名换成别的图标。

## 页面规格（一）：01 到 03

每个页面按从上到下的顺序写。「数据绑定」一节列出了每个元素取哪个字段。

### 01 每日行程（行程 Tab 的首页）

进入方式：点 TabBar「行程」，或在 04 点「查看行程」。打开的是最近一次看的旅程；没有任何旅程时显示空状态。

1. **AppHeader 根页面型**：Logo、旅程名、设置图标（进 05）。
2. **HeroCover**：左下日期范围，格式 `2027.01.13 — 01.22`。右下的绿色芯片「行程已离线保存」，只在 05 的「离线准备」三项全绿时才显示。
3. **DayTile 横排**：每天一格。进入页面时默认选中今天（用各 `Day.tz` 算出当地日期，匹配 `Day.date`）；今天不在行程期内就选第 1 天；选中格自动滚动到可见位置。
4. **Day 标题行**：「Day 1 · 抵达与入住」（`--fs-title`）。没有主题时写「Day 1 · 城市名」。下面一行「1月13日 · 当地时间 UTC+9」（`--fs-body`、`--color-text-3`）。设计稿写的是 JST，浏览器拿不到时区简称，所以统一写 UTC 偏移。
5. **时间轴**：每个行程项一个 TimelineRow，规格见组件库，规则如下。
   - **当前项**：只在选中「今天」时才有，定义为开始时间不晚于现在的最后一项（时间按 `Day.tz` 比较）；现在还没到第一项时，当前项是第一个待完成项。选中其他天时没有当前项。这条是推导的，设计稿只是画出了高亮效果。
   - **没有开始时间的项**：左列留空，圆点和竖线照常。
   - **右侧槽**，从上到下命中一条就停：已完成 → success 芯片「已完成」；已跳过 → neutral 芯片「已跳过」；有预订（有订单号或有证明）→ info 芯片「已预订」；待完成且有导航链接 → 小号描边按钮「导航」；其余 → neutral 芯片「待完成」。
   - **当前项的操作行**：有证明就放小号描边按钮「预订证明」（FileText），有导航链接就放「导航」（Navigation），都没有就不显示这一行。「预订证明」进 06，「导航」打开 `navUrl`。
   - **副标题**：优先写 `place.localName`；交通项写「交通 · 」加终点名；都没有就写「备注: 」加备注。
   - **类型图标**：flight 用 Plane；lodging 用 Building2；transit 用 Car，线路含「地铁、电车、JR、铁路」时用 TrainFront；spot 标题含「餐、饭、食、咖啡、酒吧、居酒屋」时用 Utensils，否则用 MapPin；note 用 StickyNote。
6. **TabBar**：「行程」激活。

### 02 行程详情（行程 Tab，从 01 点进）

1. **AppHeader 返回型**：标题「行程详情」，右上「更多」菜单里放「改为待完成」和「复制全部文字」。
2. **类型标签**：高 28 的小标签，`--color-tag-bg` 底、`--radius-sm`，图标 20 加文字（`--fs-body`、`--color-text-2`），文字是航班、住宿、景点、交通、备注之一。
3. **标题**：`--fs-h1`，最多 2 行。
4. **元信息行**：左边「1月13日 15:00 · UTC+9」，有结束时间时写「15:00–17:00」，没有时间时只写日期；右边是状态芯片（待完成 neutral、已完成 success、已跳过 neutral）。
5. **LocationCard**：有 `place` 时显示。航班和交通项有 `toPlace` 时，下面再放一张终点卡（间距 8），设计稿里没有这张，是新增的。
6. **按钮行**：「打开导航」（primary、大号、Navigation 图标）加「打开翻译」（outline、大号、Languages 图标），两个按钮等宽，间距 8。按钮行下面右对齐一行说明「复制文字后，在翻译工具中粘贴」（`--fs-caption`、`--color-text-2`）。没有 `navUrl` 时隐藏导航按钮，翻译按钮占满整行。
7. **关联预订**：有订单号或证明时才显示。SectionTitle 加 BookingCard（没有订单号就省略编号行），卡片下面一个大号 outline 按钮「查看证明」（FileText），进 06；有多个证明时，进的是第一个，其余通过各自的 FileRow 进入。
8. **行程备注**：有备注时才显示。SectionTitle 加 NoteBox。
9. **详细信息**：有 `meta` 时才显示，设计稿里没有，是新增的。SectionTitle 加一张白底卡片，每行左边键（`--fs-body`、`--color-text-2`）、右边值（`--fs-body`、`--color-text`），行间 1px 分隔线。
10. **ActionBar**：待完成时是「标记完成」（primary、大号、CheckCircle2 图标，占满剩余宽度）加「跳过」（outline、大号、固定宽 112）；已完成或已跳过时只有一个「改为待完成」（outline、占满）。点了之后留在本页，芯片同步变化，不自动返回。
11. **TabBar**：「行程」激活。

### 03 预订资料（资料 Tab）

1. **AppHeader 大标题型**：标题「预订资料」，副标题是旅程名，右上「添加」。
2. **FilterChips**：全部、机票、酒店、景点，分别对应全部、flight、lodging、spot。
3. **成功 InfoBanner**「已保存附件可离线查看」：至少有一个附件、并且全部附件都已存进本机时才显示。
4. **BookingCard 列表**，间距 8，按日期加开始时间升序。出现在这里的行程项：flight 和 lodging 全部都有，spot 只有「有订单号或有证明」的才有。每张卡：
   - **IconTile**：Plane、Building2；spot 用 Ticket，配警告色。
   - **标题**：行程项标题；有 `meta` 里的「房型」时，写成「标题 · 房型」。
   - **副标题**：flight 写「1月13日 · 11:30 到达」，没有结束时间就写「出发」；lodging 写「入住日 — 退房日」，退房日取 `meta` 里的「退房日期」，没有就只写入住日；spot 写「日期 · 开始时间」，没有时间写「时间待定」。
   - **右上 StatusChip**：已确认（info）或状态待确认（neutral），取值规则见「状态与文案」。
   - **预订编号行**：有订单号时显示。
   - **证明**：每个证明一行 FileRow，右边是 Eye 的 IconButton，进 06。没有证明时，换成警告 InfoBanner「未上传证明」，右边小号描边按钮「上传文件」。
5. **未关联的证明**：没有绑定到任何行程项的证明，放在列表最顶上的一个分组里，分组名「未关联」。卡片变体：IconTile 用 FileText，标题是文件名，下面一个小号描边按钮「关联到行程项」。设计稿里没有，是新增的。
6. **列表末尾**：Info 图标加「PDF / JPG / PNG · 单份不超过 20 MiB」（`--fs-caption`、`--color-text-2`）。
7. **TabBar**：「资料」激活。

## 页面规格（二）：04 到 06

### 04 旅程与导入（旅程 Tab 的首页）

1. **AppHeader 根页面型**：Logo、「我的旅程」，右上「更多」菜单里放「获取导入模板」和「关于」。
2. **导入卡片**：白底、1px `--color-border`、`--radius-md`、内边距 16，内容居中，各行间距 8。
   - 上传图标（带向上箭头的文件，48，`--color-primary`）。
   - 标题「把行程带进来」（`--fs-section`），下面「导入 AI 已整理好的 Markdown 行程」（`--fs-body`、`--color-text-2`）。
   - 大号 primary 按钮「导入 MD 文件」，满宽，打开系统文件选择器（`.md`、`.txt`）。
   - 大号 outline 按钮「粘贴行程文字」，满宽，进入粘贴页。
   - link 按钮「获取导入模板」，进入模板页，页面见「状态与文案」。
3. **已导入旅程**：SectionTitle 加 TripCard 列表，间距 8。有封面的旅程用大卡片，没有封面的用紧凑卡片。排序：没结束的旅程按开始日期升序排前面，已结束的按开始日期降序排后面。一个旅程都没有时，整段不显示，改显示空状态。
4. **恢复备份**：列表末尾一个满宽大号 outline 按钮「恢复备份」（RotateCcw），打开文件选择器。
5. **TabBar**：「旅程」激活。

### 05 旅程设置（从 01 的设置图标进入）

05 是压在当前页面上的子页面，TabBar 固定显示「旅程」激活（设计稿如此），返回回到来源页。

1. **AppHeader 返回型**：标题「旅程设置」。
2. **旅程摘要**：左边 56×56 缩略图（`--radius-sm`，有封面用封面，没有用 `--color-tile-bg` 加 Building2），右边旅程名（`--fs-section`）、日期范围（`--fs-small`、`--color-text-2`）、「N 天 · 目的地」（`--fs-small`、`--color-text-2`）。
3. **外部工具**（SettingsGroup）：
   - **导航工具**（Navigation）：值是这个旅程里导航链接实际用到的 App，从链接域名认出来（`google.com/maps` 是 Google Maps，`amap.com` 是高德地图，`maps.apple.com` 是 Apple Maps），用了多个时用顿号连起来。只读，没有箭头。
   - **翻译工具**（Languages）：值是「Google Translate」。V1 只读，没有箭头。
   - **翻译语言**（Globe）：值是「自动识别 → 中文」，有箭头，点开底部弹层选目标语言（中文、English、日本語、한국어），源语言固定自动识别。
   - 组下说明：「导航和翻译将在外部应用或网页中打开。」
4. **离线准备**（SettingsGroup，三行 ReadinessRow）：应用页面（FileText）、行程资料（CalendarDays）、附件文件（Paperclip）。
   - 正常：应用页面「可离线打开」、行程资料「已保存」、附件文件「N / N 已保存」，都是绿色。
   - 异常：应用页面还在缓存时写「准备中」（灰）；附件没存全时写「1 / 2 已保存」，文字和图标改用 `--color-warning-ink`、实心 AlertCircle。
   - 组下一条 info InfoBanner：「仅已保存的资料可离线查看；外部工具需按其自身条件使用。」
5. **备份与恢复**：区块标题，下面一张卡片，里面是满宽大号 outline 按钮「导出完整备份」（Download）、居中的 link 按钮「恢复备份」，卡片下说明「备份包含行程、预订证明和完成状态。」
6. **管理**（设计稿里没有，新增）：一个 SettingsGroup，两行 SettingsRow：「重新导入行程」（Upload，进入粘贴页，覆盖行程但保留完成状态和证明）；「删除这个旅程」（Trash2，文字用 `--color-warning-ink`，点了弹确认框）。
7. **TabBar**：「旅程」激活。

### 06 证明查看（全屏，没有 TabBar）

从 01 的「预订证明」、02 的「查看证明」、03 的 Eye 按钮进入。

1. **AppHeader 返回型**：标题「预订证明」，右上 Download 图标，和底部「下载原文件」是同一个动作。
2. **FileRow**：满宽（左右 `--page-x`），文件图标、文件名、绿色「已保存」芯片。
3. **DocViewer**：占满剩余高度。PDF 用 pdf.js 画成 canvas，多页时竖向滚动，页码显示「当前页 / 总页数」；图片直接显示，支持双指缩放。缩放条的减号和加号每次变化 25%，范围 50% 到 300%。
4. **底部按钮区**：左右 `--page-x`，距底部安全区 8，两个大号按钮并排，间距 8：「下载原文件」（primary、Download）和「复制预订编号」（outline、Copy）。没有订单号时隐藏后者，前者占满。
5. **文件缺失时**：DocViewer 里显示居中的灰色说明「文件已不在本机，请重新上传」和一个小号 outline 按钮「重新上传」。
6. **没有 TabBar**。

## 状态与文案

### 状态芯片对照

| 文案 | 变体 | 出现位置 | 什么时候出现 |
| --- | --- | --- | --- |
| 已完成 | success | 01 右侧槽、02 元信息行 | 行程项状态是 done |
| 已跳过 | neutral | 01 右侧槽、02 元信息行 | 行程项状态是 skipped |
| 已预订 | info | 01 右侧槽 | 状态是待完成，且有订单号或有证明 |
| 待完成 | neutral | 01 右侧槽、02 元信息行 | 状态是待完成，且不满足上面的任何一条 |
| 已确认 | info | 02、03 的预订卡 | 预订状态是 confirmed |
| 状态待确认 | neutral | 02、03 的预订卡 | 预订状态是 pending |
| 已保存 | success | 所有 FileRow | 文件本体已写入本机 |
| 已保存到本机 | success | 04 的大 TripCard | 旅程已写入本机（导入成功后一直显示） |
| 行程已离线保存 | success | 01 的封面图 | 05 的「离线准备」三项全绿 |

**预订状态怎么定**：导入的 md 里写了「预订状态」就用它；没写时，有证明算已确认，没有证明算状态待确认。这是推导的规则，设计稿里的门票「状态待确认」就是没有证明时的样子。

### 文案和格式规则

- 全部简体中文。按钮用动词短语，例如「标记完成」，不写「完成」。
- 日期写「1月13日」；范围写「2027.01.13 — 01.22」，跨年时两边都写全年份；时间用 24 小时制「15:00」。
- 当地时间写「当地时间 UTC+9」。「N天」中间不加空格，例如「10天 · 日本」。
- 分隔符是「 · 」（两侧各一个空格），范围连接符是「 — 」。
- 复制成功后底部弹出 2 秒的 Toast「已复制」。Toast 是整个应用里唯一的深色元素：`--color-text` 底、白字、`--radius-sm`、内边距 8 16，位于 TabBar 上方 16。
- 链接打不开时，Toast 提示「无法打开链接，已复制地点」，同时把地点文字复制到剪贴板。

### 设计稿没有的页面和状态

这些页面只用组件库里的组件拼，不新增视觉风格。

1. **导入模板页**（从 04 的「获取导入模板」或「更多」进入）：返回型页头「导入模板」；一段说明「把下面的提示词连同你的行程发给任意 AI，再把它回复的 Markdown 粘贴回来」（`--fs-body`、`--color-text-2`）；一个 SettingsGroup「导航偏好」，两行「中国大陆」「其他地区」，值是所选 App，点开底部弹层在高德地图、Google Maps、Apple Maps 中单选（「其他地区」默认 Google Maps、「中国大陆」默认高德地图）；一个 NoteBox 展示提示词全文（等宽字体 12，最大高度 240，可滚动）；底部固定一个满宽大号 primary 按钮「复制提示词」（Copy）。提示词全文以 PRD 为准，按所选偏好自动填入链接规则。
2. **粘贴页**（04 的「粘贴行程文字」、05 的「重新导入行程」）：返回型页头「粘贴行程」；一个多行文本框（1px `--color-border`、`--radius-md`、最小高 240、等宽字体 13，占位文字「把 AI 回复的 Markdown 粘贴到这里」）；底部固定大号 primary 按钮「解析并预览」，文本框为空时禁用。
3. **导入预览页**：返回型页头「导入预览」；一个摘要卡片（旅程名、日期范围、天数、行程项数，每行一个 SettingsRow 样式的键值）；有提示时下面一个 warning InfoBanner「N 条提示」，点开展开列表；解析不出任何行程项时只显示 warning InfoBanner「没有识别到任何行程项，请检查格式」；底部 ActionBar 放「确认导入」（primary）和「返回修改」（outline）。
4. **添加证明弹层**（03 的「添加」、02 和 03 的「上传文件」）：底部弹层，白底、顶部圆角 16、内边距 16，顶部一条 36×4 的抓手条（`--color-border`）。第一步标题「添加预订证明」（`--fs-section`）加三行 SettingsRow：拍照（Camera）、从相册选择（Image）、从文件选择（FileUp）。第二步是 FileRow 预览、类型单选（样式同 FilterChips：机票、酒店、景点、其他）、一行「关联行程项」SettingsRow（点开多选列表，可以不选）、大号 primary 按钮「保存」。超过 20 MiB 时显示 warning InfoBanner「文件超过 20 MiB，请压缩后再添加」。
5. **空状态**：居中，Logo 48（`--color-text-3`）、一行标题（`--fs-card`）、一行说明（`--fs-body`、`--color-text-2`），可带一个 link 按钮。01 没有旅程：「还没有旅程」「先到「旅程」页导入一份行程」，按钮「去导入」。03 没有资料：「还没有预订资料」「点右上角「添加」，或在行程详情里上传」。01 某一天没有行程项：只显示一行居中的「这一天还没有安排」。
6. **删除确认框**：居中对话框，白底、`--radius-md`、内边距 20、最大宽 320，遮罩 `rgba(15, 29, 58, 0.4)`。标题「删除这个旅程？」，说明「行程、证明文件和完成状态都会从本机删除，无法恢复。建议先导出备份。」，两个按钮并排：「取消」（outline）和「删除」（`--color-warning-ink` 底、白字）。
7. **菜单**：04 和 02 的「更多」都弹出白底、1px `--color-border`、`--radius-md` 的小菜单，每项高 44、内边距 0 16、`--fs-body`。

## 数据绑定

界面里每个会变的文字，都从下面的字段来。字段名以 PRD 的数据结构为准，带「新增」的是设计稿要求、PRD 里还没有的。

| 页面 | 界面元素 | 字段 |
| --- | --- | --- |
| 01、04 | 旅程名 | `Trip.title` |
| 01、04、05 | 日期范围 | `Trip.startDate`、`Trip.endDate` |
| 01 | 封面图 | `Trip.coverBlobKey`（新增，可空） |
| 01 | 日期格 | `Day.date`、`Day.index` |
| 01 | Day 标题的主题 | `Day.title`（新增，可空，没有时用 `Day.city`） |
| 01 | 当地时间偏移 | 由 `Day.tz` 用 `Intl.DateTimeFormat` 算出 |
| 01、02 | 时间 | `Item.start`、`Item.end`、`Item.endDayOffset` |
| 01、02、03 | 标题、副标题、类型 | `Item.title`、`Item.place.localName`、`Item.toPlace`、`Item.note`、`Item.type` |
| 01、02、03 | 完成状态 | `ItemState.status`（以 `Item.key` 关联） |
| 01、02 | 导航按钮 | `Item.navUrl`，没有就不显示 |
| 02 | 地点卡片 | `Item.place`，终点卡片 `Item.toPlace` |
| 02 | 复制地点 | `place.localName` 加 `place.localAddress`；没有就用 `name` 加 `address` |
| 02 | 详细信息 | `Item.meta` |
| 02、03 | 订单号 | `Item.bookingRef` |
| 02、03 | 预订状态芯片 | `Item.bookingStatus`（新增，可空），规则见「状态与文案」 |
| 02、03、06 | 证明文件 | `Doc`，按 `Doc.itemKeys` 包含 `Item.key` 取 |
| 03、06 | 文件名、已保存 | `Doc.title`、`Doc.blobKey` 对应的文件是否存在 |
| 04 | 目的地 | `Trip.destination`（新增，可空） |
| 04 | 天数 | `Trip.endDate` 减 `Trip.startDate` 加 1 |
| 05 | 导航工具 | 从所有 `Item.navUrl` 的域名认出 |
| 05 | 翻译工具、翻译语言 | `Trip.translate`（新增） |
| 05 | 离线准备 | 应用壳缓存状态、`Trip` 是否在本机、`Doc` 文件数与应有数 |

### 对 PRD 数据结构的新增

```ts
interface Trip {
  // ……PRD 里已有的字段不变
  destination?: string;          // 「日本」，来自 md 的「目的地」
  coverBlobKey?: string;         // 封面图，用户在 05 上传，存 IndexedDB
  translate: {                   // 默认 { app: 'google-translate', from: 'auto', to: 'zh-CN' }
    app: 'google-translate';
    from: 'auto';
    to: 'zh-CN' | 'en' | 'ja' | 'ko';
  };
}

interface Day {
  // ……PRD 里已有的字段不变
  title?: string;                // 「抵达与入住」，来自 Day 标题的第 5 段
}

interface Item {
  // ……PRD 里已有的字段不变
  bookingStatus?: 'confirmed' | 'pending';   // 来自 md 的「预订状态」
}
```

对应的 md 格式有三处新增，都是可选的：Trip 信息里加 `- 目的地: 日本`；Day 标题末尾加第 5 段主题，`## Day 1 | 2027-01-13 | 登别 | Asia/Tokyo | 抵达与入住`；行程项里加 `- 预订状态: 已确认` 或 `待确认`。解析器、转换提示词、PRD 的 md 示例要一起改。

封面图的来源：V1 不联网找图，用户在 05 的旅程摘要里点缩略图，从相册选一张。

## 与 PRD 的差异

设计稿比 PRD 更具体，有 12 处两边对不上。统一原则：视觉和页面结构听设计稿，数据和逻辑听 PRD，下面是逐条的决定。PRD 要同步修改的地方也标出来了。

| 项目 | PRD 里的做法 | 设计稿里的样子 | 本文的决定 |
| --- | --- | --- | --- |
| Tab | 今日、行程、证明、设置，共四个 | 旅程、行程、资料，共三个 | 用设计稿。「今日」并入 01，默认选中今天；「设置」拆成 04 的导入入口和每个旅程一份的 05；「证明」改名「资料」 |
| 「下一项」卡片 | 今日页顶部有 | 没有，时间轴上高亮当前项 | 用设计稿，取消「下一项」卡片 |
| 翻译入口 | 所有页面右下角悬浮按钮 | 02 的「打开翻译」和 05 的翻译工具，没有悬浮按钮 | 用设计稿，取消悬浮按钮。翻译链接是 `https://translate.google.com/?sl=auto&tl=<目标语言>&op=translate`，不带文本，用户复制后自己粘贴 |
| 翻译设置 | 全局一份 `translateUrl` | 每个旅程一份，含翻译语言 | 用设计稿，存进 `Trip.translate`，PRD 的 `Settings.translateUrl` 删掉 |
| 导航偏好 | 在导入窗口里选，存进设置 | 05 有「导航工具」一行 | 偏好只在导入模板页选；05 的导航工具只读，显示链接实际用到的 App |
| 导入入口 | 一个导入窗口，三步走 | 04 上三个入口：导入 MD 文件、粘贴行程文字、获取导入模板 | 用设计稿的三个入口，解析和预览流程不变 |
| 备份 | V1 只含行程和完成状态 | 「导出完整备份」包含预订证明 | 用设计稿：一个文件，含行程、完成状态和证明文件，建议用 zip（fflate）。PRD 把「含证明文件的完整备份」从「后续」挪进 V1 |
| md 格式 | 没有目的地、Day 主题、预订状态 | 都要显示 | 加三个可选项，见「数据绑定」；PRD 的 md 示例、提示词、解析流程要同步改 |
| 封面图 | 没有 | 01、04、05 都有 | 新增 `Trip.coverBlobKey`，用户自己选图；没有封面时用占位样式 |
| 附件大小 | 图片压缩到长边 2000px，PDF 原样 | 单份不超过 20 MiB | 两条都留：图片先压缩，压缩后或 PDF 本身仍超过 20 MiB 就拒绝 |
| 时区简称 | 没有规定 | 「当地时间 JST」 | 统一写 UTC 偏移，例如 UTC+9 |
| 看证明 | 全屏查看 | 06 带缩放条和页码 | 用设计稿；PDF 用 pdf.js 渲染，worker 要打包进应用，保证离线可用 |

### 设计稿自身的不一致与处理

- **01 高亮的是 15:00，不是第一个待完成的 13:00**：画的是「现在已过 15:00」的情形，按当前项规则实现，13:00 那项仍是待完成，圆点保持灰色。
- **「已保存」「已保存到本机」「行程已离线保存」三种说法**：各有各的位置，见状态芯片对照，不要合并成一种。
- **05 的 TabBar 激活「旅程」，入口却在 01**：照设计稿，05 固定「旅程」激活。
- **04 的大卡片有「查看行程」按钮，紧凑卡片没有**：紧凑卡片整张可点，行为一样。
- **03 的门票有订单号却显示「状态待确认」**：说明预订状态独立于订单号，所以才单独加 `bookingStatus`。
- **设计稿里的封面照片、证明里的 DEMO 内容都是示例**：不要当成要内置的素材。

## 禁止事项与验收清单

### 禁止事项

- 不新增颜色、字号、圆角、间距；不在组件里写死色值和像素值。
- 不给卡片加阴影，不加渐变（封面图托字的那一层除外），除页面切换和弹层的 200ms 淡入或上滑外，不加任何动画。
- 不用 emoji 当图标，不加设计稿以外的插画和背景图。
- 不引入 UI 组件库，不做深色模式，不做登录页、应用锁、云同步、分享。
- 不改文案，不顺手「优化」布局；觉得设计稿有问题时，在 PR 描述里写出来，不要直接改。
- 不实现设计稿里的展示用元素（见「使用规则」第 7 条）。
- 不写死示例数据到页面里；示例旅程只能放在测试夹具里。

### 验收清单

每做完一页，用 390×844 的视口对着设计稿检查：

- [ ] 全站只有一份 `tokens.css`，组件样式里搜不到十六进制色值和 `px` 以外的硬编码尺寸。
- [ ] 01：封面、日期格、Day 标题、时间轴的圆点颜色（绿、蓝、灰）和竖线都和设计稿一致；当前项有左侧蓝条和操作行。
- [ ] 01：右侧槽五种情形（已完成、已跳过、已预订、导航按钮、待完成）各有一条测试。
- [ ] 02：类型标签、标题、元信息行、地点卡片、两个并排按钮、关联预订、备注、底部操作栏齐全，没有导航链接时布局不乱。
- [ ] 03：筛选项、绿色提示条、预订卡片三种情形（有证明、没有证明、状态待确认）都能出现。
- [ ] 04：导入卡片、大小两种旅程卡片、恢复备份按钮；没有旅程时显示空状态。
- [ ] 05：外部工具、离线准备、备份与恢复三组都在；离线准备的正常和异常两种显示都做了。
- [ ] 06：没有 TabBar；PDF 和图片都能缩放；文件缺失时有提示。
- [ ] 三个 Tab 的图标激活时填充，激活色是主色，TabBar 在 iPhone 上不被底部横条挡住。
- [ ] 断网后（开飞行模式）所有页面和已保存的证明都能打开。
- [ ] 同一个组件在不同页面里长得一样：状态芯片、按钮、FileRow、BookingCard。
- [ ] 逐页截图和设计稿并排放，间距、字号、圆角肉眼看不出差别（误差不超过 4）。
