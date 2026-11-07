# Architecture — Tapos na ba?

Mobile-first task tracker for the household helper who cares for the cats.
Helper does tasks → uploads photo evidence → admin QAs (approve / send back).

## Stack

- **Next.js 16** (App Router, `src/` dir, Server Components + Server Actions, `proxy.ts` for session refresh)
- **Tailwind CSS v4** (theme tokens in `src/app/globals.css`: `brand-*`, `surface`, `surface-2`, `ink`, `muted`, `line`)
- **Supabase**: Postgres + RLS, Auth (email/password), Storage (private `evidence` bucket)
- **Vercel** hosting; `vercel.json` cron hits `/api/cron/generate` daily (00:05 Manila). `regions: ["sin1"]` is **load-bearing**: the Supabase project is in `ap-southeast-1`, and on the default `iad1` every query was a ~230 ms trans-Pacific round trip.
- Timezone for all "today" logic: **Asia/Manila** (`src/lib/dates.ts`)

## Roles

- `helper` — lands on `/today` (also the PWA `start_url`); sees `/tasks/[id]`, `/history`, `/report`, `/rules`, `/settings`. Every `/admin/*` route redirects them back to `/today` — enforced in the layout, not just hidden in the nav.
- `admin` — everything above plus `/admin/**` (QA queue, templates, calendar, issues, users)
- First auth user ever created becomes admin (DB trigger). Admins create helpers from `/admin/users` (needs `SUPABASE_SECRET_KEY`).

## Data model

Migrations: `supabase/migrations/20260817000000_init.sql` (schema, RLS, scheduling) then `…010000_harden.sql` (atomic submission/reporting RPCs and the tightened policies).

| table | purpose |
|---|---|
| `profiles` | id = auth.users.id, `full_name`, `role` (`admin`/`helper`), `locale` (`tl`/`en`) |
| `task_templates` | recurring task definitions (bilingual title/description, category, recurrence, grace window, evidence rules) |
| `task_instances` | one row per template per `scheduled_date`; `due_date` (editable), `window_start/end`, `status` |
| `task_completions` | a submission for an instance: `note`, `review_status`, `review_note`, reviewer, `admin_override` (set only by an admin bypass), `peso_value` (what it earned, frozen at submission), `unpaid` (approved but deliberately not paid) |
| `photos` | evidence rows pointing at `storage_path` in bucket `evidence`; belongs to a completion **or** an issue |
| `issues` | reports from the helper: `category` (health/equipment/supplies/other), `status` (open/acknowledged/resolved) |
| `payouts` | a withdrawal request: `amount`, `status` (requested/approved/paid/rejected), helper note + admin review note, `admin_recorded` (logged by an admin, never requested) |

Recurrence: `daily` | `weekly` (`weekdays[]`, 0=Sun) | `monthly` (`month_days[]` clamped to month end, every `interval_months` from `anchor_month`).
Grace: instance window = `[due - grace_before, due + grace_after]`. Overdue = past `window_end` and status in (pending, rejected).

**A monthly task may be submitted before its window opens** — up to `public.early_submit_days()` (21) days early. A monthly task exists on exactly one day of the month, so without this it was invisible on the other ~28, and a helper who did the work early had nothing to submit against and earned nothing. Daily and weekly tasks are **not** early-submittable: the helper could otherwise bank three weeks of them in one sitting. The horizon is mirrored in TypeScript as `UPCOMING_DAYS` in `src/lib/queries.ts` (the "Paparating" section on `/today`) — keep the two numbers equal.

`anchor_month` is seeded relative to "today", so `supabase/seed.sql` deliberately does **not** update it on conflict. Overwriting it walked the anchor forward on every re-seed, which flips the parity of an `interval_months = 2` task and can defer it forever.

Instance statuses: `pending` → `submitted` (helper submitted) → `approved` | `rejected` (admin QA; rejected = redo, helper resubmits → `submitted`) ; `skipped` (admin). An admin can also jump straight to `approved` via a **bypass** (`admin_complete_task`) — a real completion with no photos, permanently stamped `admin_override`.

