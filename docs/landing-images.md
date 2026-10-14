# 旅程介绍页照片

`public/landing/*.jpg` 是 18 张 Wikimedia Commons 真实照片（2026-10-14 由 GPT Astra 收集，按 CC0 / CC BY / CC BY-SA 使用）。
署名、许可证、原图链接、修改说明：`public/landing/credits.json`（`src/domain/landingCredits.json` 是同一份，供页面读取）。
App 内的署名页：`/credits/photos`，从旅程介绍页底部「照片来源与授权」进入。

## 规则
- 只用真实照片，不用 AI 生成图。
- 关键词只写照片真的能代表的东西（`src/domain/landingMedia.ts`）。认不出对应地点或菜式就不配图，不拿别处照片冒充。
- 拍摄地点、季节或菜式与行程不完全一致的，用 `caption` 在照片角落如实标出（目前：温泉=秋田鹤之汤，洞爷湖=5 月拍摄，帝王蟹=摄于多伦多，甜点=LeTAO 蒙布朗）。
- CC BY-SA 照片的裁切版沿用同一许可证。

## 换或加照片
1. 风景 1600×1000、美食 1200×1200，JPG，< 350 KB，放进 `public/landing/`。
2. 在 `public/landing/credits.json` 和 `src/domain/landingCredits.json` 里加一条完整署名。
3. 在 `landingMedia.ts` 的 `LANDING_MEDIA` 里加一行（id = 文件名去掉 .jpg）。
4. `npm test` 会检查每张图都有署名、许可证、原图链接，并且文件存在。
