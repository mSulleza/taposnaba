-- ============================================================================
-- tapos na ba? — cat-care task tracker with photo evidence + QA
-- Initial schema. Timezone for all "today" logic is Asia/Manila.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'helper');
create type public.recurrence_kind as enum ('daily', 'weekly', 'monthly');
create type public.time_of_day as enum ('morning', 'anytime', 'evening');
create type public.task_category as enum (
  'cleaning', 'aircon', 'water', 'food', 'litter', 'health', 'grooming', 'play', 'equipment', 'other'
);
create type public.instance_status as enum ('pending', 'submitted', 'approved', 'rejected', 'skipped');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.issue_category as enum ('health', 'equipment', 'supplies', 'other');
create type public.issue_status as enum ('open', 'acknowledged', 'resolved');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.manila_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.user_role not null default 'helper',
  locale      text not null default 'tl' check (locale in ('tl', 'en')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- The very first user to be created becomes admin; everyone after that is a
-- helper unless app_metadata.role says otherwise (set by the admin "create
-- user" flow, which uses the service role).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   public.user_role;
  v_name   text;
  v_locale text;
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';
  elsif (new.raw_app_meta_data ->> 'role') in ('admin', 'helper') then
    v_role := (new.raw_app_meta_data ->> 'role')::public.user_role;
  else
    v_role := 'helper';
  end if;

  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_locale := case
    when (new.raw_user_meta_data ->> 'locale') in ('tl', 'en') then new.raw_user_meta_data ->> 'locale'
    else 'tl'
  end;

  insert into public.profiles (id, full_name, role, locale)
  values (new.id, v_name, v_role, v_locale)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Task templates (recurring definitions)
-- ---------------------------------------------------------------------------
create table public.task_templates (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique,                          -- stable key for seeds
  title_tl         text not null,
  title_en         text not null,
  description_tl   text,
  description_en   text,
  category         public.task_category not null default 'other',
  recurrence       public.recurrence_kind not null,
  weekdays         smallint[] not null default '{}',     -- 0=Sun … 6=Sat (weekly)
  month_days       smallint[] not null default '{}',     -- 1..31, clamped to month end (monthly)
  interval_months  smallint not null default 1,          -- monthly: every N months from anchor_month
  anchor_month     date not null default date_trunc('month', now() at time zone 'Asia/Manila')::date,
  time_of_day      public.time_of_day not null default 'anytime',
  due_time         time,                                 -- optional hint, e.g. 08:00
  grace_before     smallint not null default 0,          -- days task may be done early
  grace_after      smallint not null default 0,          -- days task may be done late
  evidence_required boolean not null default true,
  min_photos       smallint not null default 1,
  sort_order       integer not null default 100,
  active           boolean not null default true,
  starts_on        date not null default (now() at time zone 'Asia/Manila')::date,
  ends_on          date,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint task_templates_interval_chk   check (interval_months between 1 and 24),
  constraint task_templates_grace_chk      check (grace_before between 0 and 14 and grace_after between 0 and 14),
  constraint task_templates_min_photos_chk check (min_photos between 0 and 6),
  constraint task_templates_weekly_chk     check (recurrence <> 'weekly'  or cardinality(weekdays) > 0),
  constraint task_templates_monthly_chk    check (recurrence <> 'monthly' or cardinality(month_days) > 0),
  constraint task_templates_weekdays_rng   check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint task_templates_monthdays_rng  check (
    month_days <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]::smallint[]
  ),
  constraint task_templates_ends_chk       check (ends_on is null or ends_on >= starts_on)
);

create index task_templates_active_idx on public.task_templates (active, sort_order);

create trigger task_templates_set_updated_at
  before update on public.task_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Task instances (one row per template per scheduled date)
-- ---------------------------------------------------------------------------
create table public.task_instances (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid not null references public.task_templates (id) on delete cascade,
  scheduled_date       date not null,      -- the generated slot (unique per template)
  due_date             date not null,      -- effective date (admins may reschedule)
  window_start         date not null,
  window_end           date not null,
  status               public.instance_status not null default 'pending',
  latest_completion_id uuid,               -- FK added below
  skip_reason          text,
  updated_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint task_instances_unique_slot unique (template_id, scheduled_date),
  constraint task_instances_window_chk check (window_start <= due_date and due_date <= window_end)
);

create index task_instances_due_idx    on public.task_instances (due_date);
create index task_instances_window_idx on public.task_instances (window_start, window_end);
create index task_instances_status_idx on public.task_instances (status);

create trigger task_instances_set_updated_at
  before update on public.task_instances
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Completions (a submission of evidence for an instance) + QA review
-- ---------------------------------------------------------------------------
create table public.task_completions (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references public.task_instances (id) on delete cascade,
  submitted_by   uuid not null references public.profiles (id) on delete cascade,
  submitted_at   timestamptz not null default now(),
  note           text,
  review_status  public.review_status not null default 'pending',
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now()
);

create index task_completions_instance_idx on public.task_completions (instance_id, submitted_at desc);
create index task_completions_review_idx   on public.task_completions (review_status, submitted_at);

alter table public.task_instances
  add constraint task_instances_latest_completion_fk
  foreign key (latest_completion_id) references public.task_completions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Issues / reports (health concerns, broken equipment, low stock, other)
-- ---------------------------------------------------------------------------
create table public.issues (
  id               uuid primary key default gen_random_uuid(),
  reported_by      uuid not null references public.profiles (id) on delete cascade,
  category         public.issue_category not null default 'other',
  title            text not null,
  description      text,
  status           public.issue_status not null default 'open',
  acknowledged_by  uuid references public.profiles (id) on delete set null,
  acknowledged_at  timestamptz,
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index issues_status_idx on public.issues (status, created_at desc);

create trigger issues_set_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Photos (evidence) — belong to exactly one completion or one issue
-- ---------------------------------------------------------------------------
create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  completion_id  uuid references public.task_completions (id) on delete cascade,
  issue_id       uuid references public.issues (id) on delete cascade,
  storage_path   text not null unique,      -- path inside the 'evidence' bucket
  uploaded_by    uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),

  constraint photos_one_parent_chk check (
    (completion_id is not null)::int + (issue_id is not null)::int = 1
  )
);

