-- 旅程同步（Supabase）表结构
-- 用法：Supabase 后台 → SQL Editor → New query → 整段贴上 → Run。可以重复运行（已有的会跳过或覆盖函数）。
-- 需要在 Authentication → Sign In / Providers 打开「Allow anonymous sign-ins」：不用邮箱，每台手机自动有一个身份。
--
-- 规则：
--   · 每份旅程只有一个主用户（owner）= 开启同步的那台手机。只有主用户能发布新版本、邀请和移除成员、上传共享文件。
--   · 同伴只能用主用户生成的邀请码加入；一个邀请码只能给一台手机用。加入后可以读取这份旅程的所有版本和共享文件。
--   · 同伴可以提交建议（第二步启用），只有作者本人和主用户看得到。
--   · 完成勾选、实际记账、穿搭打包都不上云，留在各自手机上。
--   · 设了密码的证明文件在手机上加密后才上传，这里存的是密文。

-- ———————— 表 ————————

create table if not exists public.cloud_trips (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  latest_version integer not null default 0,
  latest_note text,
  latest_important boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.cloud_trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.cloud_trips (id) on delete cascade,
  trip_title text not null,
  email text not null,
  invited_by uuid references auth.users (id) on delete set null,
  inviter_email text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (trip_id, email)
);

create table if not exists public.trip_versions (
  trip_id uuid not null references public.cloud_trips (id) on delete cascade,
  version integer not null,
  note text,
  important boolean not null default false,
  snapshot jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, version)
);

-- 第二步（同伴提交建议）会用到；先建好，免得以后再跑一次
create table if not exists public.trip_suggestions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.cloud_trips (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_email text not null,
  base_version integer not null,
  note text,
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'partial')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2026-10-18 改成不用邮箱：邮箱可空，加名字和邀请码（旧表也能直接升级）
alter table public.trip_members alter column email drop not null;
alter table public.trip_members add column if not exists name text;
alter table public.trip_invites alter column email drop not null;
alter table public.trip_invites add column if not exists code text;
alter table public.trip_invites add column if not exists name text;
alter table public.trip_invites add column if not exists inviter_name text;
alter table public.trip_invites add column if not exists accepted_by uuid references auth.users (id) on delete set null;
alter table public.trip_suggestions alter column author_email drop not null;
create unique index if not exists trip_invites_code on public.trip_invites (code);

create index if not exists trip_members_user on public.trip_members (user_id);
create index if not exists trip_invites_email on public.trip_invites (lower(email));
create index if not exists trip_suggestions_trip on public.trip_suggestions (trip_id, status);

-- 2026-10-19 通知：旅程里发生的事（谁发布了什么、谁加入 / 退出）。只能由下面的函数写入，成员都能读。
create table if not exists public.trip_events (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.cloud_trips (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  kind text not null,
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trip_events_trip on public.trip_events (trip_id, id);

-- ———————— 权限判断（security definer：在策略里用，避免策略互相递归） ————————

create or replace function public.is_trip_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = t and user_id = auth.uid());
$$;

create or replace function public.is_trip_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cloud_trips where id = t and owner_id = auth.uid());
$$;

create or replace function public.my_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- ———————— 行级权限 ————————

alter table public.cloud_trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_versions enable row level security;
alter table public.trip_suggestions enable row level security;
alter table public.trip_events enable row level security;

drop policy if exists "成员可读旅程" on public.cloud_trips;
create policy "成员可读旅程" on public.cloud_trips for select using (public.is_trip_member(id));
drop policy if exists "主用户可删旅程" on public.cloud_trips;
create policy "主用户可删旅程" on public.cloud_trips for delete using (owner_id = auth.uid());

drop policy if exists "成员可读成员名单" on public.trip_members;
create policy "成员可读成员名单" on public.trip_members for select using (public.is_trip_member(trip_id));
drop policy if exists "主用户移除成员或自己退出" on public.trip_members;
create policy "主用户移除成员或自己退出" on public.trip_members for delete
  using ((public.is_trip_owner(trip_id) and role = 'member') or (user_id = auth.uid() and role = 'member'));

drop policy if exists "主用户和被邀请人可读邀请" on public.trip_invites;
drop policy if exists "主用户可读邀请" on public.trip_invites;
create policy "主用户可读邀请" on public.trip_invites for select using (public.is_trip_owner(trip_id));
drop policy if exists "主用户可撤回邀请" on public.trip_invites;
create policy "主用户可撤回邀请" on public.trip_invites for delete using (public.is_trip_owner(trip_id));

drop policy if exists "成员可读版本" on public.trip_versions;
create policy "成员可读版本" on public.trip_versions for select using (public.is_trip_member(trip_id));

