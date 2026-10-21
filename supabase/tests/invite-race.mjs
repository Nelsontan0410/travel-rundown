// 审查修复 #8（2026-10-21）：用真实 Postgres 验证邀请码并发领取（不进构建、不进 npm test，不加依赖）。
// 用法（不要在项目里装依赖）：把这个文件复制到一个空文件夹，在那个文件夹里
//   npm i embedded-postgres pg
//   node invite-race.mjs <项目>/supabase/schema.sql [<项目>/supabase/migrations/xxx.sql]
// 输出：重叠领取时第二台是否被拒、20 台同时领取有几台成功、同一台重新领取、改绑约束、删除账号后外键置空。
// 修复前：两台都加入、20 台里十几台成功；修复后：只有 1 台成功。
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { readFileSync, rmSync } from 'node:fs';
const [schemaPath, migrationPath] = process.argv.slice(2);
const dir = new URL('./data', import.meta.url).pathname;
rmSync(dir, { recursive: true, force: true });
const ep = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54329, persistent: false, createPostgresUser: true, onLog: () => {}, onError: () => {} });
await ep.initialise();
await ep.start();
const conn = async () => { const c = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'pw', database: 'postgres' }); await c.connect(); return c; };
const admin = await conn();
try {
  await admin.query(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  `);
  await admin.query(readFileSync(schemaPath, 'utf8'));
  if (migrationPath) await admin.query(readFileSync(migrationPath, 'utf8'));
  if (process.env.TWICE) await admin.query(readFileSync(schemaPath, 'utf8'));

  const OWNER = '00000000-0000-0000-0000-000000000001', A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
  const TRIP = '11111111-1111-1111-1111-111111111111';
  await admin.query(`insert into auth.users values ($1), ($2), ($3)`, [OWNER, A, B]);
  const as = async (c, uid) => c.query(`select set_config('test.uid', $1, false)`, [uid]);
  await as(admin, OWNER);
  await admin.query(`select public.create_cloud_trip($1, 'T', '主')`, [TRIP]);
  const code = (await admin.query(`select public.create_invite($1, '小明') as c`, [TRIP])).rows[0].c;

  // 场景：两台手机几乎同时领取同一个码。A 的调用已经执行完但还没提交时，B 开始调用。
  const ca = await conn(), cb = await conn();
  await as(ca, A); await as(cb, B);
  await ca.query('begin');
  await ca.query(`select public.join_with_code($1, 'A')`, [code]);
  let bResult;
  const bDone = cb.query(`select public.join_with_code($1, 'B')`, [code]).then(() => (bResult = 'B 成功'), (e) => (bResult = 'B 失败：' + e.message));
  await new Promise((r) => setTimeout(r, 500));
  await ca.query('commit');
  await bDone;
  const members = (await admin.query(`select name from trip_members where trip_id = $1 and role = 'member' order by name`, [TRIP])).rows.map((r) => r.name);
  const inv = (await admin.query(`select accepted_by from trip_invites where code = $1`, [code])).rows[0];
  console.log(JSON.stringify({ bResult, members, acceptedBy: inv.accepted_by === A ? 'A' : inv.accepted_by === B ? 'B' : inv.accepted_by }));

  // 真正同时发起：20 台手机抢同一个码
  const code2 = (await admin.query(`select public.create_invite($1, '小红') as c`, [TRIP])).rows[0].c;
  const ids = Array.from({ length: 20 }, (_, i) => `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`);
  for (const id of ids) await admin.query(`insert into auth.users values ($1)`, [id]);
  const clients = await Promise.all(ids.map(async (id) => { const c = await conn(); await as(c, id); return c; }));
  const res = await Promise.allSettled(clients.map((c, i) => c.query(`select public.join_with_code($1, $2)`, [code2, 'P' + i])));
  const ok = res.filter((r) => r.status === 'fulfilled').length;
  const joined = (await admin.query(`select count(*)::int n from trip_members where trip_id = $1 and name like 'P%'`, [TRIP])).rows[0].n;
  const msgs = [...new Set(res.filter((r) => r.status === 'rejected').map((r) => r.reason.message))];
  console.log(JSON.stringify({ parallel: { succeeded: ok, membersJoined: joined, errors: msgs } }));
  // 同一台手机再领一次自己的码：照旧可以（重新安装 / 换名字）
  await as(ca, A);
  const again = await ca.query(`select public.join_with_code($1, 'A2')`, [code]).then(() => 'ok', (e) => e.message);
  console.log(JSON.stringify({ sameDeviceAgain: again }));
  // 数据库层约束：已绑定的码不能改绑；删除账号时外键置空照常
  const rebind = await admin.query(`update trip_invites set accepted_by = $1 where code = $2`, [B, code]).then(() => '允许改绑', (e) => '拒绝改绑：' + e.message);
  const winner = (await admin.query(`select accepted_by from trip_invites where code = $1`, [code2])).rows[0].accepted_by;
  await admin.query(`delete from trip_members where user_id = $1`, [winner]);
  const fkNull = await admin.query(`delete from auth.users where id = $1`, [winner]).then(
    async () => ((await admin.query(`select accepted_by from trip_invites where code = $1`, [code2])).rows[0].accepted_by === null ? '删除领取者账号 ok，accepted_by 置空' : '未置空'),
    (e) => '删除账号失败：' + e.message,
  );
  console.log(JSON.stringify({ rebind, fkNull }));
  for (const c of [ca, cb, ...clients]) await c.end();
} finally {
  await admin.end();
  await ep.stop();
}
