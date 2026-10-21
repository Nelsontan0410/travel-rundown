-- 审查修复 #8（2026-10-21）：邀请码并发领取加锁，保证「一个邀请码只能给一台手机用」
--
-- 问题：join_with_code 先读邀请码、检查「还没人用过」，最后才写 accepted_by。两台手机几乎同时领取时，
--       两边都能通过检查、都成为成员，邀请码最后绑在后写的那台上（先领到的那台反而算「用过别人的码」）。
--       用真实 Postgres 复现：20 台同时领取同一个码，13 台加入成功。
-- 修复：① 先用一条带条件的 UPDATE 原子地「领取」邀请码（只有还没人用过、或者本来就是自己用过的才能领到），
--          领不到就报错，整个调用回滚，不会留下成员记录；之后才登记成员。
--       ② 数据库层再加一道约束（触发器）：邀请码一旦绑定到某个账号，不能再改绑到另一个账号
--          （账号被删除时外键把 accepted_by 置空不受影响）。
-- RLS：trip_invites 只开放「主用户读」「主用户撤回（删除）」两条策略，没有 insert / update 策略，
--       客户端不能绕过这个函数直接改写邀请码记录；这次不需要改策略。
--
-- 用法：Supabase 后台 → SQL Editor → New query → 整段贴上 → Run。可以重复运行。
-- supabase/schema.sql 已同步成同样的内容，以后整份重新运行 schema.sql 也会得到这个版本。

create or replace function public.join_with_code(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv trip_invites; claimed uuid; was boolean;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select * into inv from trip_invites where code = upper(replace(replace(trim(p_code), '-', ''), ' ', ''));
  if inv.id is null then raise exception '邀请码不对，或者已被主用户撤回'; end if;
  if public.is_trip_owner(inv.trip_id) then raise exception '这是你自己的旅程'; end if;
  -- 原子领取：同时有两台手机领取时，后到的那台会等前一台提交，再按最新的 accepted_by 判断，领不到
  update trip_invites set accepted_at = coalesce(accepted_at, now()), accepted_by = auth.uid()
    where id = inv.id and (accepted_by is null or accepted_by = auth.uid())
    returning id into claimed;
  if claimed is null then
    raise exception '这个邀请码已经在别的手机上用过了，请主用户重新生成';
  end if;
  was := exists (select 1 from trip_members where trip_id = inv.trip_id and user_id = auth.uid());
  insert into trip_members (trip_id, user_id, name, role)
    values (inv.trip_id, auth.uid(), coalesce(nullif(trim(p_name), ''), inv.name), 'member')
    on conflict (trip_id, user_id) do update set name = excluded.name;
  if not was then perform public.log_trip_event(inv.trip_id, 'join', public.member_name(inv.trip_id) || ' 加入了旅程'); end if;
  return inv.trip_id;
end $$;

-- 数据库层约束：已绑定的邀请码不能改绑到另一个账号
create or replace function public.trip_invites_keep_binding() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.accepted_by is not null and new.accepted_by is not null and new.accepted_by <> old.accepted_by then
    raise exception '这个邀请码已经在别的手机上用过了，请主用户重新生成';
  end if;
  return new;
end $$;
drop trigger if exists trip_invites_keep_binding on public.trip_invites;
create trigger trip_invites_keep_binding before update of accepted_by on public.trip_invites
  for each row execute function public.trip_invites_keep_binding();

grant execute on function public.join_with_code(text, text) to authenticated;
