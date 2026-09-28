-- ============================================================================
-- Habit Tracker - order/RPC/skip migration
-- Run this ONCE, top to bottom, in the Supabase SQL editor.
-- Safe: nothing is deleted. Step 0 snapshots both tables first.
-- Free-tier project with no automatic backups -> keep the snapshot tables
-- until you are happy with the app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0 - SNAPSHOTS (rollback safety net)
-- ---------------------------------------------------------------------------
create table if not exists habits_backup_20260928 as select * from habits;
create table if not exists habit_logs_backup_20260928 as select * from habit_logs;

select 'habits' as tbl, count(*) as rows from habits
union all select 'habits_backup', count(*) from habits_backup_20260928
union all select 'habit_logs', count(*) from habit_logs
union all select 'habit_logs_backup', count(*) from habit_logs_backup_20260928;

-- ---------------------------------------------------------------------------
-- STEP 1 - FIX HABIT ORDER
-- The old migration added order_index with DEFAULT 0, so the backfill
-- "WHERE order_index IS NULL" never matched and every habit ended up at 0.
-- All-ties means the swap-based reorder silently did nothing.
-- This renumbers every user's habits 0..n-1, preserving the visual order.
-- ---------------------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (
           partition by user_id
           order by order_index nulls last, sort_order nulls last, created_at, id
         ) - 1 as new_index
  from habits
)
update habits h
set order_index = r.new_index
from ranked r
where h.id = r.id
  and h.order_index is distinct from r.new_index;

select user_id, order_index, title from habits order by user_id, order_index;

-- Guardrail: one habit per slot per user, so duplicates can never come back.
-- DEFERRABLE so a single-statement renumber never trips on a transient duplicate.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_user_order_index_key'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits
      add constraint habits_user_order_index_key
      unique (user_id, order_index) deferrable initially deferred;
  end if;
end $$;
-- ---------------------------------------------------------------------------
-- STEP 2 - ATOMIC REORDER RPC
-- One call, one transaction: move a habit one slot up/down and renumber.
-- p_direction: -1 = up, +1 = down.
-- ---------------------------------------------------------------------------
create or replace function public.move_habit(
  p_habit_id uuid,
  p_direction integer
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_current integer;
  v_target integer;
begin
  if p_direction not in (-1, 1) then
    raise exception 'p_direction must be -1 or 1';
  end if;

  select user_id, order_index into v_user_id, v_current
  from public.habits
  where id = p_habit_id and user_id = auth.uid();

  if v_user_id is null then
    raise exception 'Habit not found';
  end if;

  v_target := v_current + p_direction;

  -- already at the top/bottom: nothing to do
  if not exists (
    select 1 from public.habits
    where user_id = v_user_id and order_index = v_target
  ) then
    return;
  end if;

  -- Give the moving habit a fractional sort key between its neighbours, then
  -- renumber the whole list. Deferred uniqueness lets this happen in one pass.
  with ordered as (
    select id,
           row_number() over (
             order by case
               when id = p_habit_id
                 then v_target::numeric + case when p_direction > 0 then 0.5 else -0.5 end
               else order_index::numeric
             end
           ) - 1 as new_index
    from public.habits
    where user_id = v_user_id
  )
  update public.habits h
  set order_index = o.new_index
  from ordered o
  where h.id = o.id;
end;
$$;

grant execute on function public.move_habit(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP 3 - ALLOW THE "SKIP" STATUS
-- 'skipped' = deliberately skipped (no penalty).
-- 'fail'    = missed (counts against you).
-- ---------------------------------------------------------------------------
alter table public.habit_logs drop constraint if exists habit_logs_status_check;
alter table public.habit_logs
  add constraint habit_logs_status_check
  check (status in ('success', 'partial', 'fail', 'skipped'));

-- ---------------------------------------------------------------------------
-- STEP 4 - VERIFY
-- ---------------------------------------------------------------------------
select count(*) as habits,
       count(order_index) as with_index,
       count(distinct (user_id, order_index)) as distinct_slots
from habits;

select status, count(*) from habit_logs group by status order by status;

select conname, condeferrable
from pg_constraint
where conrelid = 'public.habits'::regclass and contype = 'u';

-- ============================================================================
-- ROLLBACK (only if something looks wrong - run the block as-is)
-- ============================================================================
-- alter table public.habits drop constraint if exists habits_user_order_index_key;
-- alter table public.habit_logs drop constraint if exists habit_logs_status_check;
-- alter table public.habit_logs add constraint habit_logs_status_check
--   check (status in ('success', 'partial', 'fail'));
-- update public.habits h
--   set order_index = b.order_index, sort_order = b.sort_order
--   from habits_backup_20260928 b where h.id = b.id;
-- update public.habit_logs l
--   set status = b.status, note = b.note, log_date = b.log_date
--   from habit_logs_backup_20260928 b where l.id = b.id;
-- drop table if exists habits_backup_20260928;
-- drop table if exists habit_logs_backup_20260928;
