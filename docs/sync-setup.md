# 同步（Supabase）设置

项目：`https://wxlblhvndtcdpsikcdpp.supabase.co`（地址和 publishable key 写在 `src/cloud/config.ts`，可公开；service role / secret key 不能放进代码）。

## 一次性设置（约 5 分钟）

1. **建表和权限**：Supabase 后台 → SQL Editor → New query → 把 `supabase/schema.sql` 整段贴上 → Run。可以重复运行。
2. **（可选）登录方式改成 6 位验证码**（PWA 装到主屏幕后，点邮件里的链接会跳去浏览器，所以验证码更顺）。
   Supabase 免费版用自带发信时**不能改模板**，要先在 Authentication → Emails → SMTP Settings 接自己的发信服务（例如 Gmail 应用专用密码、Brevo、Resend）。
   不改也能用：默认邮件是登录链接，在要登录的那台设备、那个浏览器里点链接即可。
   接好 SMTP 后：Authentication → Emails → 分别打开 **Magic Link** 和 **Confirm signup** 两个模板，把内容换成（或加上）：
   ```html
   <h2>旅程同步登录</h2>
   <p>你的验证码：<strong>{{ .Token }}</strong></p>
   <p>几分钟内有效。不是你本人操作可以忽略这封邮件。</p>
   ```
3. **网址**：Authentication → URL Configuration
   - Site URL：`https://tongxing8.netlify.app`
   - Redirect URLs：`https://tongxing8.netlify.app/**`、`https://*--tongxing8.netlify.app/**`
4. **Email 登录已开启**：Authentication → Sign In / Providers → Email 打开（默认就是开的）。

## 注意

- Supabase 自带的发信服务每小时只能发很少几封（测试够用）。同伴多了、或验证码收不到时，在 Authentication → SMTP Settings 接一个自己的发信服务（例如 Resend、Brevo）。
- 免费项目长时间没人用会被暂停，到后台点恢复即可；手机上的资料不受影响。
- 设了密码的证明文件在手机上加密后才上传，云端只有密文；密码由主用户另外告诉同伴。

## 规则（数据库里强制执行，不靠前端）

| 谁 | 能做什么 |
|---|---|
| 主用户 | 开启同步、发布版本、上传共享文件、邀请 / 撤回 / 移除同伴 |
| 同伴（被邀请并登录） | 读取版本和共享文件、退出；（第二步）提交建议 |
| 其他人 | 什么都看不到 |

完成勾选、实际记账、穿搭打包、主题不上云。预算跟着版本同步，大家看到同一个。
