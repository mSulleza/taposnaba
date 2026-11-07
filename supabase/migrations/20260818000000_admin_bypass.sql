-- ---------------------------------------------------------------------------
-- Admin bypass: mark a task done without helper evidence.
--
-- Admins sometimes do a task themselves, or know for certain it was done when
-- the helper could not photograph it. Before this, the only options were to
-- skip it (which reads as "did not happen") or to have the helper fake
-- evidence. A bypass records a real completion, but one that is permanently
-- and visibly stamped as an admin override so it can never be mistaken for a
-- helper's photographed submission.
-- ---------------------------------------------------------------------------

alter table public.task_completions
  add column if not exists admin_override boolean not null default false;

comment on column public.task_completions.admin_override is
  'True when an admin marked the task done directly, bypassing photo evidence and QA. Never set by the helper submission path.';

-- Partial index: overrides are rare, and this is what audit views filter on.
create index if not exists task_completions_override_idx
  on public.task_completions (instance_id)
  where admin_override;

-- ---------------------------------------------------------------------------
-- Admin: complete an instance outright, with no photos and no QA round trip.
--
-- A reason is mandatory — the whole point is that the record explains itself.
-- The instance's own guards still apply (the BEFORE INSERT trigger refuses an
-- already approved/skipped task, and one whose window has not opened yet), so
-- this bypasses the *evidence* rules, not the scheduling rules.
-- ---------------------------------------------------------------------------
create or replace function public.admin_complete_task(
  p_instance_id uuid,
  p_reason      text
)
returns public.task_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_reason text := nullif(btrim(p_reason), '');
  v_row    public.task_completions;
begin
  if not public.is_admin() then
    raise exception 'only admins can bypass tasks' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'a reason is required when bypassing a task';
  end if;
  v_reason := left(v_reason, 500);

  -- The BEFORE INSERT trigger forces review_status to 'pending' and clears the
  -- reviewer columns, and the AFTER INSERT trigger points the instance at this
  -- completion. Both then get corrected below, inside the same transaction.
  insert into public.task_completions (instance_id, submitted_by, note, admin_override)
  values (p_instance_id, v_uid, v_reason, true)
  returning * into v_row;

  update public.task_completions
     set review_status = 'approved'::public.review_status,
         reviewed_by   = v_uid,
         reviewed_at   = now()
   where id = v_row.id
   returning * into v_row;

  update public.task_instances
     set status     = 'approved'::public.instance_status,
         updated_by = v_uid
   where id = v_row.instance_id;

  return v_row;
end;
$$;

revoke execute on function public.admin_complete_task(uuid, text) from public, anon;
grant execute on function public.admin_complete_task(uuid, text) to authenticated, service_role;
