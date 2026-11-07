-- ---------------------------------------------------------------------------
-- Approving without paying
--
-- Until now approval and payment were the same act: approve a completion and
-- its snapshotted `peso_value` counted, full stop. Some work genuinely lands in
-- between — done, but redone by someone else; done so late it was moot; done as
-- a favour nobody expects to be billed. The admin needed a way to say "yes,
-- this is done" without "and here is the money".
--
-- Represented as a flag rather than by zeroing `peso_value`, because the
-- snapshot is deliberately a record of what the task was worth (see the
-- Earnings rules in docs/ARCHITECTURE.md). Zeroing it would also make the row
-- indistinguishable from an unpriced one, and `backfill_completion_prices()`
-- would helpfully re-price it back into wages.
-- ---------------------------------------------------------------------------
alter table public.task_completions
  add column if not exists unpaid boolean not null default false;

comment on column public.task_completions.unpaid is
  'Approved, but the admin chose not to pay for it. peso_value keeps what the task was worth; every earnings sum skips the row.';

-- ---------------------------------------------------------------------------
-- 1. The decision itself
--
-- The old three-argument function is dropped rather than left alongside the new
-- one: adding a defaulted parameter creates an overload, and a three-argument
-- call would keep resolving to the old body, silently ignoring `p_pay`.
-- ---------------------------------------------------------------------------
drop function if exists public.review_completion(uuid, text, text);

create or replace function public.review_completion(
  p_completion_id uuid,
  p_decision      text,      -- 'approved' | 'rejected'
  p_note          text default null,
  p_pay           boolean default true
)
returns public.task_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.task_completions;
begin
  if not public.is_admin() then
    raise exception 'only admins can review' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'a note is required when rejecting';
  end if;

  update public.task_completions
     set review_status = p_decision::public.review_status,
         reviewed_by   = auth.uid(),
         reviewed_at   = now(),
         review_note   = nullif(btrim(p_note), ''),
         -- Only an approval can withhold payment; a rejection earns nothing by
         -- being rejected, and clearing the flag keeps a re-review honest.
         unpaid        = (p_decision = 'approved' and not coalesce(p_pay, true))
   where id = p_completion_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'completion not found';
  end if;

  -- Only the latest submission drives the instance status.
  update public.task_instances
     set status = p_decision::public.instance_status,
         updated_by = auth.uid()
   where id = v_row.instance_id
     and (latest_completion_id = v_row.id or latest_completion_id is null);

  return v_row;
end;
$$;

grant execute on function public.review_completion(uuid, text, text, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Every reader of the money has to agree
--
-- A sum that forgets `unpaid` pays out work the admin declined to pay for.
-- These are all of them: helper_earned_total (the wallet), admin_wallets (the
-- admin roll-up) and earnings_outlook (the Today/Earnings figures).
-- `getEarningsBreakdown` in src/lib/queries.ts filters the same way.
-- ---------------------------------------------------------------------------
create or replace function public.helper_earned_total(p_uid uuid default null)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
begin
  perform public.assert_can_read_wallet(v_uid);
  return (
    select coalesce(sum(c.peso_value), 0)::integer
      from public.task_completions c
     where c.submitted_by = v_uid
       and c.review_status = 'approved'
       and not c.unpaid
  );
end;
$$;

create or replace function public.admin_wallets()
returns table (
  helper_id     uuid,
  full_name     text,
  role          public.user_role,
  earned        integer,
  committed     integer,
  balance       integer,
  this_month    integer,
  open_requests integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz :=
    (date_trunc('month', public.manila_today())::timestamp at time zone 'Asia/Manila');
begin
  if not public.is_admin() then
    raise exception 'only admins can read wallets' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.role,
    coalesce(e.earned, 0)::integer,
    coalesce(c.committed, 0)::integer,
    (coalesce(e.earned, 0) - coalesce(c.committed, 0))::integer,
    coalesce(e.this_month, 0)::integer,
    coalesce(c.open_requests, 0)::integer
  from public.profiles p
  left join lateral (
    select sum(tc.peso_value) as earned,
           sum(tc.peso_value) filter (where tc.submitted_at >= v_month_start) as this_month
      from public.task_completions tc
     where tc.submitted_by = p.id
       and tc.review_status = 'approved'
       and not tc.unpaid
  ) e on true
  left join lateral (
    select sum(po.amount) as committed,
           count(*) filter (where po.status in ('requested', 'approved')) as open_requests
      from public.payouts po
     where po.helper_id = p.id
       and po.status <> 'rejected'
  ) c on true
  order by (coalesce(e.earned, 0) - coalesce(c.committed, 0)) desc, p.full_name;
end;
$$;

grant execute on function public.admin_wallets() to authenticated, service_role;

-- Potential deliberately keeps an unpaid approval in the denominator: the money
-- WAS on the table for that task, it just was not awarded. Dropping it from
-- both sides would quietly rewrite the day's target instead of showing a miss.
create or replace function public.earnings_outlook(p_uid uuid default null)
returns table (
  today_potential  integer,
  today_earned     integer,
  month_potential  integer,
  month_earned     integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := coalesce(p_uid, auth.uid());
  v_today       date := public.manila_today();
  v_month_start date := date_trunc('month', v_today)::date;
  v_month_end   date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
begin
  perform public.assert_can_read_wallet(v_uid);

  return query
  with rows as (
    select
      i.status as inst_status,
      t.peso_value as price,
      c.peso_value as earned_value,
      c.review_status,
      c.unpaid,
      c.submitted_by,
      i.due_date,
      -- The Manila day the work was handed in, if it ever was.
      (c.submitted_at at time zone 'Asia/Manila')::date as done_on
    from public.task_instances i
    join public.task_templates t on t.id = i.template_id
    -- The instance's own latest completion, so a task counts once even after a
    -- reject-and-resubmit cycle has produced several rows for it.
    left join public.task_completions c on c.id = i.latest_completion_id
  )
  select
    coalesce(sum(price) filter (
      where (due_date = v_today or done_on = v_today) and inst_status <> 'skipped'), 0)::integer,
    coalesce(sum(earned_value) filter (
      where (due_date = v_today or done_on = v_today)
        and review_status = 'approved' and not unpaid and submitted_by = v_uid), 0)::integer,
    coalesce(sum(price) filter (
      where (due_date between v_month_start and v_month_end
             or done_on between v_month_start and v_month_end)
        and inst_status <> 'skipped'), 0)::integer,
    coalesce(sum(earned_value) filter (
      where (due_date between v_month_start and v_month_end
             or done_on between v_month_start and v_month_end)
        and review_status = 'approved' and not unpaid and submitted_by = v_uid), 0)::integer
  from rows
  where due_date between v_month_start and v_month_end
     or done_on  between v_month_start and v_month_end;
end;
$$;

grant execute on function public.earnings_outlook(uuid) to authenticated, service_role;