### DB functions (all `security definer`, RLS-safe)
- `submit_completion(p_instance_id, p_note, p_paths[])` — **the only way a completion is created.** One transaction: checks the task is still open and its window has started (or, for a monthly task, is within `early_submit_days()`), enforces `min_photos`, verifies every path exists in the bucket and sits in the caller's own folder, then inserts the completion + photo rows. There is deliberately no INSERT policy on `task_completions`, so evidence rules cannot be bypassed via the REST API.
- `create_issue(p_title, p_category, p_description, p_paths[])` — same treatment for reports (issue + photos in one transaction).
- `ensure_task_instances(p_from, p_to)` — idempotent materialization; called on page load (`ensureInstancesAroundToday()` in `src/lib/queries.ts`) and by cron.
- `review_completion(p_completion_id, 'approved'|'rejected', p_note, p_pay)` — admin only; note required on reject; only the latest completion drives instance status. `p_pay = false` on an approval sets `unpaid`: the task counts as done but earns nothing. The flag is rewritten on every review, so re-reviewing with pay credits it again.
- `set_completion_paid(p_completion_id, p_pay, p_credit_to)` — admin only, approved completions only. Flips `unpaid` on a completion that was already reviewed, leaving the QA decision, its note, its timestamp and its reviewer alone. Deliberately not `review_completion`, which rewrites `review_note` from its own argument and would erase what the admin told the helper. Paying a **bypassed** completion does two extra things, because such a row is frozen at ₱0 and filed under the admin: it prices the row from the template and moves `submitted_by` to `p_credit_to` (defaulting to `sole_helper()`). Without that, ticking "pay" on a bypass would pay ₱0, or pay the admin for the helper's work. Surfaced as the tick in the QA history list on `/admin/review`.
- `skip_task_instance(p_instance_id, p_reason, p_undo)` — admin only.
- `request_payout(p_amount, p_note)` — helper only. Re-checks the balance under a row lock on the caller's profile, so two taps cannot both pass and overdraw.
- `review_payout(p_payout_id, 'approved'|'paid'|'rejected', p_note)` — admin only; note required on reject. `paid` and `rejected` are terminal: reopening settled money would silently re-credit a balance someone has already been paid against.
- `admin_record_payout(p_helper_id, p_amount, p_note)` — admin only. Logs cash already handed over with no request behind it: inserts a payout that is `paid` from the start and stamped `admin_recorded`. Enforces the same balance check under the same profile row lock as `request_payout`.
- `helper_earned_total()` / `helper_payouts_committed()` / `helper_balance()` — wallet readers, defaulting to `auth.uid()`. Passing another uid requires admin (`assert_can_read_wallet`).
- `admin_complete_task(p_instance_id, p_reason, p_done_by, p_pay)` — **admin bypass.** Marks the instance `approved` with no photo evidence and without entering the QA queue. The reason is mandatory and stored on the completion's `note`; the row is stamped `admin_override = true`, `reviewed_by` = the admin. `submitted_by` is `p_done_by` — **who actually did it**, defaulting to `sole_helper()` — and `p_pay` (default true) decides whether it earns. This bypasses the *evidence* rules only — the BEFORE INSERT trigger still refuses an already approved/skipped instance, and one whose window has not opened yet (reschedule it first — except a monthly task inside its early-submit horizon, which is submittable and therefore bypassable).
- `reschedule_task_instance(p_instance_id, p_due_date, p_window_end)` — admin only; recomputes the grace window around the new due date so a moved task stops showing near its old one.
- `create_adhoc_task(p_title_tl, p_title_en, p_due_date, p_category, p_desc_tl, p_desc_en, p_evidence_required, p_grace_after)` — admin one-off task.

Triggers: new auth user → profile; completion insert → instance `submitted`; template schedule change/deactivate → future pending instances deleted (regenerated on demand).

### Storage
Bucket `evidence` (private). Path convention `{auth.uid()}/{yyyy-mm}/{uuid}.jpg`. Objects already referenced by a `photos` row cannot be deleted by the helper (only by an admin), so approved evidence cannot be stripped afterwards. RLS: authenticated read; write only inside your own uid folder. Display via signed URLs (`signPaths()` in `src/lib/storage.ts`, server-only). Browser uploads directly (`uploadPhoto()` in `src/lib/upload.ts`) after client-side compression (`src/lib/image.ts`), then a Server Action records rows.

## Code map

