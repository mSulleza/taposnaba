-- ---------------------------------------------------------------------------
-- Changing your mind about paying, after the approval
--
-- `review_completion` can already flip `unpaid` on a second pass, but it is the
-- wrong tool here: it rewrites `review_note` from its own argument, so calling
-- it just to toggle the money would silently erase the note the admin left the
-- helper. It also re-stamps the review, which would shuffle the "recently
-- reviewed" list under the admin's finger.
--
-- This does one thing: flip whether an already-approved completion counts as
-- earnings. The QA decision, its note, its timestamp and its reviewer all stay
-- exactly as they were — only the money moves.
-- ---------------------------------------------------------------------------
create or replace function public.set_completion_paid(
  p_completion_id uuid,
  p_pay           boolean
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

  update public.task_completions
     set unpaid = not p_pay
   where id = p_completion_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.set_completion_paid(uuid, boolean)
  to authenticated, service_role;
