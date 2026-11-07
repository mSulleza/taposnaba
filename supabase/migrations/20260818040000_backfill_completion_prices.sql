-- ---------------------------------------------------------------------------
-- Backfill: price completions that predate the earnings feature.
--
-- 20260818010000 added task_completions.peso_value with `default 0`, and the
-- BEFORE INSERT trigger only prices rows inserted after it. Every completion
-- submitted before that migration — including tasks a helper had already done
-- and had approved that same day — was therefore left at 0 and earned nothing.
--
-- Kept as a function rather than a bare UPDATE so the exact statement that runs
-- in production is the one the test suite exercises.
-- ---------------------------------------------------------------------------
create or replace function public.backfill_completion_prices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Only rows still sitting at 0, and never a bypass: a bypass is deliberately
  -- worth nothing and must not be retroactively turned into wages.
  with repriced as (
    update public.task_completions c
       set peso_value = t.peso_value
      from public.task_instances i
      join public.task_templates t on t.id = i.template_id
     where c.instance_id = i.id
       and c.peso_value = 0
       and c.admin_override = false
       and t.peso_value > 0
    returning c.id
  )
  select count(*)::integer into v_count from repriced;
  return v_count;
end;
$$;

comment on function public.backfill_completion_prices() is
  'Repair tool: prices completions left at 0 because they predate peso_value. Safe to re-run — it only touches unpriced, non-bypass rows — but note it uses the template''s CURRENT price, so it is meant for the one-off migration, not routine use.';

select public.backfill_completion_prices();

revoke execute on function public.backfill_completion_prices() from public, anon, authenticated;
