/**
 * Local verification of supabase/migrations + seed using PGlite (WASM Postgres).
 * Stubs the parts of a Supabase project the migration depends on (auth/storage
 * schemas, roles) and then exercises the scheduling engine + QA workflow.
 *
 *   npm run db:test
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");

const STUBS = `
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant select, insert, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
`;

async function main() {
  const db = new PGlite();
  const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    (await db.query<T>(sql, params)).rows;
  const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    (await q<T>(sql, params))[0];
  const as = async (uid: string | null, role = "authenticated") => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false)`);
  };

  console.log("→ applying stubs");
  await db.exec(STUBS);

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    console.log(`→ applying migration ${f}`);
    await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  // Pin "today" so the suite is deterministic whenever it runs (the seed and
  // several DB rules are relative to manila_today()).
  const pinToday = async (d: string) =>
    db.exec(
      `create or replace function public.manila_today() returns date language sql stable set search_path = '' as $fn$ select date '${d}' $fn$;`
    );
  await pinToday("2026-09-01");

  console.log("→ applying seed.sql");
  await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  // Seed twice to prove idempotency
  await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  const tplCount = await one<{ n: number }>("select count(*)::int n from public.task_templates");
  console.log(`  templates: ${tplCount.n}`);
  assert.equal(tplCount.n, 26, "expected 26 seeded templates");

  // anchor_month is computed from "today". If the ON CONFLICT clause overwrote
  // it, every re-seed walked it forward a month, flipping the parity of an
  // every-2-months task — which is why the litter-box wash never came due.
  const anchorBefore = await one<{ anchor_month: string }>(
    "select anchor_month::text from public.task_templates where slug = 'bimonthly-wash-litter-boxes'"
  );
  assert.equal(anchorBefore.anchor_month, "2026-09-01", "seeded anchor is the month it was seeded in");
  await pinToday("2026-11-05");
  await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  await pinToday("2026-09-01");
  const anchorAfter = await one<{ anchor_month: string }>(
    "select anchor_month::text from public.task_templates where slug = 'bimonthly-wash-litter-boxes'"
  );
  assert.equal(anchorAfter.anchor_month, "2026-09-01", "re-seeding must not move anchor_month");

  // Move "today" forward: the schedule now starts 2026-09-01 and the workflow
  // tests act on instances from the first three weeks of September.
  await pinToday("2026-09-20");

  // ---- users / profiles -------------------------------------------------
  console.log("→ users + profiles");
  const admin = await one<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ('mark@example.com', '{\"full_name\":\"Mark\"}') returning id"
  );
  const helper = await one<{ id: string }>(
    "insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('ate@example.com', '{\"role\":\"helper\"}', '{\"full_name\":\"Ate\",\"locale\":\"tl\"}') returning id"
  );
  const second = await one<{ id: string }>(
    "insert into auth.users (email) values ('someone@example.com') returning id"
  );
  const roles = await q<{ id: string; role: string; full_name: string }>(
    "select id, role, full_name from public.profiles order by created_at"
  );
  assert.equal(roles.find((r) => r.id === admin.id)?.role, "admin", "first user is admin");
  assert.equal(roles.find((r) => r.id === helper.id)?.role, "helper");
  assert.equal(roles.find((r) => r.id === second.id)?.role, "helper", "later users default to helper");
  assert.equal(roles.find((r) => r.id === second.id)?.full_name, "someone");

  await as(admin.id);
  assert.equal((await one<{ a: boolean }>("select public.is_admin() a")).a, true);
  await as(helper.id);
  assert.equal((await one<{ a: boolean }>("select public.is_admin() a")).a, false);

  // ---- scheduling engine ------------------------------------------------
  console.log("→ scheduling engine");
  await as(null);
  await assert.rejects(
    q("select public.ensure_task_instances('2026-09-01','2026-09-30')"),
    /not authenticated/,
    "anon cannot generate"
  );
  await as(null, "service_role");
  await q("select public.ensure_task_instances('2026-09-01','2026-09-30')");
  await as(helper.id);
  const again = await one<{ n: number }>(
    "select public.ensure_task_instances('2026-09-01','2026-09-30') n"
  );
  assert.equal(again.n, 0, "idempotent second run inserts nothing");

  const perSlug = async (slug: string, from: string, to: string) =>
    (
      await q<{ due_date: string }>(
        `select i.due_date::text from public.task_instances i join public.task_templates t on t.id = i.template_id
         where t.slug = $1 and i.scheduled_date between $2 and $3 order by i.due_date`,
        [slug, from, to]
      )
    ).map((r) => r.due_date);

  // September 2026: 30 days, Mondays = 7,14,21,28 ; Fridays = 4,11,18,25
  assert.equal((await perSlug("daily-mop", "2026-09-01", "2026-09-30")).length, 30);
  assert.deepEqual(await perSlug("mon-comb-cats", "2026-09-01", "2026-09-30"), [
    "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
  ]);
  assert.deepEqual(await perSlug("fri-vacuum", "2026-09-01", "2026-09-30"), [
    "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25",
  ]);
  assert.deepEqual(await perSlug("mon-fri-refill-food", "2026-09-01", "2026-09-30"), [
    "2026-09-04", "2026-09-07", "2026-09-11", "2026-09-14", "2026-09-18", "2026-09-21", "2026-09-25", "2026-09-28",
  ]);
  assert.deepEqual(await perSlug("monthly-wash-fountains", "2026-09-01", "2026-09-30"), ["2026-09-15", "2026-09-30"]);
  assert.deepEqual(await perSlug("monthly-fountain-filter", "2026-09-01", "2026-09-30"), ["2026-09-15"]);
  // every second month on the 22nd, anchored to the month it was seeded in
  assert.deepEqual(await perSlug("bimonthly-wash-litter-boxes", "2026-09-01", "2026-09-30"), ["2026-09-22"]);

  // grace windows on the 15th task
  const win = await one<{ window_start: string; window_end: string }>(
    `select i.window_start::text, i.window_end::text from public.task_instances i
     join public.task_templates t on t.id = i.template_id where t.slug = 'monthly-nail-trim' and i.due_date = '2026-09-15'`
  );
  assert.deepEqual(win, { window_start: "2026-09-14", window_end: "2026-09-16" });

  await q("select public.ensure_task_instances('2026-10-01','2026-11-30')");
  // October is an off month for an every-2-months task anchored in September
  assert.deepEqual(await perSlug("bimonthly-wash-litter-boxes", "2026-10-01", "2026-10-31"), []);
  assert.deepEqual(await perSlug("bimonthly-wash-litter-boxes", "2026-11-01", "2026-11-30"), ["2026-11-22"]);
  await q("select public.ensure_task_instances('2026-12-01','2026-12-31')");
  assert.deepEqual(await perSlug("bimonthly-wash-litter-boxes", "2026-12-01", "2026-12-31"), []);

  // February 2027 (28 days): the "30th" clamps to the 28th
  await q("select public.ensure_task_instances('2027-02-01','2027-02-28')");
  assert.deepEqual(await perSlug("monthly-wash-fountains", "2027-02-01", "2027-02-28"), ["2027-02-15", "2027-02-28"]);
  assert.deepEqual(await perSlug("monthly-wash-food-dispenser", "2027-02-01", "2027-02-28"), ["2027-02-28"]);

  // starts_on respected: nothing before the seeded start date
  await q("select public.ensure_task_instances('2026-08-01','2026-08-31')");
  const early = await one<{ n: number }>(
    "select count(*)::int n from public.task_instances where scheduled_date < '2026-09-01'"
  );
  assert.equal(early.n, 0, "no instances before starts_on");

  await assert.rejects(q("select public.ensure_task_instances('2026-01-01','2026-12-31')"), /range too large/);

  // ---- completion + review workflow ------------------------------------
  console.log("→ completion + QA workflow");
  const inst = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'daily-mop' and i.due_date = '2026-09-01'`
  );
  await as(helper.id);
  const c1 = await one<{ id: string }>(
    "insert into public.task_completions (instance_id, submitted_by, note) values ($1, $2, 'tapos na') returning id",
    [inst.id, helper.id]
  );
  let st = await one<{ status: string; latest_completion_id: string }>(
    "select status, latest_completion_id from public.task_instances where id = $1",
    [inst.id]
  );
  assert.equal(st.status, "submitted");
  assert.equal(st.latest_completion_id, c1.id);

  // helper cannot review
  await assert.rejects(q("select public.review_completion($1, 'approved')", [c1.id]), /only admins/);

  // admin rejects (note required)
  await as(admin.id);
  await assert.rejects(q("select public.review_completion($1, 'rejected', '')", [c1.id]), /note is required/);
  await q("select public.review_completion($1, 'rejected', 'blurry photo, please redo')", [c1.id]);
  st = await one("select status, latest_completion_id from public.task_instances where id = $1", [inst.id]);
  assert.equal(st.status, "rejected");

  // helper resubmits
  await as(helper.id);
  const c2 = await one<{ id: string }>(
    "insert into public.task_completions (instance_id, submitted_by) values ($1, $2) returning id",
    [inst.id, helper.id]
  );
  st = await one("select status, latest_completion_id from public.task_instances where id = $1", [inst.id]);
  assert.equal(st.status, "submitted");
  assert.equal(st.latest_completion_id, c2.id);

  // reviewing the OLD completion must not flip the instance status
  await as(admin.id);
  await q("select public.review_completion($1, 'approved')", [c1.id]);
  st = await one("select status from public.task_instances where id = $1", [inst.id]);
  assert.equal(st.status, "submitted", "old completion review does not drive status");

  await q("select public.review_completion($1, 'approved')", [c2.id]);
  st = await one("select status from public.task_instances where id = $1", [inst.id]);
  assert.equal(st.status, "approved");

  // no more submissions once approved
  await as(helper.id);
  await assert.rejects(
    q("insert into public.task_completions (instance_id, submitted_by) values ($1, $2)", [inst.id, helper.id]),
    /already approved/
  );

  // photos: exactly one parent
  await assert.rejects(
    q("insert into public.photos (storage_path, uploaded_by) values ('x/y.jpg', $1)", [helper.id]),
    /photos_one_parent_chk/
  );
  await q("insert into public.photos (completion_id, storage_path, uploaded_by) values ($1, $2, $3)", [
    c2.id, `${helper.id}/2026-09/a.jpg`, helper.id,
  ]);

  // skip / undo
  const inst2 = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'daily-play' and i.due_date = '2026-09-02'`
  );
  await assert.rejects(q("select public.skip_task_instance($1, 'vet day')", [inst2.id]), /only admins/);
  await as(admin.id);
  await q("select public.skip_task_instance($1, 'vet day')", [inst2.id]);
  st = await one("select status, skip_reason from public.task_instances where id = $1", [inst2.id]);
  assert.equal(st.status, "skipped");
  await as(helper.id);
  await assert.rejects(
    q("insert into public.task_completions (instance_id, submitted_by) values ($1, $2)", [inst2.id, helper.id]),
    /already skipped/
  );
  await as(admin.id);
  await q("select public.skip_task_instance($1, null, true)", [inst2.id]);
  st = await one("select status from public.task_instances where id = $1", [inst2.id]);
  assert.equal(st.status, "pending");

  // reschedule
  await q("select public.reschedule_task_instance($1, '2026-09-03')", [inst2.id]);
  const rs = await one<{ due_date: string; window_start: string; window_end: string; scheduled_date: string }>(
    "select due_date::text, window_start::text, window_end::text, scheduled_date::text from public.task_instances where id = $1",
    [inst2.id]
  );
  // the grace window moves with the task (template has no grace), while the
  // generated slot (scheduled_date) stays put so regeneration cannot duplicate it
  assert.deepEqual(rs, { due_date: "2026-09-03", window_start: "2026-09-03", window_end: "2026-09-03", scheduled_date: "2026-09-02" });
  // regeneration doesn't duplicate the moved slot
  const before = await one<{ n: number }>("select count(*)::int n from public.task_instances");
  await q("select public.ensure_task_instances('2026-09-01','2026-09-30')");
  const after = await one<{ n: number }>("select count(*)::int n from public.task_instances");
  assert.equal(before.n, after.n);

  // ad-hoc task
  const adhoc = await one<{ id: string; due_date: string }>(
    "select id, due_date::text from public.create_adhoc_task('Bilhin ang litter sand', 'Buy litter sand', '2026-09-05', 'other')"
  );
  assert.equal(adhoc.due_date, "2026-09-05");
  await q("select public.ensure_task_instances('2026-09-01','2026-09-30')");
  const adhocCount = await one<{ n: number }>(
    "select count(*)::int n from public.task_instances i join public.task_templates t on t.id=i.template_id where t.title_en='Buy litter sand'"
  );
  assert.equal(adhocCount.n, 1, "ad-hoc template does not regenerate");

  // A one-off task can carry a price like any other.
  const paidAdhoc = await one<{ id: string }>(
    `select id from public.create_adhoc_task('Hugasan ang bintana', 'Wash the windows',
       '2026-09-06', 'cleaning', null, null, true, 0::smallint, 75)`
  );
  const paidAdhocValue = await one<{ peso_value: number }>(
    `select t.peso_value from public.task_instances i
       join public.task_templates t on t.id = i.template_id where i.id = $1`,
    [paidAdhoc.id]
  );
  assert.equal(paidAdhocValue.peso_value, 75, "an ad-hoc task can be priced");
  await assert.rejects(
    q(`select public.create_adhoc_task('Masyadong mahal', 'Too pricey', '2026-09-07',
        'other', null, null, true, 0::smallint, 99999)`),
    /between 2 and 5000/,
    "an ad-hoc price is bounded like a template's"
  );
  // A paid task pays at least 2; 0 still means "unpaid" and stays allowed.
  await assert.rejects(
    q(`select public.create_adhoc_task('Barya', 'Peanuts', '2026-09-08',
        'other', null, null, true, 0::smallint, 1)`),
    /between 2 and 5000/,
    "1 peso is below the floor"
  );
  const freeAdhoc = await one<{ id: string }>(
    `select id from public.create_adhoc_task('Libre', 'Unpaid favour', '2026-09-09',
       'other', null, null, false, 0::smallint, 0)`
  );
  assert.ok(freeAdhoc.id, "0 is still allowed — it means unpaid");
  await assert.rejects(
    q("update public.task_templates set peso_value = 1 where slug = 'daily-mop'"),
    /task_templates_peso_chk/,
    "the floor is enforced on templates too"
  );
  const seedFloor = await one<{ n: number }>(
    "select count(*)::int n from public.task_templates where peso_value = 1"
  );
  assert.equal(seedFloor.n, 0, "nothing is priced below the floor");

  // ---- admin bypass -------------------------------------------------------
  console.log("\u2192 admin_complete_task RPC (bypass)");
  const bypassTarget = await one<{ id: string; need: number }>(
    `select i.id, greatest(1, t.min_photos) as need
       from public.task_instances i
       join public.task_templates t on t.id = i.template_id
      where i.status = 'pending'
        and t.evidence_required
        and i.window_start <= public.manila_today()
        and i.window_end   >= public.manila_today()
      limit 1`
  );
  assert.ok(bypassTarget.need >= 1, "target task really does demand evidence");

  await as(helper.id);
  await assert.rejects(
    q("select public.admin_complete_task($1, 'ako na gumawa')", [bypassTarget.id]),
    /only admins/,
    "a helper cannot bypass a task"
  );

  await as(admin.id);
  await assert.rejects(
    q("select public.admin_complete_task($1, '   ')", [bypassTarget.id]),
    /reason is required/,
    "a bypass without a reason is refused"
  );

  // Two helpers exist here, so the "record it for the helper" default has no
  // single answer and must refuse rather than pay the wrong person.
  await assert.rejects(
    q("select public.admin_complete_task($1, 'sino kaya')", [bypassTarget.id]),
    /no single helper to assume/,
    "with two helpers, who did it has to be said out loud"
  );
  assert.equal(
    (await one<{ h: string | null }>("select public.sole_helper()::text h")).h,
    null,
    "sole_helper() only answers when there is exactly one"
  );

  const bypassed = await one<{ id: string }>(
    "select id from public.admin_complete_task($1, 'Ako na mismo ang gumawa kagabi', $2)",
    [bypassTarget.id, helper.id]
  );
  const bc = await one<{
    admin_override: boolean;
    review_status: string;
    submitted_by: string;
    reviewed_by: string;
    note: string;
    photos: number;
  }>(
    `select c.admin_override, c.review_status::text, c.submitted_by::text, c.reviewed_by::text, c.note,
            (select count(*)::int from public.photos p where p.completion_id = c.id) as photos
       from public.task_completions c where c.id = $1`,
    [bypassed.id]
  );
  assert.equal(bc.admin_override, true, "the override is recorded on the completion");
  assert.equal(bc.review_status, "approved", "a bypass is approved outright");
  // A bypass records work SOMEONE did; the default is the helper, because the
  // admin recording it is almost always writing down the helper's work.
  assert.equal(bc.submitted_by, helper.id, "credited to the helper by default");
  assert.equal(bc.reviewed_by, admin.id, "…but recorded by the admin");
  assert.equal(bc.note, "Ako na mismo ang gumawa kagabi", "the reason is stored verbatim");
  assert.equal(bc.photos, 0, "evidence really was bypassed");

  // …and can be pointed at anyone, or made to pay nobody.
  const otherTarget = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
      where i.status = 'pending' and i.window_start <= public.manila_today()
        and i.window_end >= public.manila_today() and t.peso_value > 0 limit 1`
  );
  const mine = await one<{ id: string; submitted_by: string; peso_value: number; unpaid: boolean }>(
    `select id, submitted_by::text, peso_value, unpaid
       from public.admin_complete_task($1, 'ako mismo', $2, false)`,
    [otherTarget.id, admin.id]
  );
  assert.equal(mine.submitted_by, admin.id, "an explicit person is honoured");
  assert.equal(mine.peso_value, 0, "withheld pay is worth nothing");
  assert.equal(mine.unpaid, true);

  st = await one("select status from public.task_instances where id = $1", [bypassTarget.id]);
  assert.equal(st.status, "approved");
  const latest = await one<{ latest: string }>(
    "select latest_completion_id::text as latest from public.task_instances where id = $1",
    [bypassTarget.id]
  );
  assert.equal(latest.latest, bypassed.id, "the instance points at the bypass completion");

  // A bypass must never land in the QA queue — it is already decided.
  const queued = await one<{ n: number }>(
    "select count(*)::int n from public.task_completions where id = $1 and review_status = 'pending'",
    [bypassed.id]
  );
  assert.equal(queued.n, 0, "a bypass does not enter the QA queue");

  // Scheduling rules still apply: a task whose window has not opened cannot be
  // bypassed (reschedule it first).
  // Deliberately a DAILY task: a monthly one may legitimately be submitted
  // (and therefore bypassed) up to early_submit_days() ahead of its window.
  const notYet = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
      where i.status = 'pending' and t.recurrence = 'daily'
        and i.window_start > public.manila_today()
      order by i.window_start desc limit 1`
  );
  await assert.rejects(
    q("select public.admin_complete_task($1, 'maaga', $2)", [notYet.id, helper.id]),
    /cannot be submitted yet/,
    "bypass does not override the schedule window"
  );

  // ---- template change deletes future pending instances ------------------
  console.log("→ template deactivation");
  const pendingBefore = await one<{ n: number }>(
    `select count(*)::int n from public.task_instances i join public.task_templates t on t.id=i.template_id
     where t.slug='daily-eye-discharge' and i.status='pending' and i.scheduled_date >= public.manila_today()`
  );
  assert.ok(pendingBefore.n > 0);
  await q("update public.task_templates set active = false where slug = 'daily-eye-discharge'");
  const pendingAfter = await one<{ n: number }>(
    `select count(*)::int n from public.task_instances i join public.task_templates t on t.id=i.template_id
     where t.slug='daily-eye-discharge' and i.scheduled_date >= public.manila_today()`
  );
  assert.equal(pendingAfter.n, 0, "future pending instances removed on deactivate");
  // …but the approved daily-mop instance survives a schedule change
  await q("update public.task_templates set grace_after = 1 where slug = 'daily-mop'");
  st = await one("select status from public.task_instances where id = $1", [inst.id]);
  assert.equal(st.status, "approved");

  // ---- RLS policies exist -----------------------------------------------
  const pol = await q<{ tablename: string; n: number }>(
    "select tablename, count(*)::int n from pg_policies where schemaname in ('public','storage') group by tablename order by tablename"
  );
  console.log("  policies:", pol.map((p) => `${p.tablename}=${p.n}`).join(" "));
  assert.ok(pol.find((p) => p.tablename === "objects" && p.n === 3));
  const rls = await q<{ relname: string; relrowsecurity: boolean }>(
    `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' order by 1`
  );
  for (const r of rls) assert.equal(r.relrowsecurity, true, `RLS enabled on ${r.relname}`);

  // ---- atomic submission RPC ------------------------------------------
  console.log("→ submit_completion RPC");
  const upload = async (uid: string, name: string) => {
    const path = `${uid}/2026-09/${name}`;
    await q("insert into storage.objects (bucket_id, name, owner) values ('evidence', $1, $2)", [path, uid]);
    return path;
  };

  const inst3 = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'daily-water-fountain' and i.due_date = '2026-09-04'`
  );
  await as(helper.id);

  // evidence is required (min_photos = 1) → empty submission is refused
  await assert.rejects(
    q("select public.submit_completion($1, 'wala', '{}')", [inst3.id]),
    /at least 1 photo/,
    "min_photos enforced server-side"
  );

  // a path that was never uploaded is refused
  await assert.rejects(
    q("select public.submit_completion($1, null, $2)", [inst3.id, [`${helper.id}/2026-09/ghost.jpg`]]),
    /was not uploaded/
  );

  // a path in someone else's folder is refused
  const adminPath = await upload(admin.id, "admins-photo.jpg");
  await assert.rejects(
    q("select public.submit_completion($1, null, $2)", [inst3.id, [adminPath]]),
    /not in your own folder/
  );

  // happy path: completion + photos land together
  const okPath = await upload(helper.id, "ok.jpg");
  const c3 = await one<{ id: string }>("select id from public.submit_completion($1, 'tapos na', $2)", [
    inst3.id, [okPath],
  ]);
  assert.ok(c3.id);
  const c3photos = await one<{ n: number }>("select count(*)::int n from public.photos where completion_id = $1", [c3.id]);
  assert.equal(c3photos.n, 1);
  st = await one("select status from public.task_instances where id = $1", [inst3.id]);
  assert.equal(st.status, "submitted");

  // a failed submission leaves nothing behind (atomicity)
  const before2 = await one<{ n: number }>("select count(*)::int n from public.task_completions");
  const p1 = await upload(helper.id, "atomic.jpg");
  await assert.rejects(
    q("select public.submit_completion($1, null, $2)", [inst3.id, [p1, `${helper.id}/2026-09/missing.jpg`]]),
    /was not uploaded/
  );
  const after2 = await one<{ n: number }>("select count(*)::int n from public.task_completions");
  assert.equal(after2.n, before2.n, "no partial completion is left behind");

  // cannot submit before the window opens
  await q("select public.ensure_task_instances('2027-02-01','2027-02-28')");
  const future = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'daily-water-fountain' and i.due_date = '2027-02-20'`
  );
  const p2 = await upload(helper.id, "future.jpg");
  await assert.rejects(
    q("select public.submit_completion($1, null, $2)", [future.id, [p2]]),
    /cannot be submitted yet/
  );

  // ---- monthly tasks may be done early ----------------------------------
  // A monthly task exists on one day of the month. If it could only be
  // submitted inside its own window it would be invisible (and unearnable) the
  // rest of the time — the litter-box wash was never showing up at all.
  console.log("→ early submission of monthly tasks");
  const early21 = await one<{ n: number }>("select public.early_submit_days() n");
  assert.equal(early21.n, 21, "early_submit_days must match UPCOMING_DAYS in src/lib/queries.ts");

  // today is 2026-09-20; nail trim is due 2026-09-30, window opens 09-29.
  const soon = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'monthly-nail-trim' and i.due_date = '2026-09-30'`
  );
  const p3 = await upload(helper.id, "early-nails.jpg");
  const earlyC = await one<{ id: string }>(
    "select id from public.submit_completion($1, 'ginawa ko na', $2)",
    [soon.id, [p3]]
  );
  assert.ok(earlyC.id, "a monthly task can be submitted before its window opens");
  const earlyStatus = await one<{ status: string }>(
    "select status::text from public.task_instances where id = $1",
    [soon.id]
  );
  assert.equal(earlyStatus.status, "submitted");
  const earlyPrice = await one<{ peso_value: number }>(
    "select peso_value from public.task_completions where instance_id = $1",
    [soon.id]
  );
  assert.equal(earlyPrice.peso_value, 12, "an early submission still snapshots the price");

  // …but not arbitrarily early: the Feb 2027 fountain wash is months out.
  const farMonthly = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'monthly-wash-fountains' and i.due_date = '2027-02-15'`
  );
  const p4 = await upload(helper.id, "way-early.jpg");
  await assert.rejects(
    q("select public.submit_completion($1, null, $2)", [farMonthly.id, [p4]]),
    /cannot be submitted yet/,
    "early submission is capped at early_submit_days()"
  );


  // direct inserts into task_completions are no longer allowed for helpers
  const pol2 = await q<{ policyname: string }>(
    "select policyname from pg_policies where tablename = 'task_completions' and cmd = 'INSERT'"
  );
  assert.equal(pol2.length, 0, "no direct INSERT policy on task_completions");

  // ---- create_issue RPC -------------------------------------------------
  console.log("→ create_issue RPC");
  const ip = await upload(helper.id, "issue.jpg");
  const issue = await one<{ id: string; status: string; reported_by: string }>(
    "select id, status, reported_by from public.create_issue('Sumusuka si Mingming', 'health', 'simula kaninang umaga', $1)",
    [[ip]]
  );
  assert.equal(issue.status, "open");
  assert.equal(issue.reported_by, helper.id);
  const ipn = await one<{ n: number }>("select count(*)::int n from public.photos where issue_id = $1", [issue.id]);
  assert.equal(ipn.n, 1);
  await assert.rejects(q("select public.create_issue('  ', 'other')"), /title is required/);

  // ---- reschedule recomputes the grace window ---------------------------
  console.log("→ reschedule window");
  const nail = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'monthly-nail-trim' and i.due_date = '2026-09-15'`
  );
  await as(admin.id);
  await q("select public.reschedule_task_instance($1, '2026-09-20')", [nail.id]);
  const moved = await one<{ due_date: string; window_start: string; window_end: string }>(
    "select due_date::text, window_start::text, window_end::text from public.task_instances where id = $1",
    [nail.id]
  );
  assert.deepEqual(moved, { due_date: "2026-09-20", window_start: "2026-09-19", window_end: "2026-09-21" },
    "window follows the new due date instead of straddling the old one");

  // ---- earnings + payouts -------------------------------------------------
  console.log("\u2192 earnings + payouts");

  // Earlier sections already approved priced tasks, so measure deltas from
  // whatever the helper has now rather than assuming an empty wallet.
  await as(helper.id);
  const bal = async () => (await one<{ b: number }>("select public.helper_balance() b")).b;
  const bal2 = async (uid: string) =>
    (await one<{ b: number }>("select public.helper_balance($1) b", [uid])).b;
  const base = await bal();

  // Price a task, then submit and approve it: the helper earns exactly that.
  await as(admin.id);
  await q("update public.task_templates set peso_value = 25 where slug = 'daily-play'");
  const earnInst = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'daily-play' and i.status = 'pending'
       and i.window_start <= public.manila_today() limit 1`
  );

  await as(helper.id);
  const earnPath = await upload(helper.id, "earn.jpg");
  const earnComp = await one<{ id: string; peso_value: number }>(
    "select id, peso_value from public.submit_completion($1, null, $2)",
    [earnInst.id, [earnPath]]
  );
  assert.equal(earnComp.peso_value, 25, "the price is snapshotted onto the completion");
  assert.equal(await bal(), base, "a pending submission is worth nothing yet");

  await as(admin.id);
  await q("select public.review_completion($1, 'approved')", [earnComp.id]);
  await as(helper.id);
  assert.equal(await bal(), base + 25, "approval credits the helper");

  // ---- approve without paying -------------------------------------------
  // "Done, but not billable": the completion keeps what the task was worth,
  // it just stops counting as earnings. Every sum has to agree, or the admin
  // pays for work they explicitly declined to pay for.
  const freeInstance = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'daily-play' and i.status = 'pending'
       and i.window_start <= public.manila_today() limit 1`
  );
  await as(helper.id);
  const unpaidPath = await upload(helper.id, "unpaid.jpg");
  const unpaidComp = await one<{ id: string; peso_value: number }>(
    "select id, peso_value from public.submit_completion($1, null, $2)",
    [freeInstance.id, [unpaidPath]]
  );
  assert.equal(unpaidComp.peso_value, 25, "still snapshotted at submission");
  await as(admin.id);
  const reviewed = await one<{ unpaid: boolean; peso_value: number; review_status: string }>(
    "select unpaid, peso_value, review_status::text from public.review_completion($1, 'approved', null, false)",
    [unpaidComp.id]
  );
  assert.equal(reviewed.review_status, "approved", "it is still an approval");
  assert.equal(reviewed.unpaid, true);
  assert.equal(reviewed.peso_value, 25, "the snapshot is kept, not zeroed");
  const instAfter = await one<{ status: string }>(
    "select status::text from public.task_instances where id = $1",
    [freeInstance.id]
  );
  assert.equal(instAfter.status, "approved", "the task still counts as done");
  await as(helper.id);
  assert.equal(await bal(), base + 25, "an unpaid approval adds nothing to the wallet");
  await as(admin.id);
  const unpaidWallet = (await q<{ helper_id: string; earned: number }>(
    "select helper_id, earned from public.admin_wallets()"
  )).find((w) => w.helper_id === helper.id);
  assert.equal(unpaidWallet?.earned, base + 25, "the admin roll-up agrees");

  // Re-reviewing it as paid must credit it: the flag is cleared, not sticky.
  await q("select public.review_completion($1, 'approved')", [unpaidComp.id]);
  await as(helper.id);
  assert.equal(await bal(), base + 50, "approving it again, with pay, credits it");
  await as(admin.id);
  await q("select public.review_completion($1, 'approved', null, false)", [unpaidComp.id]);
  await as(helper.id);
  assert.equal(await bal(), base + 25, "…and withholding again takes it back out");

  // ---- changing your mind after the approval ----------------------------
  // set_completion_paid() flips only the money. The QA decision, its note, its
  // timestamp and its reviewer must survive, or correcting a payout would
  // quietly erase what the admin told the helper.
  console.log("→ set_completion_paid");
  await as(admin.id);
  await q(
    "select public.review_completion($1, 'approved', 'ayos, salamat', false)",
    [unpaidComp.id]
  );
  const beforeFlip = await one<{ review_note: string; reviewed_at: string; reviewed_by: string }>(
    "select review_note, reviewed_at::text, reviewed_by::text from public.task_completions where id = $1",
    [unpaidComp.id]
  );
  await as(helper.id);
  await assert.rejects(
    q("select public.set_completion_paid($1, true)", [unpaidComp.id]),
    /only admins/,
    "a helper cannot pay themselves"
  );
  await as(admin.id);
  const flipped = await one<{ unpaid: boolean; review_note: string; reviewed_at: string; reviewed_by: string }>(
    `select unpaid, review_note, reviewed_at::text, reviewed_by::text
       from public.set_completion_paid($1, true)`,
    [unpaidComp.id]
  );
  assert.equal(flipped.unpaid, false, "it now counts");
  assert.equal(flipped.review_note, beforeFlip.review_note, "the review note survives");
  assert.equal(flipped.reviewed_at, beforeFlip.reviewed_at, "…and so does the review timestamp");
  assert.equal(flipped.reviewed_by, beforeFlip.reviewed_by, "…and the reviewer");
  await as(helper.id);
  assert.equal(await bal(), base + 50, "a retroactive include credits the helper");
  await as(admin.id);
  await q("select public.set_completion_paid($1, false)", [unpaidComp.id]);
  await as(helper.id);
  assert.equal(await bal(), base + 25, "…and withholding it again takes it back");

  await as(admin.id);
  // The case this was built for: a task recorded with the bypass and withheld
  // is frozen at ₱0 AND filed under the admin, so clearing the flag alone would
  // pay nobody — or worse, pay the admin for the helper's work.
  const beforePayBypass = await bal2(helper.id);
  const bypassPaid = await one<{ peso_value: number; submitted_by: string; unpaid: boolean }>(
    "select peso_value, submitted_by::text, unpaid from public.set_completion_paid($1, true, $2)",
    [mine.id, helper.id]
  );
  assert.ok(bypassPaid.peso_value > 0, "it is priced from the template");
  assert.equal(bypassPaid.submitted_by, helper.id, "and credited to the helper, not the admin");
  assert.equal(bypassPaid.unpaid, false);
  assert.equal(
    await bal2(helper.id),
    beforePayBypass + bypassPaid.peso_value,
    "the helper is paid for work the admin wrote down for them"
  );
  // Withhold it again so the wallet is where the later assertions expect it.
  await q("select public.set_completion_paid($1, false)", [mine.id]);
  assert.equal(await bal2(helper.id), beforePayBypass, "withholding it takes it straight back out");

  // A task worth nothing has no payment to move either.
  const worthless = await one<{ id: string }>(
    `select c.id from public.task_completions c
       join public.task_instances i on i.id = c.instance_id
       join public.task_templates t on t.id = i.template_id
      where c.review_status = 'approved' and c.peso_value = 0 and t.peso_value = 0
      limit 1`
  );
  if (worthless) {
    await assert.rejects(
      q("select public.set_completion_paid($1, true)", [worthless.id]),
      /worth nothing/,
      "there is nothing to pay on a zero-value task"
    );
  }

  // Only an approved completion has a payment to move.
  await as(admin.id);
  const pendingComp = await one<{ id: string }>(
    "select id from public.task_completions where review_status = 'pending' limit 1"
  );
  await assert.rejects(
    q("select public.set_completion_paid($1, false)", [pendingComp.id]),
    /only an approved completion/,
    "pending work has not been decided yet"
  );
  await assert.rejects(
    q("select public.set_completion_paid($1, true)", ["00000000-0000-0000-0000-000000000000"]),
    /completion not found/
  );

  // Re-pricing the template must NOT rewrite what was already earned.
  await as(admin.id);
  await q("update public.task_templates set peso_value = 999 where slug = 'daily-play'");
  await as(helper.id);
  assert.equal(await bal(), base + 25, "re-pricing a template does not rewrite past earnings");

  // A bypass now pays the person it is recorded for — by default the helper,
  // because the admin is usually writing down work the helper could not
  // photograph. Withholding is explicit.
  await as(admin.id);
  await q("update public.task_templates set peso_value = 100 where slug = 'daily-litter-sand'");
  const freeInst = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'daily-litter-sand' and i.status = 'pending'
       and i.window_start <= public.manila_today() limit 1`
  );
  const byp = await one<{ id: string; peso_value: number; submitted_by: string }>(
    `select id, peso_value, submitted_by::text
       from public.admin_complete_task($1, 'ginawa niya, walang litrato', $2)`,
    [freeInst.id, helper.id]
  );
  assert.equal(byp.peso_value, 100, "a bypass pays what the task is worth");
  assert.equal(byp.submitted_by, helper.id, "…to the helper it was recorded for");
  await as(helper.id);
  const avail = await bal();
  assert.equal(avail, base + 125, "the bypass credited the helper");

  // Withdrawal: cannot ask for more than the balance.
  await assert.rejects(
    q(`select public.request_payout(${avail + 1})`),
    /at most/,
    "cannot withdraw more than the balance"
  );
  await assert.rejects(q("select public.request_payout(0)"), /greater than zero/);

  const pay = await one<{ id: string; status: string }>(
    `select id, status::text from public.request_payout(${avail - 5}, 'pang-grocery')`
  );
  assert.equal(pay.status, "requested");

  // The pending request holds the money, so it cannot be requested twice.
  assert.equal(await bal(), 5, "a pending request holds its amount against the balance");
  await assert.rejects(q("select public.request_payout(6)"), /at most/, "no double-spending a pending request");

  // Helpers cannot review their own payout.
  await assert.rejects(
    q("select public.review_payout($1, 'paid')", [pay.id]),
    /only admins/,
    "a helper cannot approve their own withdrawal"
  );

  await as(admin.id);
  await assert.rejects(
    q("select public.review_payout($1, 'rejected', '')", [pay.id]),
    /note is required/,
    "rejecting needs a reason"
  );
  await q("select public.review_payout($1, 'approved')", [pay.id]);
  await q("select public.review_payout($1, 'paid')", [pay.id]);
  const paid = await one<{ status: string; paid_at: string | null }>(
    "select status::text, paid_at::text from public.payouts where id = $1",
    [pay.id]
  );
  assert.equal(paid.status, "paid");
  assert.ok(paid.paid_at, "paid_at is stamped");

  // Settled money does not move again.
  await assert.rejects(
    q("select public.review_payout($1, 'rejected', 'changed my mind')", [pay.id]),
    /already paid/,
    "a paid payout is final"
  );

  // Paying out keeps the money deducted; rejecting releases the hold.
  await as(helper.id);
  assert.equal(await bal(), 5, "paying out keeps the money deducted");
  const pay2 = await one<{ id: string }>("select id from public.request_payout(5)");
  assert.equal(await bal(), 0);
  await as(admin.id);
  await q("select public.review_payout($1, 'rejected', 'next month na lang')", [pay2.id]);
  await as(helper.id);
  assert.equal(await bal(), 5, "rejecting a request releases its hold");

  // The month-range bounds used by getEarningsBreakdown must be read in Manila,
  // not in the DB session's UTC. Work done in the first eight hours of the 1st
  // lands in the PREVIOUS UTC day, so naive bounds silently drop it.
  // Pin the session interpretation explicitly: PGlite here does not default to
  // the same timezone Supabase runs in, so comparing against a bare timestamp
  // would make this assertion depend on the machine running the test.
  const tzProbe = await one<{ naive: boolean; manila: boolean }>(
    `select
       (timestamptz '2026-08-01 03:00+08' >= (timestamp '2026-08-01 00:00' at time zone 'UTC'))
         as naive,
       (timestamptz '2026-08-01 03:00+08' >= (timestamp '2026-08-01 00:00' at time zone 'Asia/Manila'))
         as manila`
  );
  assert.equal(tzProbe.naive, false, "naive bounds drop the first hours of the month (the bug)");
  assert.equal(tzProbe.manila, true, "Manila-pinned bounds keep them (the fix)");

  // Backfill: a completion left at 0 because it predates peso_value must be
  // repriced from its template — but a bypass must stay worth nothing.
  await as(admin.id);
  await q("update public.task_completions set peso_value = 0 where id = $1", [earnComp.id]);
  const beforeFix = await one<{ b: number }>("select public.helper_balance($1) b", [helper.id]);
  const repriced = await one<{ n: number }>("select public.backfill_completion_prices() n");
  assert.ok(repriced.n >= 1, "the backfill repriced the zeroed completion");
  const afterFix = await one<{ peso_value: number }>(
    "select peso_value from public.task_completions where id = $1", [earnComp.id]
  );
  assert.equal(afterFix.peso_value, 999, "repriced from the template's current value");
  assert.equal(
    (await one<{ b: number }>("select public.helper_balance($1) b", [helper.id])).b,
    beforeFix.b + 999,
    "the repriced completion lands back in the balance"
  );
  // A bypass recorded with pay withheld sits at 0 on purpose. The backfill
  // reprices rows left at 0 by the old schema and must not mistake this for one
  // of them, so it needs a row that really is still at 0 at this point.
  const withheldTarget = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
      where i.status = 'pending' and i.window_start <= public.manila_today()
        and i.window_end >= public.manila_today() and t.peso_value > 0 limit 1`
  );
  const withheld = await one<{ id: string; peso_value: number }>(
    "select id, peso_value from public.admin_complete_task($1, 'ako mismo', $2, false)",
    [withheldTarget.id, admin.id]
  );
  assert.equal(withheld.peso_value, 0);
  await q("select public.backfill_completion_prices()");
  const bypassStillFree = await one<{ peso_value: number }>(
    "select peso_value from public.task_completions where id = $1", [withheld.id]
  );
  assert.equal(bypassStillFree.peso_value, 0, "the backfill never pays out a withheld bypass");

  // Put the wallet back where the later assertions expect it.
  await q("update public.task_completions set peso_value = 25 where id = $1", [earnComp.id]);

  // Outlook: what today and the month are worth if everything gets done.
  await as(helper.id);
  const outlook = await one<{
    today_potential: number; today_earned: number;
    month_potential: number; month_earned: number;
  }>("select * from public.earnings_outlook()");
  assert.ok(outlook.month_potential > 0, "the month has tasks worth earning");
  assert.ok(
    outlook.today_potential <= outlook.month_potential,
    "today cannot be worth more than the month containing it"
  );
  assert.ok(outlook.today_earned <= outlook.today_potential, "cannot earn more than today is worth");
  assert.ok(outlook.month_earned <= outlook.month_potential, "cannot earn more than the month is worth");

  // A skipped task drops out of potential: nobody can earn it any more, so
  // leaving it in would show a target that can never be reached.
  const skipTarget = await one<{ id: string; value: number }>(
    `select i.id, t.peso_value as value from public.task_instances i
       join public.task_templates t on t.id = i.template_id
      where i.due_date = public.manila_today() and i.status = 'pending' and t.peso_value > 0
      limit 1`
  );
  await as(admin.id);
  await q("select public.skip_task_instance($1, 'nasa vet')", [skipTarget.id]);
  await as(helper.id);
  const afterSkip = await one<{ today_potential: number }>(
    "select today_potential from public.earnings_outlook()"
  );
  assert.equal(
    afterSkip.today_potential,
    outlook.today_potential - skipTarget.value,
    "skipping a task removes its value from today's potential"
  );
  await as(admin.id);
  await q("select public.skip_task_instance($1, null, true)", [skipTarget.id]);

  // Admin roll-up of every wallet, in one round trip.
  await as(helper.id);
  await assert.rejects(
    q("select * from public.admin_wallets()"),
    /only admins/,
    "a helper cannot list everyone's wallets"
  );
  await as(admin.id);
  const wallets = await q<{
    helper_id: string; full_name: string; earned: number;
    committed: number; balance: number; this_month: number; open_requests: number;
  }>("select * from public.admin_wallets()");
  const helperWallet = wallets.find((w) => w.helper_id === helper.id);
  assert.ok(helperWallet, "the helper appears in the admin roll-up");
  assert.equal(helperWallet.balance, 5, "the roll-up agrees with helper_balance()");
  assert.equal(
    helperWallet.earned - helperWallet.committed,
    helperWallet.balance,
    "earned - committed = balance"
  );
  assert.ok(helperWallet.this_month <= helperWallet.earned, "this month cannot exceed all time");
  // Every profile is listed, so a helper who has earned nothing is still visible.
  const profileCount = await one<{ n: number }>("select count(*)::int n from public.profiles");
  assert.equal(wallets.length, profileCount.n, "every profile appears, even at zero");

  // One wallet cannot read another's. (Back to the helper — the assertion
  // below is about what a NON-admin is allowed to see.)
  await as(helper.id);
  await assert.rejects(
    q("select public.helper_balance($1)", [admin.id]),
    /not allowed/,
    "a helper cannot read someone else's wallet"
  );
  await as(admin.id);
  const adminView = await one<{ b: number }>("select public.helper_balance($1) b", [helper.id]);
  assert.equal(adminView.b, 5, "an admin can read a helper's wallet");

  await as(admin.id);

  // ---- admin records a payment nobody requested ---------------------------
  // The cash usually changes hands before anyone opens the app.
  console.log("→ admin_record_payout");
  await as(helper.id);
  await assert.rejects(
    q("select public.admin_record_payout($1, 1)", [helper.id]),
    /only admins/,
    "a helper cannot record their own payment"
  );
  await as(admin.id);
  await assert.rejects(
    q("select public.admin_record_payout($1, 0)", [helper.id]),
    /greater than zero/
  );
  await assert.rejects(
    q("select public.admin_record_payout($1, 1)", ["00000000-0000-0000-0000-000000000000"]),
    /helper not found/
  );
  // It is still the same wallet: an admin records a payment, never invents one.
  await assert.rejects(
    q("select public.admin_record_payout($1, 6)", [helper.id]),
    /more than the 5 available/,
    "cannot record more than the balance"
  );

  const rec = await one<{ id: string; status: string; admin_recorded: boolean; paid_at: string | null }>(
    "select id, status::text, admin_recorded, paid_at::text from public.admin_record_payout($1, 5, 'cash kagabi')",
    [helper.id]
  );
  assert.equal(rec.status, "paid", "a recorded payment is paid on the spot");
  assert.equal(rec.admin_recorded, true, "…and says so permanently");
  assert.ok(rec.paid_at, "paid_at is stamped");
  const recRow = await one<{ note: string | null; review_note: string; reviewed_by: string }>(
    "select note, review_note, reviewed_by::text from public.payouts where id = $1",
    [rec.id]
  );
  assert.equal(recRow.note, null, "there is no helper message on a payment nobody requested");
  assert.equal(recRow.review_note, "cash kagabi");
  assert.equal(recRow.reviewed_by, admin.id);
  await as(helper.id);
  assert.equal(await bal(), 0, "recording a payment takes it out of the balance");

  // ---- outlook counts work on the day it was DONE, not only when due ------
  // A monthly task submitted early is due in a later month; keying the outlook
  // on due_date alone put its pesos in the wallet but not in the month's
  // "earned" line, so the two numbers disagreed about the same money.
  console.log("→ outlook counts early work in the month it was done");
  const readOutlook = () =>
    one<{
      today_potential: number; today_earned: number;
      month_potential: number; month_earned: number;
    }>("select * from public.earnings_outlook()");
  const beforeEarly = await readOutlook();

  // A monthly task worth ₱500 due next month, inside the 21-day horizon: today
  // is 2026-09-20, so 2026-10-05 is submittable now. Purpose-built rather than
  // borrowed from the seed, so re-timing a household chore cannot break this.
  await q(
    `insert into public.task_templates
       (slug, title_tl, title_en, category, recurrence, month_days, interval_months,
        anchor_month, grace_before, grace_after, peso_value, starts_on)
     values ('test-early-monthly', 'Subok', 'Test', 'other', 'monthly', '{5}', 1,
             '2026-09-01', 0, 3, 500, '2026-09-01')`
  );
  await q("select public.ensure_task_instances('2026-10-01','2026-10-31')");
  const nextMonth = await one<{ id: string }>(
    `select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
     where t.slug = 'test-early-monthly' and i.due_date = '2026-10-05'`
  );
  const earlyPath = await upload(helper.id, "litter-boxes.jpg");
  const earlyComp = await one<{ id: string; peso_value: number }>(
    "select id, peso_value from public.submit_completion($1, 'nahugasan ko na', $2)",
    [nextMonth.id, [earlyPath]]
  );
  assert.equal(earlyComp.peso_value, 500);
  await as(admin.id);
  await q("select public.review_completion($1, 'approved')", [earlyComp.id]);
  // pinToday() moves manila_today() but not now(), so submitted_at defaulted to
  // the real wall clock. In production the two agree; here, say so explicitly.
  await q(
    "update public.task_completions set submitted_at = timestamptz '2026-09-20 10:00+08' where id = $1",
    [earlyComp.id]
  );
  await as(helper.id);

  const afterEarly = await readOutlook();
  assert.equal(
    afterEarly.month_earned,
    beforeEarly.month_earned + 500,
    "work done this month counts this month, even when it is due next month"
  );
  assert.equal(
    afterEarly.month_potential,
    beforeEarly.month_potential + 500,
    "…and it joins the denominator too, so earned stays a share of potential"
  );
  assert.equal(afterEarly.today_earned, beforeEarly.today_earned + 500, "same for today");
  assert.ok(afterEarly.month_earned <= afterEarly.month_potential);
  assert.equal(await bal(), 500, "the wallet and the outlook now agree");

  await as(admin.id);

  // ---- RLS actually enforced (run as the `authenticated` role, not superuser)
  console.log("→ RLS enforcement (as authenticated)");
  const asRole = async (uid: string) => {
    await as(uid);
    await db.exec("set role authenticated");
  };
  const resetRole = async () => db.exec("reset role");

  await asRole(helper.id);

  // reads are allowed household-wide
  assert.ok((await q("select id from public.task_instances limit 1")).length === 1, "helper can read instances");
  assert.equal((await q("select id from public.profiles")).length, 3, "helper can read profiles");

  // helper cannot edit the schedule (no matching policy → the update matches no rows)
  await q("update public.task_templates set title_tl = 'hacked' where slug = 'daily-mop'");
  await resetRole();
  const tplTitle = await one<{ title_tl: string }>(
    "select title_tl from public.task_templates where slug = 'daily-mop'"
  );
  assert.notEqual(tplTitle.title_tl, "hacked", "helper cannot edit templates");

  // helper cannot promote themselves
  await asRole(helper.id);
  await assert.rejects(
    q("update public.profiles set role = 'admin' where id = $1", [helper.id]),
    /row-level security/,
    "helper cannot promote themselves to admin"
  );

  // helper cannot insert a completion directly (must go through submit_completion)
  await assert.rejects(
    q("insert into public.task_completions (instance_id, submitted_by) values ($1, $2)", [inst3.id, helper.id]),
    /row-level security|permission denied/,
    "no direct completion inserts"
  );

  // helper cannot attach evidence to a completion that is not theirs
  await assert.rejects(
    q("insert into public.photos (completion_id, storage_path, uploaded_by) values ($1, $2, $3)", [
      "00000000-0000-0000-0000-000000000000", `${helper.id}/2026-09/sneaky.jpg`, helper.id,
    ]),
    /row-level security|violates foreign key/,
    "cannot attach evidence to an unknown/other completion"
  );

  // …nor record a path outside their own storage folder
  await assert.rejects(
    q("insert into public.photos (completion_id, storage_path, uploaded_by) values ($1, $2, $3)", [
      c3.id, `${admin.id}/2026-09/outside.jpg`, helper.id,
    ]),
    /row-level security/,
    "cannot record a photo path outside their own folder"
  );

  // helper cannot mint themselves money: payouts move only through the RPCs
  await assert.rejects(
    q("insert into public.payouts (helper_id, amount) values ($1, 99999)", [helper.id]),
    /row-level security|permission denied/,
    "no direct payout inserts"
  );
  // An UPDATE with no matching policy is not an error in Postgres — it simply
  // matches no rows. Assert the money did not move rather than expecting a throw.
  await q("update public.payouts set status = 'paid' where helper_id = $1", [helper.id]);
  await resetRole();
  const stillRejected = await one<{ n: number }>(
    "select count(*)::int n from public.payouts where helper_id = $1 and status = 'rejected'",
    [helper.id]
  );
  assert.equal(stillRejected.n, 1, "helper cannot mark their own payout paid");
  await asRole(helper.id);
  // …nor re-price a task to inflate future earnings (covered above for titles,
  // asserted here for the money column specifically)
  await q("update public.task_templates set peso_value = 4999 where slug = 'daily-mop'");
  await resetRole();
  const tplPrice = await one<{ peso_value: number }>(
    "select peso_value from public.task_templates where slug = 'daily-mop'"
  );
  assert.notEqual(tplPrice.peso_value, 4999, "helper cannot re-price a task");
  await asRole(helper.id);

  // helper cannot resolve their own report
  await assert.rejects(
    q("update public.issues set status = 'resolved', resolved_by = $1 where id = $2", [helper.id, issue.id]),
    /row-level security/,
    "helper cannot self-resolve a report"
  );
  // …but may still edit its text while it is open
  await q("update public.issues set description = 'may dugo' where id = $1", [issue.id]);
  await resetRole();
  const issueDesc = await one<{ description: string }>("select description from public.issues where id = $1", [issue.id]);
  assert.equal(issueDesc.description, "may dugo", "reporter can still edit an open report");

  // helper cannot delete another user's storage object
  await asRole(helper.id);
  await q("delete from storage.objects where name = $1", [adminPath]);
  await resetRole();
  const adminObj = await one<{ n: number }>("select count(*)::int n from storage.objects where name = $1", [adminPath]);
  assert.equal(adminObj.n, 1, "helper cannot delete another user's uploads");

  // helper cannot delete an object that is already recorded as evidence
  await asRole(helper.id);
  await q("delete from storage.objects where name = $1", [okPath]);
  await resetRole();
  const evidenceObj = await one<{ n: number }>("select count(*)::int n from storage.objects where name = $1", [okPath]);
  assert.equal(evidenceObj.n, 1, "recorded evidence cannot be deleted from storage by the helper");

  await as(admin.id);

  // ---- logged-out callers (the publishable key, no session) reach nothing
  console.log("→ logged-out callers are refused");
  await as(null, "anon");
  await db.exec("set role anon");
  for (const fn of ["helper_balance", "helper_earned_total", "helper_payouts_committed", "earnings_outlook"]) {
    await assert.rejects(
      q(`select public.${fn}($1)`, [helper.id]),
      /permission denied/,
      `anon cannot call ${fn}`
    );
  }
  await assert.rejects(q("select public.sole_helper()"), /permission denied/, "anon cannot ask for the helper's id");
  await resetRole();
  // Even with EXECUTE, a missing session must not pass the wallet guard.
  await as(null);
  await assert.rejects(
    q("select public.helper_balance($1)", [helper.id]),
    /not allowed to read this wallet/,
    "no session, no wallet"
  );
  await as(admin.id);

  console.log("\n✔ all database checks passed");
  await db.close();
}

main().catch((e) => {
  console.error("\n✖ db-test failed:", e);
  process.exit(1);
});
