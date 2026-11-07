-- ---------------------------------------------------------------------------
-- Earnings: every task is worth a configurable amount in pesos. A helper
-- accumulates the value of each APPROVED submission and withdraws it, on
-- request, subject to admin approval.
--
-- Money rules that the rest of the app depends on:
--   * The amount is snapshotted onto the completion at submission time, so
--     re-pricing a template later never rewrites what someone already earned.
--   * Only an APPROVED completion counts. Pending and rejected earn nothing.
--   * An admin bypass earns nobody anything — the admin did the work.
--   * A payout that is not rejected holds its amount against the balance, so
--     the same peso cannot be requested twice.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. What a task is worth
-- ---------------------------------------------------------------------------
alter table public.task_templates
  add column if not exists peso_value integer not null default 0;

alter table public.task_templates
  drop constraint if exists task_templates_peso_chk;
alter table public.task_templates
  add constraint task_templates_peso_chk check (peso_value between 0 and 5000);

comment on column public.task_templates.peso_value is
  'What one completion of this task is worth, in whole pesos. Editable in Admin → Tasks.';

-- What THIS completion actually earned (snapshot; 0 for an admin bypass).
alter table public.task_completions
  add column if not exists peso_value integer not null default 0;

comment on column public.task_completions.peso_value is
  'Pesos earned by this completion, frozen at submission time. 0 when admin_override.';

-- Earnings are summed per submitter over approved rows.
create index if not exists task_completions_earnings_idx
  on public.task_completions (submitted_by, review_status)
  where review_status = 'approved';

-- ---------------------------------------------------------------------------
-- 2. Snapshot the value at submission time
-- ---------------------------------------------------------------------------
create or replace function public.task_completions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inst  public.task_instances%rowtype;
  v_value integer;
begin
  select * into v_inst from public.task_instances where id = new.instance_id;
  if v_inst.id is null then
    raise exception 'task instance not found';
  end if;
  if v_inst.status in ('approved', 'skipped') then
    raise exception 'task is already % — nothing more to submit', v_inst.status;
  end if;
  if v_inst.window_start > public.manila_today() then
    raise exception 'this task cannot be submitted yet (opens %)', v_inst.window_start;
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
  select t.peso_value into v_value
    from public.task_templates t
   where t.id = v_inst.template_id;
  new.peso_value := case when new.admin_override then 0 else coalesce(v_value, 0) end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Payouts
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'payout_status') then
    create type public.payout_status as enum ('requested', 'approved', 'paid', 'rejected');
  end if;
end $$;

create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  helper_id    uuid not null references public.profiles (id) on delete cascade,
  amount       integer not null,
  status       public.payout_status not null default 'requested',
  note         text,                                    -- the helper's message
  requested_at timestamptz not null default now(),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,                                    -- the admin's message
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint payouts_amount_chk check (amount > 0)
);

create index if not exists payouts_helper_idx on public.payouts (helper_id, requested_at desc);
create index if not exists payouts_open_idx   on public.payouts (status, requested_at)
  where status in ('requested', 'approved');

drop trigger if exists payouts_set_updated_at on public.payouts;
create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

alter table public.payouts enable row level security;

-- Your own payouts, or everything if you are an admin. There is deliberately
-- no INSERT/UPDATE policy: payouts move only through the RPCs below, which
-- enforce the balance and the status transitions.
drop policy if exists "payouts: read own or admin" on public.payouts;
create policy "payouts: read own or admin"
  on public.payouts for select to authenticated
  using (helper_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Balance
-- ---------------------------------------------------------------------------

-- Guard shared by the three readers below: you may look at your own money,
-- an admin may look at anyone's.
create or replace function public.assert_can_read_wallet(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_uid is null or (p_uid <> auth.uid() and not public.is_admin()) then
    raise exception 'not allowed to read this wallet' using errcode = '42501';
  end if;
end;
$$;

/** Everything ever earned from approved submissions. */
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
  );
end;
$$;

/** Money already spoken for: every payout that has not been rejected. */
create or replace function public.helper_payouts_committed(p_uid uuid default null)
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
    select coalesce(sum(p.amount), 0)::integer
      from public.payouts p
     where p.helper_id = v_uid
       and p.status <> 'rejected'
  );
