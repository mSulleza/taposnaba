-- ---------------------------------------------------------------------------
-- Earnings outlook: what is on the table today, and for the whole month, if
-- every task gets done and approved.
--
-- "Potential" is the value of the tasks themselves, so it is the same figure
-- for anyone who could do them; "earned" is this caller's approved share of
-- them. Both are keyed on the instance's due_date so the two numbers are
-- directly comparable — a fraction of the same denominator.
--
-- Skipped tasks are excluded from potential: nobody can earn them any more, so
-- leaving them in would show a target that can never be reached.
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
  select
    coalesce(sum(t.peso_value) filter (
      where i.due_date = v_today and i.status <> 'skipped'), 0)::integer,
    coalesce(sum(c.peso_value) filter (
      where i.due_date = v_today and c.review_status = 'approved' and c.submitted_by = v_uid), 0)::integer,
    coalesce(sum(t.peso_value) filter (
      where i.status <> 'skipped'), 0)::integer,
    coalesce(sum(c.peso_value) filter (
      where c.review_status = 'approved' and c.submitted_by = v_uid), 0)::integer
  from public.task_instances i
  join public.task_templates t on t.id = i.template_id
  -- The instance's own latest completion, so a task counts once even after a
  -- reject-and-resubmit cycle has produced several rows for it.
  left join public.task_completions c on c.id = i.latest_completion_id
  where i.due_date between v_month_start and v_month_end;
end;
$$;

grant execute on function public.earnings_outlook(uuid) to authenticated, service_role;
