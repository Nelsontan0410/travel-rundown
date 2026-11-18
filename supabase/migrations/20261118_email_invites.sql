-- 2026-11-18 按邮箱邀请。在 Supabase SQL Editor 运行一次（或重新运行整份 schema.sql）。
-- ———————— 2026-11-18 按邮箱邀请（取代邀请码） ————————
-- 主用户输入同伴的邮箱；同伴用这个邮箱（Google 或已确认的邮箱账号）登录后，自动加入。
-- 旧的邀请码函数保留，只为了已经发出去的旧链接；App 里不再生成邀请码。

-- 主用户：按邮箱邀请。同一份旅程同一个邮箱只留一条（再邀请一次只更新名字）
create or replace function public.create_email_invite(p_trip uuid, p_email text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); t text; who text; iid uuid;
begin
  if not public.is_trip_owner(p_trip) then raise exception '只有主用户可以邀请'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception '邮箱格式不对'; end if;
  if e = public.my_email() then raise exception '不能邀请自己'; end if;
  if exists (select 1 from trip_members m join auth.users u on u.id = m.user_id where m.trip_id = p_trip and lower(u.email) = e) then
    raise exception '这个邮箱已经在旅程里了';
  end if;
  select title into t from cloud_trips where id = p_trip;
  select name into who from trip_members where trip_id = p_trip and user_id = auth.uid();
  select id into iid from trip_invites where trip_id = p_trip and lower(email) = e and accepted_by is null limit 1;
  if iid is not null then
    update trip_invites set name = coalesce(nullif(trim(p_name), ''), name) where id = iid;
    return iid;
  end if;
  delete from trip_invites where trip_id = p_trip and lower(email) = e;
  insert into trip_invites (trip_id, trip_title, email, name, invited_by, inviter_name)
    values (p_trip, t, e, nullif(trim(p_name), ''), auth.uid(), who)
    returning id into iid;
  return iid;
end $$;

-- 被邀请的人登录后调用：把发给「我的邮箱」的邀请全部领取，返回加入的旅程 id。
-- 只认已确认的邮箱（Google 登录的邮箱一律是确认过的）；匿名身份没有邮箱，领不到。
create or replace function public.claim_email_invites(p_name text) returns setof uuid
language plpgsql security definer set search_path = public as $$
declare e text; inv trip_invites; was boolean;
begin
  if auth.uid() is null then return; end if;
  select lower(email) into e from auth.users where id = auth.uid() and email_confirmed_at is not null and coalesce(is_anonymous, false) = false;
  if e is null or e = '' then return; end if;
  for inv in select * from trip_invites where lower(email) = e and code is null and accepted_by is null for update loop
    if public.is_trip_owner(inv.trip_id) then continue; end if;
    update trip_invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
    was := exists (select 1 from trip_members where trip_id = inv.trip_id and user_id = auth.uid());
    insert into trip_members (trip_id, user_id, email, name, role)
      values (inv.trip_id, auth.uid(), e, coalesce(nullif(trim(p_name), ''), inv.name, split_part(e, '@', 1)), 'member')
      on conflict (trip_id, user_id) do nothing;
    if not was then perform public.log_trip_event(inv.trip_id, 'join', public.member_name(inv.trip_id) || ' 加入了旅程'); end if;
    return next inv.trip_id;
  end loop;
end $$;

-- 没用完的旧邀请码作废（App 里已经没有邀请码了）
delete from public.trip_invites where code is not null and accepted_by is null;

grant execute on function public.create_email_invite(uuid, text, text) to authenticated;
grant execute on function public.claim_email_invites(text) to authenticated;