create index photos_completion_idx on public.photos (completion_id);
create index photos_issue_idx      on public.photos (issue_id);

-- ---------------------------------------------------------------------------
-- Scheduling engine
-- ---------------------------------------------------------------------------

-- Is template t due on date d (ignoring starts_on/ends_on/active)?
create or replace function public.template_due_on(t public.task_templates, d date)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_dim    int;
  v_months int;
begin
  case t.recurrence
    when 'daily' then
      return true;
    when 'weekly' then
      return extract(dow from d)::smallint = any (t.weekdays);
    when 'monthly' then
      v_months := (extract(year from d)::int - extract(year from t.anchor_month)::int) * 12
                + (extract(month from d)::int - extract(month from t.anchor_month)::int);
      if v_months < 0 or (v_months % t.interval_months) <> 0 then
        return false;
      end if;
      v_dim := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;
      return exists (
        select 1 from unnest(t.month_days) md
        where least(md::int, v_dim) = extract(day from d)::int
      );
    else
      return false;
  end case;
end;
$$;

-- Materialize instances for all active templates over [p_from, p_to].
-- Idempotent: existing slots are left untouched. Returns number inserted.
create or replace function public.ensure_task_instances(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t        public.task_templates%rowtype;
  d        date;
  v_from   date;
  v_to     date;
  v_count  int := 0;
  v_ins    int;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_to < p_from then
    return 0;
  end if;
  if p_to - p_from > 92 then
    raise exception 'range too large (max 92 days)';
  end if;

  for t in
    select * from public.task_templates where active
  loop
    v_from := greatest(p_from, t.starts_on);
    v_to   := least(p_to, coalesce(t.ends_on, p_to));
    d := v_from;
    while d <= v_to loop
      if public.template_due_on(t, d) then
        insert into public.task_instances
          (template_id, scheduled_date, due_date, window_start, window_end)
        values
          (t.id, d, d, d - t.grace_before, d + t.grace_after)
        on conflict (template_id, scheduled_date) do nothing;
        get diagnostics v_ins = row_count;
        v_count := v_count + v_ins;
      end if;
      d := d + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- When a template's schedule changes (or it is deactivated), drop future
-- pending instances that have no submissions; they are regenerated on demand.
create or replace function public.task_templates_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.active, old.recurrence, old.weekdays, old.month_days, old.interval_months,
      old.anchor_month, old.grace_before, old.grace_after, old.starts_on, old.ends_on)
     is distinct from
     (new.active, new.recurrence, new.weekdays, new.month_days, new.interval_months,
      new.anchor_month, new.grace_before, new.grace_after, new.starts_on, new.ends_on)
  then
    delete from public.task_instances i
    where i.template_id = new.id
      and i.status = 'pending'
      and i.scheduled_date >= public.manila_today()
      and not exists (select 1 from public.task_completions c where c.instance_id = i.id);
  end if;
  return new;
