-- ---------------------------------------------------------------------------
-- Paying for work an admin recorded on the helper's behalf
--
-- The bypass was built on the assumption that "the admin marked it done" means
-- "the admin did it", so it forced `peso_value = 0` and filed the completion
-- under the admin. In practice it is used the other way round: the helper did
-- the work and could not photograph it, so the admin records it. Under the old
-- rule that silently cost the helper the money — ₱500 for the litter-box wash
-- alone.
--
-- Three changes:
--   1. `sole_helper()` — the household has one helper; resolve them by role
--      instead of making every caller pass an id.
--   2. `admin_complete_task` takes WHO did it and WHETHER it pays, defaulting
--      to the helper, paid.
--   3. `set_completion_paid` can now pay a bypassed completion: it prices the
--      row from the template and moves the credit to the helper, because a
--      completion frozen at ₱0 and filed under the admin cannot pay anyone by
--      merely clearing a flag.
-- ---------------------------------------------------------------------------

-- The one helper, when there is exactly one. Null if there are none or several,
-- which makes the callers below demand an explicit id rather than guess.
create or replace function public.sole_helper()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_n  integer;
  v_id uuid;
begin
  select count(*) into v_n from public.profiles where role = 'helper';
  if v_n <> 1 then
    return null;
  end if;
  select id into v_id from public.profiles where role = 'helper';
  return v_id;
end;
$$;

grant execute on function public.sole_helper() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. The bypass now records who did it, and pays them
--
-- Dropped rather than overloaded: a two-argument call would otherwise keep
-- resolving to the old body and silently pay nobody.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_complete_task(uuid, text);

create or replace function public.admin_complete_task(
  p_instance_id uuid,
  p_reason      text,
  p_done_by     uuid default null,   -- defaults to the helper
  p_pay         boolean default true
)
returns public.task_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_reason  text := nullif(btrim(p_reason), '');
  v_done_by uuid := coalesce(p_done_by, public.sole_helper());
  v_pay     boolean := coalesce(p_pay, true);
  v_value   integer;
  v_row     public.task_completions;
begin
  if not public.is_admin() then
    raise exception 'only admins can bypass tasks' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'a reason is required when bypassing a task';
  end if;
  v_reason := left(v_reason, 500);

  if v_done_by is null then
    raise exception 'who did this task? there is no single helper to assume';
  end if;
  if not exists (select 1 from public.profiles where id = v_done_by) then
    raise exception 'that person does not exist';
  end if;

  select t.peso_value into v_value
    from public.task_instances i
    join public.task_templates t on t.id = i.template_id
   where i.id = p_instance_id;

  -- The BEFORE INSERT trigger forces review_status to 'pending', clears the
  -- reviewer columns and zeroes the price on an override; the AFTER INSERT
  -- trigger points the instance at this completion. Both are corrected below,
  -- inside the same transaction.
  insert into public.task_completions (instance_id, submitted_by, note, admin_override)
  values (p_instance_id, v_done_by, v_reason, true)
  returning * into v_row;

  update public.task_completions
     set review_status = 'approved'::public.review_status,
         reviewed_by   = v_uid,
         reviewed_at   = now(),
         peso_value    = case when v_pay then coalesce(v_value, 0) else 0 end,
         unpaid        = not v_pay
   where id = v_row.id
   returning * into v_row;

  update public.task_instances
     set status     = 'approved'::public.instance_status,
         updated_by = v_uid
   where id = v_row.instance_id;

  return v_row;
end;
$$;

revoke execute on function public.admin_complete_task(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.admin_complete_task(uuid, text, uuid, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Paying a completion that was frozen at zero
--
-- Clearing `unpaid` is enough for an ordinary submission — it carries its own
-- snapshotted price and is already filed under the helper. A bypass carries
-- neither, so paying one has to price it from the template AND move the credit,
-- or the money would land in the admin's own wallet.
-- ---------------------------------------------------------------------------
drop function if exists public.set_completion_paid(uuid, boolean);

create or replace function public.set_completion_paid(
  p_completion_id uuid,
  p_pay           boolean,
  p_credit_to     uuid default null  -- defaults to the helper on a bypass
)
returns public.task_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.task_completions;
  v_value  integer;
  v_credit uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can change a payout' using errcode = '42501';
  end if;
  if p_pay is null then
    raise exception 'p_pay is required';
  end if;

  select * into v_row from public.task_completions where id = p_completion_id;
  if v_row.id is null then
    raise exception 'completion not found';
  end if;
  -- Pending work has not been decided yet and rejected work earns nothing;
  -- either way there is no payment here to include or withhold.
  if v_row.review_status <> 'approved' then
    raise exception 'only an approved completion can be paid or withheld (this one is %)',
      v_row.review_status;
  end if;

  if not p_pay then
    update public.task_completions set unpaid = true
     where id = p_completion_id
     returning * into v_row;
    return v_row;
  end if;

  -- What it should pay: its own snapshot if it has one, otherwise the
  -- template's price today (a bypass was frozen at zero).
  v_value := v_row.peso_value;
  if coalesce(v_value, 0) = 0 then
    select t.peso_value into v_value
      from public.task_instances i
      join public.task_templates t on t.id = i.template_id
     where i.id = v_row.instance_id;
  end if;
  if coalesce(v_value, 0) = 0 then
    raise exception 'this task is worth nothing — give it a value in Admin → Tasks first';
  end if;

  -- Who it should pay. A bypass is filed under the admin who recorded it, so
  -- paying it as-is would credit them for the helper's work.
  v_credit := coalesce(
    p_credit_to,
    case when v_row.admin_override then public.sole_helper() else v_row.submitted_by end
  );
  if v_credit is null then
    raise exception 'who should be paid? there is no single helper to assume';
  end if;
  if not exists (select 1 from public.profiles where id = v_credit) then
    raise exception 'that person does not exist';
  end if;

  update public.task_completions
     set unpaid       = false,
         peso_value   = v_value,
         submitted_by = v_credit
   where id = p_completion_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.set_completion_paid(uuid, boolean, uuid)
  to authenticated, service_role;
