// 2026-10-18 同步：Supabase 项目地址和 publishable key（可以公开，权限靠数据库的行级权限）。
// 部署时可以用 Netlify 环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 覆盖。
// 注意：service role / secret key 绝对不能放在这里。
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://wxlblhvndtcdpsikcdpp.supabase.co';
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_58wtAUsUknQ73ex1S9Vheg_0KdpSbe_';
