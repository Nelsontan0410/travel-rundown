# 旅程介绍页图片：GPT image 提示词

旅程介绍页（`/trip/<id>/story`）现在用的是 `public/landing/*.svg` 示意插画，页面上会标「示意图」。
做好真实照片后：

1. 按下表文件名保存为 `.jpg`（建议宽 1600px，质量 80，单张 < 350 KB），放进 `public/landing/`。
2. 在 `src/domain/landingMedia.ts` 里把对应那一行的 `m('id', …)` 末尾加上 `'jpg'`，例如
   `m('fuji-lake', 'scene', '湖边远望富士山', [...], 'jpg')`。示意图标记会自动消失。

## 统一风格（每条提示词后面都加上这段）

> Natural, true-to-life color photography, consistent soft exposure, gentle film-like contrast, no heavy yellow or sepia filter, no text, no logos, no watermark, no people facing camera, editorial travel-magazine composition, high detail.

风景用 **16:10 横图**（1600×1000），美食用 **1:1 方图**（1200×1200，俯拍）。

## 风景

| 文件名 | 用在 | 提示词 |
|---|---|---|
| `fuji-lake.jpg` | 富士山、河口湖、山中湖、忍野八海、新仓山 | Mount Fuji with a snow cap at early winter sunrise, seen across calm Lake Kawaguchi, soft pink and pale blue sky, mirror reflection on the water, dark pine trees framing both sides, wide landscape |
| `old-street.jpg` | 浅草、寺社、老街、堺町通 | Early morning in an old Tokyo temple street, red lanterns and a vermilion temple gate at the end of a narrow stone lane, wooden shopfronts with shutters half open, warm low sun, quiet before the crowds |
| `city-night.jpg` | 东京铁塔、银座、涩谷、秋叶原、薄野、狸小路 | Tokyo at blue hour, Tokyo Tower glowing orange above dense city buildings with lit windows, soft bokeh of street lights in the foreground, winter clear air |
| `canal-night.jpg` | 小樽运河、天狗山、北一硝子、音乐盒堂 | Otaru Canal on a snowy winter evening, old stone warehouses along the water, row of glowing gas lamps reflected in the canal, fresh snow on roofs and railings, deep blue dusk sky |
| `snow-city.jpg` | 札幌、钟楼、北海道厅旧本厅舍、大通公园 | Sapporo in winter, historic red-brick government building and a small white clock tower in falling snow, bare trees, snowy plaza, soft overcast light |
| `snow-field.jpg` | 美瑛、富良野、白须瀑布、旭山动物园 | Biei Hokkaido snow-covered rolling hills with a single lone tree, pale blue sky, soft winter sun, untouched powder snow, minimal composition |
| `onsen.jpg` | 温泉、登别、定山溪、丰平峡、熊牧场 | Outdoor rotenburo hot spring in a Japanese ryokan during snowfall, steam rising from turquoise water, snow-capped rocks around the pool, pine forest behind, wooden eaves at the top edge |
| `lake-volcano.jpg` | 洞爷湖、Silo 展望台、羊蹄山 | Lake Toya in winter seen from a hilltop lookout, a small island in the lake, snow-covered Mount Yotei volcano in the distance, crisp morning light |
| `market.jpg` | 二条市场、新南樽市场、海鲜市场 | Morning fish market in Hokkaido, wooden stalls with king crabs, scallops and salmon on ice, striped awnings, warm hanging lights, inviting and lively but no faces |
| `runway.jpg` | 航班、机场 | View through an airplane window above soft white clouds, aircraft wing in golden afternoon light, oval window frame visible |

## 美食（俯拍）

| 文件名 | 用在 | 提示词 |
|---|---|---|
| `sushi.jpg` | 寿司、鮨 | Overhead shot of a wooden sushi board with six pieces of Hokkaido nigiri (salmon, tuna, scallop, sea urchin, shrimp, flounder), chopsticks, on a dark wooden counter |
| `seafood-bowl.jpg` | 海鲜丼、海胆、鲑鱼卵 | Overhead shot of a Hokkaido kaisendon rice bowl topped with sea urchin, salmon roe, crab and sashimi, small dish of wasabi and soy sauce, dark ceramic bowl on wood |
| `crab.jpg` | 帝王蟹、螃蟹 | Overhead shot of steamed red king crab legs arranged on a white plate at a seafood market table, lemon wedge, wooden table |
| `soup-curry.jpg` | 汤咖喱 | Overhead shot of Sapporo soup curry in a white bowl, chicken leg, grilled pumpkin, eggplant, okra and boiled egg in golden spiced broth, side of rice |
| `grill.jpg` | 成吉思汗烤羊肉、神户牛、铁板烧 | Overhead shot of Japanese grill: slices of marbled beef and lamb on a dark iron grill plate, bean sprouts and green peppers, small dipping sauce dishes |
| `noodles.jpg` | 荞麦面、乌冬、拉面 | Overhead shot of a bowl of hot soba noodles in clear dark broth with green onion and tempura flakes, chopsticks resting on the bowl, wooden table |
| `sweets.jpg` | 芝士蛋糕、甜点、下午茶 | Overhead shot of a slice of Hokkaido double-layer cheesecake on a small plate next to a cup of coffee, linen napkin, soft daylight |
| `kaiseki.jpg` | 怀石料理、旅馆晚餐 | Overhead shot of a Japanese ryokan kaiseki dinner on a lacquer tray: small ceramic dishes with sashimi, simmered vegetables, grilled fish and seasonal garnish |

## 首屏动态（可选）

首屏已经用上面几张图做慢速缩放、平移和交叉淡入。如果想换成视频：用同一组提示词生成 6–8 秒、无剪辑、缓慢推镜头的 16:9 视频，导出 1600px 宽、无声、< 4 MB 的 MP4，发给我再接进来。
