-- ---------------------------------------------------------------------------
-- The litter-box wash was seeded on the 1st of every second month, anchored to
-- the month AFTER seeding — so the first wash was always a month away, and on
-- the household's database that put it in September while everyone expected it
-- in August. The day-of-month was never specified in the house rules (see the
-- comment in supabase/seed.sql), so it is free to move.
--
-- Every second month on the 22nd, anchored to August 2026: Aug 22, Oct 22,
-- Dec 22, … `supabase/seed.sql` now seeds the same shape for a fresh install.
--
-- Changing the schedule fires the template-change trigger, which drops future
-- pending instances for this template; they are regenerated on next page load
-- (`ensureInstancesAroundToday`) or by the daily cron.
-- ---------------------------------------------------------------------------
update public.task_templates
   set anchor_month = date '2026-08-01',
       month_days   = '{22}'::smallint[]
 where slug = 'bimonthly-wash-litter-boxes'
   and recurrence = 'monthly'
   and (anchor_month, month_days)
       is distinct from (date '2026-08-01', '{22}'::smallint[]);
