-- ---------------------------------------------------------------------------
-- One-off tasks need a price too.
--
-- create_adhoc_task() predates peso_value, so every ad-hoc task was created at
-- 0 and — because its template is inactive and hidden from Admin → Tasks —
-- there was no way to price it afterwards. Adding the parameter with a default
-- of 0 keeps every existing caller working.
-- ---------------------------------------------------------------------------
-- Adding a defaulted parameter creates an OVERLOAD rather than replacing the
-- function, which makes every existing 4-argument call ambiguous. Drop the old
-- signature first.
drop function if exists public.create_adhoc_task(
  text, text, date, public.task_category, text, text, boolean, smallint
);

create or replace function public.create_adhoc_task(
  p_title_tl  text,
  p_title_en  text,
  p_due_date  date,
  p_category  public.task_category default 'other',
  p_desc_tl   text default null,
  p_desc_en   text default null,
  p_evidence_required boolean default true,
  p_grace_after smallint default 0,
  p_peso_value integer default 0
)
returns public.task_instances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t   public.task_templates;
  v_row public.task_instances;
begin
  if not public.is_admin() then
    raise exception 'only admins can create tasks' using errcode = '42501';
  end if;
  if p_peso_value < 0 or p_peso_value > 5000 then
    raise exception 'value must be between 0 and 5000 pesos';
  end if;

  insert into public.task_templates
    (title_tl, title_en, description_tl, description_en, category, recurrence,
     grace_after, evidence_required, min_photos, active, starts_on, ends_on,
     created_by, sort_order, peso_value)
  values
    (p_title_tl, coalesce(nullif(p_title_en, ''), p_title_tl), p_desc_tl, p_desc_en, p_category, 'daily',
     greatest(p_grace_after, 0), p_evidence_required, case when p_evidence_required then 1 else 0 end,
     false, p_due_date, p_due_date, auth.uid(), 999, p_peso_value)
  returning * into v_t;

  insert into public.task_instances (template_id, scheduled_date, due_date, window_start, window_end, updated_by)
  values (v_t.id, p_due_date, p_due_date, p_due_date, p_due_date + greatest(p_grace_after, 0), auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.create_adhoc_task(
  text, text, date, public.task_category, text, text, boolean, smallint, integer
) to authenticated, service_role;
