-- ============================================================================
-- Habit Tracker - effective-dated criteria history
-- Run once in the Supabase SQL editor AFTER the existing order/RPC/skip
-- migration. This uses one JSONB field on habits rather than a new table:
-- criteria updates are rare, and every screen already loads the habit row.
-- ============================================================================

-- Optional safety snapshot. Keep it until historical labels look correct.
create table if not exists habits_backup_20260930 as select * from public.habits;

alter table public.habits
  add column if not exists criteria_history jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habits_criteria_history_array_check'
      and conrelid = 'public.habits'::regclass
  ) then
    alter table public.habits
      add constraint habits_criteria_history_array_check
      check (jsonb_typeof(criteria_history) = 'array');
  end if;
end $$;

-- Baseline every existing habit at its original start date. Newer app versions
-- add another object only when the user explicitly upgrades the criteria.
update public.habits
set criteria_history = jsonb_build_array(
  jsonb_build_object(
    'effective_date', start_date::text,
    'success_label', success_label,
    'partial_label', partial_label,
    'fail_label', fail_label
  )
)
where criteria_history is null
   or criteria_history = '[]'::jsonb;

-- Verify each habit has a baseline. The app resolves the latest effective date
-- on or before the displayed/logged date, so backfilled old dates stay correct.
select id, title, start_date, criteria_history
from public.habits
order by user_id, order_index, created_at;

-- Rollback (only if needed; restoring the snapshot also restores old labels):
-- alter table public.habits drop constraint if exists habits_criteria_history_array_check;
-- alter table public.habits drop column if exists criteria_history;