```
src/
  proxy.ts                      session refresh + redirect to /login (public: /login, /auth, /api/cron)
  app/
    layout.tsx                  root html/body, metadata, viewport
    manifest.ts                 PWA manifest (add to home screen)
    page.tsx                    redirect by role
    login/                      password sign-in (server action `login`, `logout`)
    auth/callback/route.ts      code exchange for email links
    (app)/layout.tsx            helper shell (AppShell + bottom nav)
    (app)/today/page.tsx        buckets: redo / overdue / morning / anytime / evening / window-open / upcoming / done
    (app)/tasks/[id]/page.tsx   task detail + SubmitForm (client) ; tasks/actions.ts `submitCompletion`
    (app)/earnings/page.tsx     wallet: balance, month breakdown, withdrawal history + RequestForm (client)
    (app)/history, report, rules, settings
    admin/                      admin shell + pages (layout guards with requireAdmin())
    api/cron/generate/route.ts  daily materialization (Bearer CRON_SECRET)
    error.tsx / not-found.tsx   bilingual fallbacks
    (app)/loading.tsx, (app)/today/loading.tsx, (app)/tasks/[id]/loading.tsx, admin/loading.tsx
                                skeletons — see "Why the app feels fast" below
  lib/
    money.ts                    peso() formatter, monthRange(), daysUntilPayday()
    env.ts                      env accessors (supports new publishable/secret keys and legacy anon/service_role)
    supabase/{server,client,admin,proxy}.ts
    auth.ts                     getSession() (memoized), requireSession(), requireAdmin(), sessionT()
    queries.ts                  server-only data loaders (INSTANCE_SELECT, COMPLETION_SELECT, getTodayBuckets, getReviewQueue, …)
    storage.ts                  signPaths()
    image.ts / upload.ts        client photo compression + direct upload
    dates.ts                    Manila-aware helpers: todayISO, addDaysISO, diffDays, formatDate, formatDateTime, formatClock
    i18n/                       dictionary (tl/en), getT(locale), pickLang(row, 'title', locale), LocaleProvider/useT (client)
    database.types.ts           hand-maintained Database types + row types (Profile, TaskTemplate, InstanceWithTemplate, CompletionWithPhotos, IssueWithPhotos)
    rules-content.ts            House Rules text
    redirects.ts                safeNextPath() — same-origin redirect guard
  components/
    app-shell.tsx               header + main + BottomNav (client) ; wraps LocaleProvider
    bottom-nav.tsx (client)     items: {href,label,icon:<name>,badge?} — icon NAMES only (see below)
    task-card.tsx, status-badge.tsx, category-icon.tsx, photo-grid.tsx, photo-picker.tsx (client)
    ui/ button, card, badge, field (Input/Textarea/Select/Label/Field/Checkbox), alert, empty, page-header, skeleton
```

## Non-obvious constraints

- **Never pass a component (e.g. a lucide icon) from a Server Component to a Client Component.** It throws `Functions cannot be passed directly to Client Components` at request time — a check `next build` does not catch. `BottomNav` therefore takes an icon *name* (`icon: "today"`) and resolves it from a registry inside the client component.
- **Embedding `task_instances` from `task_completions` is ambiguous** (two FKs: `task_completions.instance_id` and `task_instances.latest_completion_id`). PostgREST answers PGRST201 unless the constraint is named — see `QUEUE_INSTANCE_SELECT` in `src/lib/queries.ts`.
- `dictionary.ts` ends with a compile-time parity guard: `tl` and `en` must define exactly the same keys, otherwise a key added to one language renders as its raw name in the other.
- **Evidence is camera-only.** `PhotoPicker` renders a single `capture="environment"` input; the gallery path is behind an opt-in `allowGallery` prop that no caller sets, so an old photo cannot be passed off as today's proof. `capture` is a platform hint (honoured by iOS Safari and Android Chrome, ignored by desktop browsers), so it is a practical control, not a security boundary.
- Day arithmetic uses UTC (`addDaysISO`), not `date-fns/addDays`, which works in the server's local time and shifts the result on DST-transition dates.
- **Auth uses `getClaims()`, not `getUser()`** (in both `src/lib/auth.ts` and the proxy). This project signs JWTs with asymmetric ES256 keys, so `getClaims()` verifies the signature locally via WebCrypto against the cached JWKS — a CPU check, not a network call — while `getUser()` round-trips to the Auth server on *every* render. It is still safe for authorization: the signature really is verified. Do not "simplify" it back to `getUser()`. (auth-js falls back to a server call automatically for symmetric-secret projects, so the code stays correct either way.)
- The mock Supabase server therefore has to issue a **structurally valid JWT** (`scripts/mock-jwt.mjs`), not an opaque string — an undecodable token makes every page look signed out. It deliberately uses HS256 so auth-js takes the `/auth/v1/user` fallback the mock already serves.