end;
$$;

/** What can actually be withdrawn right now. */
create or replace function public.helper_balance(p_uid uuid default null)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
begin
  return public.helper_earned_total(v_uid) - public.helper_payouts_committed(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Requesting and reviewing a payout
-- ---------------------------------------------------------------------------

/** Helper: ask the admin to pay out some or all of the balance. */
create or replace function public.request_payout(
  p_amount integer,
  p_note   text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance integer;
  v_row     public.payouts;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  -- Serialise concurrent requests from the same person against their own
  -- profile row, so two taps cannot both pass the balance check and overdraw.
  perform 1 from public.profiles where id = v_uid for update;

  v_balance := public.helper_balance(v_uid);
  if p_amount > v_balance then
    raise exception 'you can withdraw at most % right now', v_balance;
  end if;

  insert into public.payouts (helper_id, amount, note)
  values (v_uid, p_amount, nullif(btrim(p_note), ''))
  returning * into v_row;
  return v_row;
end;
$$;

/**
 * Admin: move a payout along. 'approved' = agreed but not handed over yet,
 * 'paid' = money actually given, 'rejected' = declined (releases the hold).
 */
create or replace function public.review_payout(
  p_payout_id uuid,
  p_decision  text,
  p_note      text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.payouts;
  v_cur public.payout_status;
begin
  if not public.is_admin() then
    raise exception 'only admins can review payouts' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'paid', 'rejected') then
    raise exception 'decision must be approved, paid or rejected';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'a note is required when rejecting a payout';
  end if;

  select status into v_cur from public.payouts where id = p_payout_id for update;
  if v_cur is null then
    raise exception 'payout not found';
  end if;
  -- Settled money does not move again; reopening it would silently re-credit
  -- or re-debit a balance someone has already been paid against.
  if v_cur in ('paid', 'rejected') then
    raise exception 'this payout is already % and cannot be changed', v_cur;
  end if;

  update public.payouts
     set status      = p_decision::public.payout_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = coalesce(nullif(btrim(p_note), ''), review_note),
         paid_at     = case when p_decision = 'paid' then now() else paid_at end
   where id = p_payout_id
   returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
grant all on public.payouts to authenticated, service_role;

revoke execute on function public.assert_can_read_wallet(uuid) from public, anon;
grant execute on function public.helper_earned_total(uuid)       to authenticated, service_role;
grant execute on function public.helper_payouts_committed(uuid)  to authenticated, service_role;
grant execute on function public.helper_balance(uuid)            to authenticated, service_role;
grant execute on function public.request_payout(integer, text)   to authenticated, service_role;
grant execute on function public.review_payout(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Price the templates that already exist.
--
-- On a fresh install seed.sql carries these values. On a database that was
-- seeded before this migration every template would otherwise sit at 0, and
-- re-running seed.sql to fix that would also revert any title, schedule or
-- grace edits made in Admin → Tasks. So set the price and nothing else, and
-- only where it has not been set yet.
-- ---------------------------------------------------------------------------
update public.task_templates t
   set peso_value = v.value
  from (values
    ('daily-aircon-on', 1), ('daily-mop', 3), ('daily-water-fountain', 1),
    ('daily-food-dispenser', 1), ('daily-litter-tray', 1), ('daily-litter-sand', 1),
    ('daily-poop-check', 1), ('daily-accidents', 2), ('daily-equipment-check', 1),
    ('daily-eye-discharge', 1), ('daily-play', 2), ('daily-aircon-off', 1),
    ('mon-comb-cats', 6),
    ('mon-fri-refill-litter-sand', 3), ('mon-fri-litter-plastic', 4),
    ('mon-fri-fountain-water', 3), ('mon-fri-refill-food', 2),
    ('fri-vacuum', 12), ('fri-wipe-items', 6), ('fri-wipe-fountain-area', 4),
    ('fri-mop-walls', 8),
    ('monthly-wash-fountains', 10), ('monthly-fountain-filter', 5),
    ('monthly-nail-trim', 12), ('monthly-wash-food-dispenser', 8),
    ('bimonthly-wash-litter-boxes', 500)
  ) as v(slug, value)
 where t.slug = v.slug
   and t.peso_value = 0;
