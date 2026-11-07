-- ---------------------------------------------------------------------------
-- 1. Paying a helper who never filed a request
--
-- The only way money left the wallet was `request_payout` (helper asks) then
-- `review_payout` (admin settles). In practice the cash often changes hands
-- first — the admin hands over ₱500 and only then opens the app. Without a way
-- to record that, the balance keeps showing money that has already been paid.
--
-- `admin_record_payout` writes a payout that is `paid` from the start. It is
-- the same money leaving the same wallet, so it runs the same balance check
-- under the same row lock as `request_payout`: an admin may record a payment,
-- not conjure one the helper never earned.
-- ---------------------------------------------------------------------------
-- Mirrors `task_completions.admin_override`: a row nobody requested has to say
-- so permanently, or the history reads as if the helper asked for it.
alter table public.payouts
  add column if not exists admin_recorded boolean not null default false;

comment on column public.payouts.admin_recorded is
  'True when an admin logged a payment the helper never requested.';

create or replace function public.admin_record_payout(
  p_helper_id uuid,
  p_amount    integer,
  p_note      text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_role    public.user_role;
  v_row     public.payouts;
begin
  if not public.is_admin() then
    raise exception 'only admins can record a payout' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  -- Serialise against a concurrent request_payout from the helper themselves,
  -- so the two cannot both pass the balance check and overdraw the wallet.
  select role into v_role from public.profiles where id = p_helper_id for update;
  if v_role is null then
    raise exception 'helper not found';
  end if;

  v_balance := public.helper_balance(p_helper_id);
  if p_amount > v_balance then
    raise exception 'that is more than the % available', v_balance;
  end if;

  insert into public.payouts
    (helper_id, amount, status, note, reviewed_by, reviewed_at, review_note, paid_at,
     admin_recorded)
  values
    (p_helper_id, p_amount, 'paid', null, auth.uid(), now(),
     nullif(btrim(p_note), ''), now(), true)
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.admin_record_payout(uuid, integer, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Outlook: count work on the day it was done, not only the day it was due
--
-- Both figures used to key on `due_date` alone. A monthly task submitted early
-- (see 20260821000000_monthly_visibility.sql) is due in a later month, so its
-- pesos landed in the wallet balance while this month's "earned" line ignored
-- them — the two numbers disagreed about the same money.
--
-- The window now also admits an instance whose latest completion was submitted
-- inside it. `earned` stays a subset of `potential` (both gain the same rows),
-- so "₱X of ₱Y" remains a fraction of one denominator. A task done early is
-- counted in the period it was done AND in the period it was due; that is the
-- honest reading of a task you can see on both days, and it counts once in
-- each, never twice in the same one.
-- ---------------------------------------------------------------------------
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
        and review_status = 'approved' and submitted_by = v_uid), 0)::integer,
    coalesce(sum(price) filter (
      where (due_date between v_month_start and v_month_end
             or done_on between v_month_start and v_month_end)
        and inst_status <> 'skipped'), 0)::integer,
    coalesce(sum(earned_value) filter (
      where (due_date between v_month_start and v_month_end
             or done_on between v_month_start and v_month_end)
        and review_status = 'approved' and submitted_by = v_uid), 0)::integer
  from rows
  where due_date between v_month_start and v_month_end
     or done_on  between v_month_start and v_month_end;
end;
$$;

grant execute on function public.earnings_outlook(uuid) to authenticated, service_role;
