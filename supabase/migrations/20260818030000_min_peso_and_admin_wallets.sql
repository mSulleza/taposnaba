-- ---------------------------------------------------------------------------
-- 1. A paid task pays at least 2 pesos.
--
-- 0 stays valid and keeps its meaning: the task is unpaid. The floor applies to
-- tasks that DO pay, so the allowed set is {0} ∪ [2, 5000].
-- ---------------------------------------------------------------------------
update public.task_templates set peso_value = 2 where peso_value = 1;

alter table public.task_templates
  drop constraint if exists task_templates_peso_chk;
alter table public.task_templates
  add constraint task_templates_peso_chk
  check (peso_value = 0 or peso_value between 2 and 5000);

comment on column public.task_templates.peso_value is
  'What one approved completion pays, in whole pesos. 0 = unpaid; otherwise at least 2.';

-- create_adhoc_task validates its own input, so it needs the same floor.
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
  if p_peso_value <> 0 and (p_peso_value < 2 or p_peso_value > 5000) then
    raise exception 'value must be 0 (unpaid) or between 2 and 5000 pesos';
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

-- ---------------------------------------------------------------------------
-- 2. Admin view of every helper's wallet.
--
-- One round trip instead of three RPCs per helper. The month boundary is
-- computed in Manila: submitted_at is timestamptz and the session is UTC, so
-- a naive cast would drop work done in the first eight hours of the 1st.
-- ---------------------------------------------------------------------------
create or replace function public.admin_wallets()
returns table (
  helper_id  uuid,
  full_name  text,
  role       public.user_role,
  earned     integer,
  committed  integer,
  balance    integer,
  this_month integer,
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
