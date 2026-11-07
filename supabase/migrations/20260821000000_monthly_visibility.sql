-- ---------------------------------------------------------------------------
-- Monthly tasks were invisible for most of the month.
--
-- A monthly template only materializes an instance on its own day, and
-- `getTodayBuckets` only ever showed instances whose window had already opened.
-- So "wash the litter boxes" (1st of every second month) or "wash the water
-- fountains" (15th + 30th) simply did not exist on the helper's Today page on
-- any other day — and when the helper did the work early there was nothing to
-- submit against, so it earned nothing.
--
-- Two changes here:
--   1. `early_submit_days()` — a monthly task may be submitted up to this many
--      days before its window opens. Daily/weekly tasks are unaffected: letting
--      those be submitted early would let a helper bank three weeks of daily
--      tasks in one sitting.
--   2. The bimonthly litter-box anchor is pinned to a fixed date. The seed used
--      to recompute `anchor_month` as "next month" on every re-run, which
--      flipped the every-2-months parity each time and could defer the task
--      forever. `supabase/seed.sql` no longer overwrites the anchor on
--      conflict; this repairs whatever the drift already produced.
-- ---------------------------------------------------------------------------

-- How early a monthly task may be submitted. Mirrored in TypeScript as
-- UPCOMING_DAYS in src/lib/queries.ts — keep the two numbers equal, or the
-- helper sees a task in "Paparating" that the database then refuses.
create or replace function public.early_submit_days()
returns integer
language sql
immutable
set search_path = ''
as $$ select 21 $$;

comment on function public.early_submit_days() is
  'How many days before its window opens a MONTHLY task may be submitted.';

-- Same trigger as 20260818010000_earnings.sql, with the window check relaxed
-- for monthly recurrences only.
create or replace function public.task_completions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inst    public.task_instances%rowtype;
  v_tpl     public.task_templates%rowtype;
  v_earliest date;
  v_value   integer;
begin
  select * into v_inst from public.task_instances where id = new.instance_id;
  if v_inst.id is null then
    raise exception 'task instance not found';
  end if;
  if v_inst.status in ('approved', 'skipped') then
    raise exception 'task is already % — nothing more to submit', v_inst.status;
  end if;

  select * into v_tpl from public.task_templates where id = v_inst.template_id;

  -- A monthly task may be done ahead of its date; anything else may not.
  v_earliest := case
    when v_tpl.recurrence = 'monthly'
      then v_inst.window_start - public.early_submit_days()
    else v_inst.window_start
  end;
  if v_earliest > public.manila_today() then
    raise exception 'this task cannot be submitted yet (opens %)', v_earliest;
  end if;

  if new.submitted_by is null then
    new.submitted_by := auth.uid();
  end if;
  new.review_status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;

  -- Freeze the price. An admin bypass is worth nothing to anyone: the point of
  -- a bypass is that the admin did the task, not the helper.
  new.peso_value := case when new.admin_override then 0 else coalesce(v_tpl.peso_value, 0) end;

  return new;
end;
$$;

-- Repair the drifted anchor. 2026-09-01 is the cycle the task was seeded with
-- (Sep, Nov, Jan, …); re-running the seed can only have pushed it later.
-- Guarded so this is a no-op when the anchor is already right — changing it
-- fires the schedule-change trigger, which deletes future pending instances.
update public.task_templates
   set anchor_month = date '2026-09-01'
 where slug = 'bimonthly-wash-litter-boxes'
   and recurrence = 'monthly'
   and anchor_month <> date '2026-09-01';
