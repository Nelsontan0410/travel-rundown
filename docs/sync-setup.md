# 同步（Supabase）设置

项目：`https://wxlblhvndtcdpsikcdpp.supabase.co`（地址和 publishable key 写在 `src/cloud/config.ts`，可公开；service role / secret key 不能放进代码）。

## 一次性设置（约 5 分钟）

1. **建表和权限**：Supabase 后台 → SQL Editor → New query → 把 `supabase/schema.sql` 整段贴上 → Run。可以重复运行。
2. **打开匿名登录**（同伴不用注册，点邀请就能先加入）：
   Authentication → Sign In / Providers → 找到 **Allow anonymous sign-ins** → 打开 → Save。
3. **网址**：Authentication → URL Configuration
   - Site URL：`https://tongxing8.netlify.app`
   - Redirect URLs 里加：`https://tongxing8.netlify.app/**`（Google 登录和邮箱确认链接回来用）

## 登录方式（2026-10-26 起，主用户必须用账号）

主用户用 Google 或邮箱 + 密码登录，换手机、清缓存后重新登录就能找回旅程。需要在后台做三件事：

1. **打开绑定功能**：Authentication → Sign In / Providers → 打开 **Allow manual linking**。匿名身份绑定 Google / 邮箱时需要它（已加入的旅程不会丢）。
2. **邮箱**：Email 默认是开的。「Confirm email」开着时，注册后要先点邮件里的确认链接再登录；想省这一步可以关掉。
3. **Google 登录**（要自己在 Google 后台建凭据）：
   1. 打开 https://console.cloud.google.com/ → 新建（或选一个）项目 → APIs & Services → OAuth consent screen → 填应用名和你的邮箱，保存。
   2. Credentials → Create credentials → OAuth client ID → 类型选 **Web application**。
   3. **Authorized redirect URIs** 填 Supabase 给的回调地址：`https://wxlblhvndtcdpsikcdpp.supabase.co/auth/v1/callback`。
   4. 建好后复制 **Client ID** 和 **Client secret**。
   5. Supabase → Authentication → Sign In / Providers → **Google** → 打开，贴上 Client ID 和 Client secret → Save。
   6. consent screen 如果是 Testing 状态，要把你和同伴的 Google 邮箱加进 Test users，或点 Publish app。

没做 1 和 3 之前：邮箱注册登录可以用；点 Google 按钮会提示「Google 登录还没在 Supabase 打开」，不会弄坏任何资料。

## 之前用匿名身份开启过同步的旅程

如果清缓存后本机的匿名身份丢了，云端旅程还属于那个旧身份。在 Supabase SQL Editor 里把它转给你现在登录的账号（把两个值换成真实的）：

```sql
-- 旧匿名身份的 id：Authentication → Users 里找 Anonymous 的那个，或 select owner_id from cloud_trips;
-- 新账号的 id：Authentication → Users 里你的 Google / 邮箱那一行的 UID
update public.cloud_trips set owner_id = '<新账号 UID>' where owner_id = '<旧匿名 UID>';
update public.trip_members set user_id = '<新账号 UID>' where user_id = '<旧匿名 UID>';
update public.trip_invites set accepted_by = '<新账号 UID>' where accepted_by = '<旧匿名 UID>';
update public.trip_invites set invited_by = '<新账号 UID>' where invited_by = '<旧匿名 UID>';
update public.trip_suggestions set author_id = '<新账号 UID>' where author_id = '<旧匿名 UID>';
update public.trip_events set actor_id = '<新账号 UID>' where actor_id = '<旧匿名 UID>';
```

执行后用新账号登录，旅程会自动找回，并且是主用户。

## 更新后要做的事

- **2026-10-19 同伴建议**：重新运行一次 `supabase/schema.sql`（新增提交 / 处理建议的函数）。
- **2026-10-19 通知**：重新运行一次 `supabase/schema.sql`（会新增 `trip_events` 表、发布 / 加入 / 退出时自动记通知，并打开实时推送）。不用改其他设置。
- **2026-10-21 邀请码并发锁**：运行一次 `supabase/migrations/20261021_invite_claim_lock.sql`（或重新运行整份 `supabase/schema.sql`，内容相同）。两台手机同时用同一个邀请码时只有一台能加入。

## 怎么用

- **主用户**：旅程设置 → 同步与同伴 → 开启同步（填自己的名字）→ 填同伴名字 → 生成邀请 → 用 WhatsApp / 微信发出去。
- **同伴**：点链接加入；或在 App「旅程」页输入邀请码（主屏幕 App 用这个）。一个邀请码只能给一台手机用。
- **同伴建议**：同伴在本机改了行程 → 旅程设置「我的修改」（或行程页的提示）勾选要给主用户看的、写一句说明、提交。主用户收到通知 → 逐项「接受 / 不采纳」→ 现在发布。没提交、没被采纳的修改一直只留在同伴手机上，也可以一项项「恢复成主用户版本」。
- **通知**：底部「通知」看谁发布了什么（改了哪几项）、谁加入 / 退出。在通知页打开「手机通知」后，App 在后台时会弹出系统通知；App 完全关掉时收不到，下次打开会看到。
- 主用户身份跟着账号走，不再绑在某一台手机上：换手机或清缓存后重新登录就能找回并继续发布。匿名身份（还没绑定账号的同伴）清除网站资料后无法找回，建议绑定 Google 或邮箱。

## 注意

- 免费项目长时间没人用会被暂停，到后台点恢复即可；手机上的资料不受影响。
- 设了密码的证明文件在手机上加密后才上传，云端只有密文；密码由主用户另外告诉同伴。

## 规则（数据库里强制执行，不靠前端）

| 谁 | 能做什么 |
|---|---|
| 主用户 | 开启同步、发布版本、上传共享文件、邀请 / 撤回 / 移除同伴、处理建议 |
| 同伴（用邀请码加入，匿名或账号都行） | 读取版本和共享文件、退出、提交 / 撤回自己的建议 |
| 其他人 | 什么都看不到 |

完成勾选、实际记账、穿搭打包、主题不上云。预算跟着版本同步，大家看到同一个。