drop policy if exists "作者和主用户可读建议" on public.trip_suggestions;
create policy "作者和主用户可读建议" on public.trip_suggestions for select
  using (author_id = auth.uid() or public.is_trip_owner(trip_id));
drop policy if exists "成员可提交建议" on public.trip_suggestions;
create policy "成员可提交建议" on public.trip_suggestions for insert
  with check (author_id = auth.uid() and public.is_trip_member(trip_id) and status = 'pending');
drop policy if exists "主用户处理建议" on public.trip_suggestions;
create policy "主用户处理建议" on public.trip_suggestions for update using (public.is_trip_owner(trip_id));

drop policy if exists "成员可读通知" on public.trip_events;
create policy "成员可读通知" on public.trip_events for select using (public.is_trip_member(trip_id));

-- 写入一律走下面的函数（建旅程、发布版本、邀请、加入），表本身不开放插入

-- ———————— 函数 ————————

-- 旧的按邮箱邀请的函数不用了
drop function if exists public.create_cloud_trip(uuid, text);
drop function if exists public.invite_member(uuid, text);
drop function if exists public.accept_invite(uuid);

-- 记一条通知（内部用，不开放给前端直接调用）
create or replace function public.log_trip_event(p_trip uuid, p_kind text, p_title text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into trip_events (trip_id, actor_id, actor_name, kind, title, detail)
  values (p_trip, auth.uid(),
    (select name from trip_members where trip_id = p_trip and user_id = auth.uid()),
    p_kind, p_title, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function public.log_trip_event(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.member_name(p_trip uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select name from trip_members where trip_id = p_trip and user_id = auth.uid()), ''), '有人');
$$;

-- 开启同步：建旅程并把自己登记为主用户
create or replace function public.create_cloud_trip(p_id uuid, p_title text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists (select 1 from cloud_trips where id = p_id) then
    if not exists (select 1 from cloud_trips where id = p_id and owner_id = auth.uid()) then
      raise exception '这份旅程已经属于别人';
    end if;
    return;
  end if;
  insert into cloud_trips (id, owner_id, title) values (p_id, auth.uid(), p_title);
  insert into trip_members (trip_id, user_id, email, name, role)
    values (p_id, auth.uid(), nullif(public.my_email(), ''), nullif(trim(p_name), ''), 'owner');
end $$;

-- 发布新版本（只有主用户）；返回新版本号。p_summary：这次改了什么（给通知用）
drop function if exists public.publish_version(uuid, text, boolean, jsonb, text);
create or replace function public.publish_version(p_trip uuid, p_note text, p_important boolean, p_snapshot jsonb, p_title text, p_summary jsonb default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if not public.is_trip_owner(p_trip) then raise exception '只有主用户可以发布更新'; end if;
  select latest_version + 1 into v from cloud_trips where id = p_trip for update;
  insert into trip_versions (trip_id, version, note, important, snapshot, created_by)
    values (p_trip, v, p_note, coalesce(p_important, false), p_snapshot, auth.uid());
  update cloud_trips set latest_version = v, latest_note = p_note, latest_important = coalesce(p_important, false),
    title = coalesce(nullif(p_title, ''), title), updated_at = now() where id = p_trip;
  perform public.log_trip_event(p_trip, 'publish',
    public.member_name(p_trip) || ' 发布了 v' || v || case when coalesce(p_important, false) then '（重要更新）' else '' end,
    jsonb_build_object('version', v, 'note', p_note, 'important', coalesce(p_important, false), 'summary', coalesce(p_summary, '{}'::jsonb)));
  return v;
end $$;

-- 生成邀请码（只有主用户）：10 位，去掉容易看错的 0 O 1 I L；返回邀请码
create or replace function public.create_invite(p_trip uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw bytea;
  c text;
  i int;
  t text;
  who text;
begin
  if not public.is_trip_owner(p_trip) then raise exception '只有主用户可以邀请'; end if;
  select title into t from cloud_trips where id = p_trip;
  select name into who from trip_members where trip_id = p_trip and user_id = auth.uid();
  loop
    raw := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
    c := '';
    for i in 0..9 loop
      c := c || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from trip_invites where code = c);
  end loop;
  insert into trip_invites (trip_id, trip_title, code, name, invited_by, inviter_name)
    values (p_trip, t, c, nullif(trim(p_name), ''), auth.uid(), who);
  return c;
end $$;

-- 加入前先看一眼：这个邀请码是哪份旅程、谁邀请的、能不能用
create or replace function public.peek_invite(p_code text)
returns table (trip_id uuid, trip_title text, inviter_name text, name text, usable boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select i.trip_id, c.title, i.inviter_name, i.name,
    (i.accepted_by is null or i.accepted_by = auth.uid()) and c.owner_id <> auth.uid(),
    c.owner_id = auth.uid() or i.accepted_by = auth.uid()
  from trip_invites i join cloud_trips c on c.id = i.trip_id
  where i.code = upper(replace(replace(trim(p_code), '-', ''), ' ', ''));
$$;

-- 用邀请码加入：一个邀请码只能给一台手机用；返回旅程 id
create or replace function public.join_with_code(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv trip_invites; was boolean;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select * into inv from trip_invites where code = upper(replace(replace(trim(p_code), '-', ''), ' ', ''));
  if inv.id is null then raise exception '邀请码不对，或者已被主用户撤回'; end if;
  if public.is_trip_owner(inv.trip_id) then raise exception '这是你自己的旅程'; end if;
  if inv.accepted_by is not null and inv.accepted_by <> auth.uid() then
    raise exception '这个邀请码已经在别的手机上用过了，请主用户重新生成';
  end if;
  was := exists (select 1 from trip_members where trip_id = inv.trip_id and user_id = auth.uid());
  insert into trip_members (trip_id, user_id, name, role)
    values (inv.trip_id, auth.uid(), coalesce(nullif(trim(p_name), ''), inv.name), 'member')
    on conflict (trip_id, user_id) do update set name = excluded.name;
  update trip_invites set accepted_at = coalesce(accepted_at, now()), accepted_by = auth.uid() where id = inv.id;
  if not was then perform public.log_trip_event(inv.trip_id, 'join', public.member_name(inv.trip_id) || ' 加入了旅程'); end if;
  return inv.trip_id;
end $$;

-- 移除成员：同时作废他用过的邀请码
create or replace function public.remove_member(p_trip uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not public.is_trip_owner(p_trip) then raise exception '只有主用户可以移除成员'; end if;
  delete from trip_members where trip_id = p_trip and user_id = p_user and role = 'member' returning name into who;
  if found then perform public.log_trip_event(p_trip, 'remove', public.member_name(p_trip) || ' 移除了 ' || coalesce(nullif(who, ''), '一位同伴')); end if;
  delete from trip_invites where trip_id = p_trip and accepted_by = p_user;
end $$;

-- 同伴自己退出（直接删自己那一行）→ 记一条通知
create or replace function public.on_member_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id = auth.uid() and old.role = 'member' then
    insert into trip_events (trip_id, actor_id, actor_name, kind, title)
      values (old.trip_id, old.user_id, old.name, 'leave', coalesce(nullif(old.name, ''), '一位同伴') || ' 退出了旅程');
  end if;
  return old;
end $$;
drop trigger if exists trip_members_leave on public.trip_members;
create trigger trip_members_leave after delete on public.trip_members for each row execute function public.on_member_leave();

-- 通知实时推送（Supabase Realtime；同样受上面的读取权限限制）
do $$ begin
  alter publication supabase_realtime add table public.trip_events;
exception when duplicate_object or undefined_object then null;
end $$;

-- ———————— 共享文件（证明、二维码、封面） ————————
-- 路径：<旅程 id>/<文件内容的 sha256>。主用户上传，成员下载。
-- 第二步：同伴建议附带的文件放在 <旅程 id>/s/<用户 id>/…，只有作者和主用户能读。

insert into storage.buckets (id, name, public) values ('trip-files', 'trip-files', false)
  on conflict (id) do nothing;

create or replace function public.trip_of_path(p text) returns uuid
language plpgsql immutable as $$
begin
  return (split_part(p, '/', 1))::uuid;
exception when others then return null;
end $$;

drop policy if exists "成员可读共享文件" on storage.objects;
create policy "成员可读共享文件" on storage.objects for select using (
  bucket_id = 'trip-files' and (
    (split_part(name, '/', 2) <> 's' and public.is_trip_member(public.trip_of_path(name)))
    or (split_part(name, '/', 2) = 's' and (split_part(name, '/', 3) = auth.uid()::text or public.is_trip_owner(public.trip_of_path(name))))
  )
);
drop policy if exists "主用户上传共享文件" on storage.objects;
create policy "主用户上传共享文件" on storage.objects for insert with check (
  bucket_id = 'trip-files' and (
    (split_part(name, '/', 2) <> 's' and public.is_trip_owner(public.trip_of_path(name)))
    or (split_part(name, '/', 2) = 's' and split_part(name, '/', 3) = auth.uid()::text and public.is_trip_member(public.trip_of_path(name)))
  )
);
drop policy if exists "主用户删除共享文件" on storage.objects;
create policy "主用户删除共享文件" on storage.objects for delete using (
  bucket_id = 'trip-files' and public.is_trip_owner(public.trip_of_path(name))
);

-- 允许登录用户调用函数
grant execute on function public.create_cloud_trip(uuid, text, text) to authenticated;
grant execute on function public.publish_version(uuid, text, boolean, jsonb, text, jsonb) to authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.peek_invite(text) to authenticated;
grant execute on function public.join_with_code(text, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
