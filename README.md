# Tapos na ba? 🐾

*"Is it done yet?"* — a mobile-first tracker for the household helper's cat-care tasks, with **photo evidence** and **QA review**.

- Helper opens the app on her phone → sees today's tasks (Tagalog by default) → taps a task → **takes a photo on the spot** (no gallery picker, so an old photo can't be reused) → submits.
- You (admin) get a QA queue → approve or send back with a note → sent-back tasks reappear for the helper as "Ulitin".
- Schedules come straight from the HOUSE RULES: daily, every Monday, every Friday (general cleaning), 15th/30th (±1 day grace), every 2 months.
- Helper can also file **reports** (sick cat, broken fountain, low stock) with photos.

Stack: **Next.js 16 · Tailwind v4 · Supabase (Postgres/Auth/Storage/RLS) · Vercel**. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design.

## 1. Local setup

```bash
npm install
cp .env.example .env.local     # fill in after step 2
npm run db:test                # verifies migrations + scheduling logic in an in-process Postgres (no Docker needed)
npm run dev                    # http://localhost:3000
```

## 2. Supabase project

> Already done for `taposnaba`. These are the steps to reproduce it (e.g. for a second environment).

1. Create a project at <https://supabase.com/dashboard> (region: Singapore `ap-southeast-1` is closest to the Philippines).
2. Link and push the schema + seed:

   ```bash
   supabase login                     # once
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db push                   # applies supabase/migrations/*
   supabase db query --linked -f supabase/seed.sql   # loads the 26 tasks from the HOUSE RULES
   ```

   (Alternative: paste the two files in `supabase/migrations/` — `…_init.sql` then `…_harden.sql` — into the SQL Editor, then `supabase/seed.sql`.)

3. **Auth settings** (Dashboard → Authentication):
   - Providers → Email: keep *Email* enabled. **Turn off "Allow new users to sign up"** — accounts are created by you, so nobody can self-register.
   - URL Configuration → Site URL: your Vercel URL (e.g. `https://tapos-na-ba.vercel.app`); add `https://<your-domain>/auth/callback` to Redirect URLs.
4. **Create your admin account**: Authentication → Users → *Add user* → email + password, tick *Auto Confirm*. The **first user ever created becomes `admin`** automatically (DB trigger). Every later user defaults to `helper`.
5. Copy keys from Project Settings → API:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - Secret key (`sb_secret_…`) → `SUPABASE_SECRET_KEY` (or legacy `service_role` → `SUPABASE_SERVICE_ROLE_KEY`). Server-only; used to create helper accounts from *Admin → Users* and by the daily cron.

## 3. Deploy to Vercel

> Already done. `scripts/deploy-vercel.sh` re-runs the whole sequence (link → env vars → prod deploy).
> Note `.vercelignore` needs **leading slashes** (`/supabase/`); a bare `supabase/` also matches
> `src/lib/supabase/` and breaks the build.

```bash
npm i -g vercel
vercel                      # link/create the project
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SECRET_KEY
vercel env add CRON_SECRET  # any long random string, e.g. `openssl rand -hex 32`
vercel --prod
```

Or import the Git repo in the Vercel dashboard and set the same env vars. If you use the **Vercel ↔ Supabase integration**, it injects `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for you — both naming styles are supported.

`vercel.json` schedules `/api/cron/generate` daily at 00:05 Philippine time (`5 16 * * *` UTC) to pre-create task instances (the app also creates them on demand, so this is a safety net). On the Hobby plan a daily cron fires approximately, not exactly, on schedule — which is fine here.

After deploying to a new domain, update Supabase Auth → **Site URL** and **Redirect URLs** to match, or email links will point at the wrong host.

## 4. First run

1. **Create your admin account** — Supabase dashboard → Authentication → Users → *Add user* → *Create new user*, enter your email + a password you choose, tick **Auto Confirm User**. Because you are the first user in the database, a trigger makes you `admin`. Do this **before** creating the helper's account.
2. Open the site → sign in with your admin account → you land on **/admin**.
3. **Admin → Users → Create user**: the helper's email + a temporary password (role `helper`, language Tagalog).
4. On the helper's phone: open your deployed URL in Chrome/Safari → *Add to Home Screen* (the app is installable) → sign in.
5. Review the seeded schedule in **Admin → Tasks**; adjust anything (times, which day the litter boxes get washed, photo requirements).

> The PDF has one inconsistency: page 2 says aircon off at **9PM**, the daily schedule page says **6PM**. The seed uses 6PM (the daily schedule). Change it in Admin → Tasks if needed.

## How scheduling works

| Rule in the PDF | Template |
|---|---|
| Araw-araw (daily list, 14 items) | 12 daily tasks (reporting items are handled by *Report* instead) |
| Tuwing Lunes | comb cats + 4 refill/replace tasks (`weekdays {1,5}` shared with Friday) |
| Tuwing Biyernes — general cleaning | vacuum, wipe items, wipe fountain area, mop walls/floor |
| Ika-15 | wash fountains, replace filters, trim nails |
| Ika-30 | wash fountains, trim nails, wash food dispenser & bowls (in February the "30th" becomes the last day) |
| Tuwing ikalawang buwan | wash litter boxes — 1st of every second month, starting the month after you seed; 3-day window. The exact day isn't in the PDF, so adjust it in Admin → Tasks if you prefer another |
| "pwedeng ilipat ng isang araw" | 15th/30th tasks have a ±1-day **grace window**; other tasks can be given grace too |

A template's `starts_on` controls its first day, so shifting the whole schedule is one `update task_templates set starts_on = …` (changing it clears future untouched instances, which regenerate on demand).

Instances are materialized per date; a task shows as **overdue** once its window has passed without an approved/submitted completion. Admins can **skip** (e.g. cats at the vet), **reschedule**, or add a **one-off task** from the calendar/tasks pages.

## Scripts

| command | what |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:test` | run migrations + seed in an in-process Postgres and assert scheduling, QA, evidence rules and RLS |
| `npm run verify` | typecheck → lint → db:test → build |
| `npm run mock:supabase` | fake Supabase (auth/REST/storage) for local rendering — see `docs/ARCHITECTURE.md` |
| `npm run smoke -- <url>` | render every route against the mock and fail on errors |
| `npm run db:push` | `supabase db push` (after `supabase link`) |
| `npm run db:seed` | load `supabase/seed.sql` into the linked project |
| `npm run db:types` | regenerate `src/lib/database.types.ts` from the linked project |
| `node --env-file=.env.local scripts/live-check.mjs` | end-to-end check against the **real** project (creates a temp user, exercises upload → submit → QA → report, then deletes everything it made) |

## Security model

- Everything is behind sign-in; there is no sign-up page. Disable public sign-ups in Supabase (step 2.3).
- Row Level Security: any signed-in household member can *read*; all privileged transitions (review, skip, reschedule, templates, roles) require `admin` and go through `security definer` functions or admin-only policies.
- Photos live in a **private** bucket; users can only upload into their own folder; the app shows them through short-lived signed URLs.
- The service-role key is only used server-side for creating users and by the cron route (which requires `CRON_SECRET`).
- Completions and reports are written by `security definer` functions only. A helper cannot mark a task done without the required photos, submit before the task's window opens, attach evidence to someone else's submission, point a photo row at another user's folder, resolve their own report, or delete evidence that has already been reviewed — even by calling the REST API directly. `npm run db:test` asserts each of these as the `authenticated` role.