end;
$$;

create trigger task_templates_after_update
  after update on public.task_templates
  for each row execute function public.task_templates_after_update();

-- ---------------------------------------------------------------------------
-- Completion + review workflow
-- ---------------------------------------------------------------------------

-- Guard: cannot submit for approved/skipped instances; stamp submitter.
create or replace function public.task_completions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.instance_status;
begin
  select status into v_status from public.task_instances where id = new.instance_id;
  if v_status is null then
    raise exception 'task instance not found';
  end if;
  if v_status in ('approved', 'skipped') then
    raise exception 'task is already % — nothing more to submit', v_status;
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

create trigger task_completions_before_insert
  before insert on public.task_completions
  for each row execute function public.task_completions_before_insert();

-- After a submission, the instance moves to 'submitted' and points at it.
create or replace function public.task_completions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.task_instances
     set status = 'submitted',
         latest_completion_id = new.id,
         updated_by = new.submitted_by
   where id = new.instance_id;
  return new;
end;
$$;

create trigger task_completions_after_insert
  after insert on public.task_completions
  for each row execute function public.task_completions_after_insert();

-- Admin QA decision.
create or replace function public.review_completion(
  p_completion_id uuid,
  p_decision      text,      -- 'approved' | 'rejected'
  p_note          text default null
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
    raise exception 'only admins can review' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'a note is required when rejecting';
  end if;

  update public.task_completions
     set review_status = p_decision::public.review_status,
         reviewed_by   = auth.uid(),
         reviewed_at   = now(),
         review_note   = nullif(btrim(p_note), '')
   where id = p_completion_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'completion not found';
  end if;

  -- Only the latest submission drives the instance status.
  update public.task_instances
     set status = p_decision::public.instance_status,
         updated_by = auth.uid()
   where id = v_row.instance_id
     and (latest_completion_id = v_row.id or latest_completion_id is null);

  return v_row;
end;
$$;

-- Admin: move an instance to another date (keeps its scheduled slot).
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
begin
  if not public.is_admin() then
    raise exception 'only admins can reschedule tasks' using errcode = '42501';
  end if;
  update public.task_instances
     set due_date     = p_due_date,
         window_start = least(window_start, p_due_date),
         window_end   = greatest(coalesce(p_window_end, p_due_date), p_due_date),
         updated_by   = auth.uid()
   where id = p_instance_id
   returning * into v_row;
  if v_row.id is null then
    raise exception 'instance not found';
  end if;
  return v_row;
end;
$$;

-- Map a completion's review status back to an instance status.
create or replace function public.instance_status_from_review(p_review public.review_status)
returns public.instance_status
language sql
immutable
set search_path = ''
as $$
  select case p_review
    when 'approved' then 'approved'::public.instance_status
    when 'rejected' then 'rejected'::public.instance_status
    else 'submitted'::public.instance_status
  end;
$$;

-- Admin: skip an instance (e.g. cats at the vet) or un-skip it.
create or replace function public.skip_task_instance(
  p_instance_id uuid,
  p_reason      text default null,
  p_undo        boolean default false
)
returns public.task_instances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.task_instances;
begin
  if not public.is_admin() then
    raise exception 'only admins can skip tasks' using errcode = '42501';
  end if;

  if p_undo then
    update public.task_instances i
       set status = coalesce((
                      select public.instance_status_from_review(c.review_status)
                      from public.task_completions c
                      where c.id = i.latest_completion_id
                    ), 'pending'),
           skip_reason = null,
           updated_by = auth.uid()
     where i.id = p_instance_id
     returning i.* into v_row;
  else
    update public.task_instances
       set status = 'skipped',
           skip_reason = nullif(btrim(p_reason), ''),
           updated_by = auth.uid()
     where id = p_instance_id
       and status <> 'approved'
     returning * into v_row;
  end if;

  if v_row.id is null then
    raise exception 'instance not found or already approved';
  end if;
  return v_row;
end;
$$;

-- Admin: create a one-off (ad-hoc) task for a date. Uses an inactive
-- template with recurrence 'daily' + starts_on = ends_on so it never
-- regenerates; returns the created instance.
create or replace function public.create_adhoc_task(
  p_title_tl  text,
  p_title_en  text,
  p_due_date  date,
  p_category  public.task_category default 'other',
  p_desc_tl   text default null,
  p_desc_en   text default null,
  p_evidence_required boolean default true,
  p_grace_after smallint default 0
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
  insert into public.task_templates
    (title_tl, title_en, description_tl, description_en, category, recurrence,
     grace_after, evidence_required, min_photos, active, starts_on, ends_on, created_by, sort_order)
  values
    (p_title_tl, coalesce(nullif(p_title_en, ''), p_title_tl), p_desc_tl, p_desc_en, p_category, 'daily',
     greatest(p_grace_after, 0), p_evidence_required, case when p_evidence_required then 1 else 0 end,
     false, p_due_date, p_due_date, auth.uid(), 999)
  returning * into v_t;

  insert into public.task_instances (template_id, scheduled_date, due_date, window_start, window_end, updated_by)
  values (v_t.id, p_due_date, p_due_date, p_due_date, p_due_date + greatest(p_grace_after, 0), auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Household model: every authenticated user can READ everything; helpers can
-- submit completions / photos / issues; admins manage everything else.
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.task_templates   enable row level security;
alter table public.task_instances   enable row level security;
alter table public.task_completions enable row level security;
alter table public.issues           enable row level security;
alter table public.photos           enable row level security;

-- profiles
create policy "profiles: read all (authenticated)"
  on public.profiles for select to authenticated using (true);
create policy "profiles: update own name/locale"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy "profiles: admin update any"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- task_templates
create policy "templates: read all"
  on public.task_templates for select to authenticated using (true);
create policy "templates: admin insert"
  on public.task_templates for insert to authenticated with check (public.is_admin());
create policy "templates: admin update"
  on public.task_templates for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "templates: admin delete"
  on public.task_templates for delete to authenticated using (public.is_admin());

-- task_instances (writes go through security-definer functions; admins may also edit directly)
create policy "instances: read all"
  on public.task_instances for select to authenticated using (true);
create policy "instances: admin insert"
  on public.task_instances for insert to authenticated with check (public.is_admin());
create policy "instances: admin update"
  on public.task_instances for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "instances: admin delete"
  on public.task_instances for delete to authenticated using (public.is_admin());

-- task_completions
create policy "completions: read all"
  on public.task_completions for select to authenticated using (true);
create policy "completions: insert own"
  on public.task_completions for insert to authenticated
  with check (submitted_by = auth.uid());
-- Reviews happen via review_completion(); no direct update policy for helpers.
create policy "completions: admin update"
  on public.task_completions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "completions: admin delete"
  on public.task_completions for delete to authenticated using (public.is_admin());

-- issues
create policy "issues: read all"
  on public.issues for select to authenticated using (true);
create policy "issues: insert own"
  on public.issues for insert to authenticated with check (reported_by = auth.uid());
create policy "issues: reporter update own open"
  on public.issues for update to authenticated
  using (reported_by = auth.uid() and status = 'open')
  with check (reported_by = auth.uid());
create policy "issues: admin update"
  on public.issues for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "issues: admin delete"
  on public.issues for delete to authenticated using (public.is_admin());

-- photos
create policy "photos: read all"
  on public.photos for select to authenticated using (true);
create policy "photos: insert own"
  on public.photos for insert to authenticated with check (uploaded_by = auth.uid());
create policy "photos: delete own or admin"
  on public.photos for delete to authenticated using (uploaded_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: private 'evidence' bucket. Path convention: {auth.uid()}/{yyyy-mm}/{uuid}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "evidence: read (authenticated)"
  on storage.objects for select to authenticated
  using (bucket_id = 'evidence');

create policy "evidence: upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "evidence: delete own or admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'evidence'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Grants (Supabase default roles)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