## Earnings

Every template carries a `peso_value` (whole pesos, 0–5000, editable in Admin →
Tasks). A helper accumulates that value for each **approved** completion and
withdraws it on request, subject to admin approval. Four rules the rest of the
app leans on — change any of them and the money stops adding up:

1. **The price is snapshotted onto the completion at submission time.**
   Re-pricing a template never rewrites what someone already earned. Read
   earnings from `task_completions.peso_value`, never by joining back to the
   template.
2. **Only `review_status = 'approved'` pays, and only if `unpaid` is false.** Pending and rejected earn zero; so does an approval the admin ticked "Include in payout" off. The flag exists rather than zeroing `peso_value` so the snapshot stays a truthful record of what the task was worth — and so `backfill_completion_prices()` cannot mistake it for an unpriced row and re-price it into wages. **Every** earnings sum must filter it: `helper_earned_total()`, `admin_wallets()`, `earnings_outlook()` and `getEarningsBreakdown()`. Potential deliberately keeps it, so an unpaid approval reads as a miss against the day's target rather than quietly shrinking the target.
3. **A bypass pays whoever it says did the work** — by default the helper. The
   original rule was "a bypass earns nobody anything, because the admin did
   it", which had the usage backwards: the bypass is mostly used to write down
   work the *helper* did but could not photograph, and the old rule silently
   cost them the money (₱500 on one litter-box wash). `admin_complete_task` now
   takes `p_done_by` (defaulting to `sole_helper()`) and `p_pay`, and files the
   completion under that person. It stays stamped `admin_override`, because it
   is still a completion with no evidence.
   `sole_helper()` returns null unless there is exactly **one** helper, so with
   two the bypass refuses to guess rather than pay the wrong person.
4. **Any payout that is not `rejected` holds its amount against the balance**
   (`helper_payouts_committed`), so the same peso cannot be requested twice.
   Rejecting releases the hold; paying keeps it deducted.

`balance = helper_earned_total() - helper_payouts_committed()`. There is no
stored balance column — it is always derived, so it cannot drift out of sync
with the rows behind it.

Payouts are RPC-only, exactly like completions: `payouts` has a SELECT policy
and nothing else, so a helper can read their own requests but cannot insert one
or mark it paid. Note that an UPDATE with no matching policy is *not* an error
in Postgres — it matches zero rows — which is why `scripts/db-test.ts` asserts
the row is unchanged rather than expecting a throw.

A paid task pays **at least ₱2** — `check (peso_value = 0 or peso_value between
2 and 5000)`. Zero keeps its own meaning: the task is unpaid. Seed values were
assessed by complexity: daily chores are deliberately small (₱2–3, since twelve
of them times thirty days is ~365 completions a month and would otherwise
dominate), the Friday deep clean ₱4–12, and the bimonthly litter-box wash is the
₱500 anchor. A fully-completed month lands near ₱1,330.

Two timing rules that are easy to get wrong:

- **`submitted_at` is `timestamptz` and the DB session is UTC**, so a month
  filter written as a bare `"2026-08-01T00:00:00"` resolves to 08:00 Manila and
  silently drops work done in the first eight hours of the 1st. Always pin the
  bound (`+08:00`, or `at time zone 'Asia/Manila'` in SQL). The Philippines has
  never observed DST, so the offset is fixed.
- **Today counts as an earning day.** `earningDaysLeft()` is
  `daysUntilPayday() + 1`; the bare countdown is only used to detect that today
  *is* payday.

