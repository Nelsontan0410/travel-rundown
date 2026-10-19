# 同步（Supabase）设置

项目：`https://wxlblhvndtcdpsikcdpp.supabase.co`（地址和 publishable key 写在 `src/cloud/config.ts`，可公开；service role / secret key 不能放进代码）。

## 一次性设置（约 5 分钟）

1. **建表和权限**：Supabase 后台 → SQL Editor → New query → 把 `supabase/schema.sql` 整段贴上 → Run。可以重复运行。
2. **打开匿名登录**（不用邮箱，每台手机第一次用同步时自动有一个身份）：
   Authentication → Sign In / Providers → 找到 **Allow anonymous sign-ins** → 打开 → Save。
3. **网址**：Authentication → URL Configuration
   - Site URL：`https://tongxing8.netlify.app`

## 更新后要做的事

- **2026-10-19 通知**：重新运行一次 `supabase/schema.sql`（会新增 `trip_events` 表、发布 / 加入 / 退出时自动记通知，并打开实时推送）。不用改其他设置。

## 怎么用

- **主用户**：旅程设置 → 同步与同伴 → 开启同步（填自己的名字）→ 填同伴名字 → 生成邀请 → 用 WhatsApp / 微信发出去。
- **同伴**：点链接加入；或在 App「旅程」页输入邀请码（主屏幕 App 用这个）。一个邀请码只能给一台手机用。
- **通知**：底部「通知」看谁发布了什么（改了哪几项）、谁加入 / 退出。在通知页打开「手机通知」后，App 在后台时会弹出系统通知；App 完全关掉时收不到，下次打开会看到。
- 主用户身份在开启同步的那台手机上；删除 App 或清除网站资料后就不能再发布这份旅程。

## 注意

- 免费项目长时间没人用会被暂停，到后台点恢复即可；手机上的资料不受影响。
- 设了密码的证明文件在手机上加密后才上传，云端只有密文；密码由主用户另外告诉同伴。

## 规则（数据库里强制执行，不靠前端）

| 谁 | 能做什么 |
|---|---|
| 主用户 | 开启同步、发布版本、上传共享文件、邀请 / 撤回 / 移除同伴 |
| 同伴（用邀请码加入） | 读取版本和共享文件、退出；（第二步）提交建议 |
| 其他人 | 什么都看不到 |

完成勾选、实际记账、穿搭打包、主题不上云。预算跟着版本同步，大家看到同一个。
