-- ============================================================================
-- Hardening pass:
--  * atomic submission (completion + photos) with server-side evidence rules
--  * atomic issue reporting (issue + photos)
--  * photos / issues RLS gaps closed
--  * no submitting before a task's window opens
--  * reschedule recomputes the grace window around the new due date
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Submissions may not happen before the window opens (defence in depth;
--    the RPC below checks too, but this also covers direct API inserts).
-- ---------------------------------------------------------------------------
create or replace function public.task_completions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inst public.task_instances%rowtype;
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
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Atomic submission. Photos are uploaded by the browser first; this records
--    the completion and its evidence in ONE transaction, and verifies that
--    every path really exists in the private bucket and lives in the caller's
--    own folder. Enforces the template's min_photos.
-- ---------------------------------------------------------------------------
create or replace function public.submit_completion(
  p_instance_id uuid,
  p_note        text default null,
  p_paths       text[] default '{}'
)
returns public.task_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_inst   public.task_instances%rowtype;
  v_tpl    public.task_templates%rowtype;
  v_need   int;
  v_paths  text[];
  v_path   text;
  v_row    public.task_completions;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_inst from public.task_instances where id = p_instance_id;
  if v_inst.id is null then
    raise exception 'task instance not found';
  end if;
  select * into v_tpl from public.task_templates where id = v_inst.template_id;

  -- de-duplicate while preserving order, cap at 12
  select array_agg(p order by ord) into v_paths
  from (
    select distinct on (p) p, ord
    from unnest(coalesce(p_paths, '{}')) with ordinality as u(p, ord)
    order by p, ord
  ) d;
  v_paths := coalesce(v_paths, '{}');
  if cardinality(v_paths) > 12 then
    raise exception 'too many photos (max 12)';
  end if;

  v_need := case when v_tpl.evidence_required then greatest(1, v_tpl.min_photos) else 0 end;
  if cardinality(v_paths) < v_need then
    raise exception 'this task needs at least % photo(s) as evidence', v_need;
  end if;

  foreach v_path in array v_paths loop
    if split_part(v_path, '/', 1) <> v_uid::text then
      raise exception 'photo % is not in your own folder', v_path using errcode = '42501';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'evidence' and o.name = v_path
    ) then
      raise exception 'photo % was not uploaded', v_path;
    end if;
  end loop;

  -- The BEFORE INSERT trigger enforces status/window rules.
  insert into public.task_completions (instance_id, submitted_by, note)
  values (p_instance_id, v_uid, nullif(btrim(p_note), ''))
  returning * into v_row;

  if cardinality(v_paths) > 0 then
    insert into public.photos (completion_id, storage_path, uploaded_by)
    select v_row.id, p, v_uid from unnest(v_paths) as p;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Atomic issue reporting (issue + its photos).
-- ---------------------------------------------------------------------------
create or replace function public.create_issue(
  p_title       text,
  p_category    public.issue_category default 'other',
  p_description text default null,
  p_paths       text[] default '{}'
)
returns public.issues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_paths text[];
  v_path  text;
  v_row   public.issues;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'a title is required';
  end if;

  select array_agg(p order by ord) into v_paths
  from (
    select distinct on (p) p, ord
    from unnest(coalesce(p_paths, '{}')) with ordinality as u(p, ord)
    order by p, ord
  ) d;
  v_paths := coalesce(v_paths, '{}');
  if cardinality(v_paths) > 6 then
    raise exception 'too many photos (max 6)';
  end if;

  foreach v_path in array v_paths loop
    if split_part(v_path, '/', 1) <> v_uid::text then
      raise exception 'photo % is not in your own folder', v_path using errcode = '42501';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'evidence' and o.name = v_path
    ) then
      raise exception 'photo % was not uploaded', v_path;
    end if;
  end loop;

  insert into public.issues (reported_by, category, title, description)
  values (v_uid, p_category, btrim(p_title), nullif(btrim(p_description), ''))
  returning * into v_row;

  if cardinality(v_paths) > 0 then
    insert into public.photos (issue_id, storage_path, uploaded_by)
    select v_row.id, p, v_uid from unnest(v_paths) as p;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Rescheduling recomputes the grace window around the new due date, so a
--    moved task stops appearing around its original date.
-- ---------------------------------------------------------------------------
create or replace function public.reschedule_task_instance(
  p_instance_id uuid,
  p_due_date    date,
  p_window_end  date default null
)
returns public.task_instances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.task_instances;
  v_tpl public.task_templates%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only admins can reschedule tasks' using errcode = '42501';
  end if;

  select t.* into v_tpl
  from public.task_templates t
  join public.task_instances i on i.template_id = t.id
  where i.id = p_instance_id;
  if v_tpl.id is null then
    raise exception 'instance not found';
  end if;

  update public.task_instances
     set due_date     = p_due_date,
         window_start = p_due_date - v_tpl.grace_before,
         window_end   = greatest(coalesce(p_window_end, p_due_date + v_tpl.grace_after), p_due_date),
         updated_by   = auth.uid()
   where id = p_instance_id
   returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS gaps
-- ---------------------------------------------------------------------------

-- Completions are only created through submit_completion(), which enforces the
-- evidence rules. Direct inserts would let a helper mark a task done with no
-- photos at all.
drop policy if exists "completions: insert own" on public.task_completions;

-- Issues are only created through create_issue().
drop policy if exists "issues: insert own" on public.issues;

-- A reporter may edit their own OPEN issue but not resolve it or forge the
-- reviewer columns — that is the admin's job.
drop policy if exists "issues: reporter update own open" on public.issues;
create policy "issues: reporter update own open"
  on public.issues for update to authenticated
  using (reported_by = auth.uid() and status = 'open')
  with check (
    reported_by = auth.uid()
    and status = 'open'
    and acknowledged_by is null
    and acknowledged_at is null
    and resolved_by is null
    and resolved_at is null
    and resolution_note is null
  );

-- Photo rows are written by the RPCs above (security definer). Direct inserts
-- must at minimum stay inside the caller's own storage folder and attach only
-- to the caller's own completion/issue.
drop policy if exists "photos: insert own" on public.photos;
create policy "photos: insert own"
  on public.photos for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and (
      (completion_id is not null and exists (
        select 1 from public.task_completions c
        where c.id = completion_id and c.submitted_by = auth.uid()
      ))
      or
      (issue_id is not null and exists (
        select 1 from public.issues i
        where i.id = issue_id and i.reported_by = auth.uid()
      ))
    )
  );

-- Evidence must not be deletable once it has been reviewed, and a helper must
-- not be able to strip photos off an approved submission.
drop policy if exists "photos: delete own or admin" on public.photos;
create policy "photos: delete own or admin"
  on public.photos for delete to authenticated
  using (
    public.is_admin()
    or (
      uploaded_by = auth.uid()
      and (
        completion_id is null
        or exists (
          select 1 from public.task_completions c
          where c.id = completion_id and c.review_status = 'pending'
        )
      )
    )
  );

-- Uploaded objects may only be removed by their owner while still unreferenced,
-- or by an admin. (The client cleans up orphans when a submission fails.)
drop policy if exists "evidence: delete own or admin" on storage.objects;
create policy "evidence: delete own or admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'evidence'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not exists (select 1 from public.photos p where p.storage_path = name)
      )
    )
  );

grant execute on function public.submit_completion(uuid, text, text[]) to authenticated, service_role;
grant execute on function public.create_issue(text, public.issue_category, text, text[]) to authenticated, service_role;