`earnings_outlook()` answers "what is today worth, and the whole month, if
everything gets done" — potential (the value of the tasks) alongside this
caller's approved share of them. A period admits an instance that is **due** in
it *or* whose latest completion was **submitted** in it — a monthly task done
early is due in a later month, and keying on `due_date` alone put its pesos in
the wallet while the month's "earned" line ignored them. Both sides gain the
same rows, so the two numbers stay a fraction of one denominator. **Skipped**
tasks are excluded from potential, since nobody can earn them any more and
leaving them in would show a target that can never be reached. It joins only
`latest_completion_id`, so a reject-and-resubmit cycle counts the task once.

Admins see every helper's wallet on **Admin → Withdrawals** via
`admin_wallets()`, one round trip returning earned / committed / balance /
this-month per profile (including people at zero, so a helper who has not
started is still visible). Each wallet card carries **Record a payment**
(`admin_record_payout`) for cash handed over with no request behind it: the
payout lands `paid` and permanently stamped `admin_recorded = true`, so the
history never reads as if the helper asked for it. It is the same money leaving
the same wallet, so it runs the same balance check under the same row lock as
`request_payout` — an admin records a payment, never invents one.

## Why the app feels fast

Every page is `force-dynamic`, which has two consequences worth knowing before
changing anything here:

1. **A dynamic route is not prefetched at all unless it has a `loading.tsx`.** Without one, tapping a bottom-nav item did nothing visible until a full server render came back. The `loading.tsx` files are what make the tap respond instantly *and* what let the prefetcher warm the route.
2. **The client cache TTL for dynamic segments defaults to 0**, so returning to a tab refetched it every time. `experimental.staleTimes.dynamic` in `next.config.ts` holds prefetched segments for 30 s.

On top of that, request latency is kept down by not stacking round trips:
`sessionT()` and `ensureInstancesAroundToday()` run under one `Promise.all` (the
data query is the only step that truly depends on `ensure`), the admin layout
fetches its guard and its badge counts together, and `getSession()` costs one
query (the profile) instead of three network hops.

## Testing

| command | what it proves |
|---|---|
| `npm run db:test` | Applies the migrations + seed into PGlite with a pinned "today", then asserts scheduling (weekly/monthly/clamping/grace/bimonthly), the QA workflow, atomic submission + evidence rules, and **RLS enforced as the `authenticated` role** (a helper cannot promote themselves, edit templates, self-resolve a report, insert completions directly, or touch another user's storage). |
| `npm run smoke` | Renders **every route** against `scripts/mock-supabase.mjs` and fails on non-2xx or render-time error markers. This is what catches server→client boundary violations and bad field access, which typecheck and build cannot see. |
| `node scripts/shots.mjs …` | Drives a CDP-connected Chrome at a real 390×844 phone viewport: writes screenshots and reports horizontal overflow and sub-44px tap targets. |
| `npm run verify` | typecheck → lint → db:test → build. |

To run the smoke test:

```bash
npm run mock:supabase &                     # port 54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=mock \
CRON_SECRET=mock-cron-secret npx next dev -p 3125 &
npm run smoke -- http://localhost:3125
```

## Conventions

- Money is whole pesos in `integer` columns end to end — no floats, no centavos, so nothing to round wrong. Format with `peso()` from `src/lib/money.ts`.
- Server Components fetch via `src/lib/queries.ts` (RLS applies through the user's session). Pages that depend on auth export `const dynamic = "force-dynamic"` — and therefore need a `loading.tsx` in their segment (or an ancestor) to stay prefetchable.
- Completions and issues are created **only** through their RPCs (`submit_completion`, `create_issue`); other mutations are Server Actions in a colocated `actions.ts` (`"use server"`), always re-check auth (`requireSession()`/`requireAdmin()`) and call `revalidatePath()` for affected routes. Admin-only DB changes go through the RPCs above.
- Client Components get strings via `useT()`; Server Components via `sessionT()` → `t(key, vars)`. Add new keys to **both** `tl` and `en` in `src/lib/i18n/dictionary.ts`.
- Bilingual DB text: `pickLang(row, "title", locale)`.
- Touch targets ≥ 44px; primary actions are full-width `Button size="lg"`. Content max-width `max-w-lg` (helper) / `max-w-5xl` (admin, `wide`).
- Photos always render through `PhotoGrid` with signed URLs from `signPaths()`.
- Never use the service-role client for user-facing reads; only `admin/users` and cron use `createAdminClient()`.
