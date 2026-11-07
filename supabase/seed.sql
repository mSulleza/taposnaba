-- ============================================================================
-- Seed: task templates derived from HOUSE RULES (cat condo schedule).
-- Idempotent — re-running updates titles/descriptions/schedules by slug.
-- Weekdays: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
-- Dates are relative to "today" in Asia/Manila, so seeding on any day starts
-- the schedule from that day (no artificial backlog of overdue tasks).
-- ============================================================================

insert into public.task_templates
  (slug, title_tl, title_en, description_tl, description_en, category, recurrence,
   weekdays, month_days, interval_months, anchor_month, time_of_day, due_time,
   grace_before, grace_after, evidence_required, min_photos, sort_order, peso_value, starts_on)
values
-- ---------------------------------------------------------------- ARAW-ARAW
('daily-aircon-on',
 'Buksan ang aircon (8–9AM)',
 'Turn on the aircon (8–9AM)',
 'Buksan ang aircon sa pagitan ng 8AM at 9AM. Kunan ng litrato ang aircon na naka-on.',
 'Turn the aircon on between 8AM and 9AM. Take a photo showing it is on.',
 'aircon', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'morning', '08:00',
 0, 0, true, 1, 10, 2, public.manila_today()),

('daily-mop',
 'Mag-mop (kasama ang air purifier filter)',
 'Mop the floor (including the air purifier filter)',
 'Mag-mop ng sahig ng cat condo gamit ang nakalaang mop. Linisin din ang air purifier filter.',
 'Mop the cat condo floor with the dedicated mop. Clean the air purifier filter as well.',
 'cleaning', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, true, 1, 20, 3, public.manila_today()),

('daily-water-fountain',
 'I-check ang water fountain',
 'Check the water fountain',
 'I-check kung may sapat na tubig (i-refill kung paubos na) at tanggalin kung may mga balahibo sa tubig.',
 'Check that there is enough water (refill if running low) and remove any fur floating in the water.',
 'water', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, true, 1, 30, 2, public.manila_today()),

('daily-food-dispenser',
 'I-check ang food dispenser',
 'Check the food dispenser',
 'I-check kung may laman pang cat food (i-refill kung paubos na). Ibalik sa loob ng bowl ang mga pagkain na natapon sa lamesa.',
 'Check that there is still cat food (refill if running low). Return any food spilled on the table into the bowl.',
 'food', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, true, 1, 40, 2, public.manila_today()),

('daily-litter-tray',
 'I-check ang tray ng litter box',
 'Check the litter box tray',
 'I-check kung puno na ang tray ng litter box. Palitan ang plastic kung puno na.',
 'Check whether the litter box tray is full. Replace the plastic liner if it is.',
 'litter', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, true, 1, 50, 2, public.manila_today()),

('daily-litter-sand',
 'I-check ang litter sand',
 'Check the litter sand level',
 'I-check kung sapat pa ang dami ng litter sand. I-refill kung paubos na.',
 'Check that there is enough litter sand. Refill if running low.',
 'litter', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, true, 1, 60, 2, public.manila_today()),

('daily-poop-check',
 'I-check ang itsura ng poop at ihi',
 'Check that poop and pee look normal',
 'Tingnan kung normal ang itsura ng poop at ihi. Kung may kakaiba (malambot, may dugo, kakaibang kulay, sobrang dami o wala), mag-report agad gamit ang "Mag-report".',
 'Check that poop and urine look normal. If anything is unusual (soft, bloody, odd colour, too much or none at all), report it right away using "Report".',
 'health', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, false, 0, 70, 2, public.manila_today()),

('daily-accidents',
 'Linisin ang suka o dumi/ihi sa labas ng litter box',
 'Clean up vomit or poop/pee outside the litter box',
 'I-check maigi ang ilalim ng mga gamit, loob ng carrier, at mga cat shelves. Linisin gamit ang wipes kung may suka o dumi/ihi sa labas ng litter box. Ang poop at wipes ay itapon sa litter box tray; ang suka at wipes ay pwede sa basurahan sa labas.',
 'Check under furniture, inside the carrier and on the wall shelves. Clean any vomit or poop/pee outside the litter box with wipes. Poop + wipes go in the litter box tray; vomit + wipes can go in the outside bin.',
 'cleaning', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, false, 0, 80, 2, public.manila_today()),

('daily-equipment-check',
 'I-check ang mga gamit (fountain, dispenser, litter box, purifier, aircon)',
 'Check the equipment (fountain, dispenser, litter box, purifier, aircon)',
 'Kapag may problema sa water fountain, food dispenser, litter box, air purifier, o aircon — ayusin o i-report agad. Kung may nilalanggam, linisin gamit ang wipes o spray ng Baygon (mag-ingat na wag malagyan ang kainan at tubigan, at wag mag-spray malapit sa pusa).',
 'If there is a problem with the water fountain, food dispenser, litter box, air purifier or aircon — fix it or report it right away. If there are ants, clean with wipes or Baygon spray (keep it away from food/water and away from the cats).',
 'equipment', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, false, 0, 90, 2, public.manila_today()),

('daily-eye-discharge',
 'Tanggalan ng muta ang mga pusa',
 'Wipe eye discharge from the cats',
 'Tanggalan ng muta (gamit ang kamay o wipes) ang mga pusa na madalas may dumi sa mata.',
 'Remove eye discharge (with your hand or wipes) from the cats that often have gunk in their eyes.',
 'grooming', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, false, 0, 100, 2, public.manila_today()),

('daily-play',
 'Makipaglaro sa mga pusa (10 minutes)',
 'Play with the cats (10 minutes)',
 'Makipaglaro sa mga pusa nang hindi bababa sa 10 minutes. Kunan ng litrato habang naglalaro.',
 'Play with the cats for at least 10 minutes. Take a photo while playing.',
 'play', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 0, true, 1, 110, 2, public.manila_today()),

('daily-aircon-off',
 'Patayin ang aircon (6PM), i-on ang dehumidifier, buksan ang bintana at exhaust',
 'Turn off the aircon (6PM), turn on the dehumidifier, open the window and exhaust',
 'Patayin ang aircon ng 6PM. I-on ang dehumidifier at buksan ang bintana at exhaust kapag naka-off ang aircon.',
 'Turn off the aircon at 6PM. Turn on the dehumidifier and open the window and exhaust fan once the aircon is off.',
 'aircon', 'daily', '{}', '{}', 1, date_trunc('month', public.manila_today())::date, 'evening', '18:00',
 0, 0, true, 1, 120, 2, public.manila_today()),

-- ---------------------------------------------------------------- TUWING LUNES
('mon-comb-cats',
 'Suklayan ang mga pusa',
 'Comb the cats',
 'Suklayan ang mga pusa. Gupitin kung may mga buhol na mabilis gupitin.',
 'Comb the cats. Snip out any small mats that are quick to cut.',
 'grooming', 'weekly', '{1}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 200, 6, public.manila_today()),

-- ---------------------------------------------------------------- LUNES + BIYERNES
('mon-fri-refill-litter-sand',
 'I-refill ang litter sand',
 'Refill the litter sand',
 'I-refill ang litter sand ng lahat ng litter boxes.',
 'Top up the litter sand in all litter boxes.',
 'litter', 'weekly', '{1,5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 210, 3, public.manila_today()),

('mon-fri-litter-plastic',
 'Palitan ang plastic ng lahat ng litter boxes',
 'Replace the plastic liner of all litter boxes',
 'Palitan ang plastic ng lahat ng litter boxes.',
 'Replace the plastic liner in every litter box.',
 'litter', 'weekly', '{1,5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 220, 4, public.manila_today()),

('mon-fri-fountain-water',
 'Itapon ang maruming tubig at mag-refill ng bagong tubig sa fountain',
 'Dump the dirty water and refill the fountain with fresh water',
 'Itapon ang maruming tubig at mag-refill ng bagong mineral water sa water fountain.',
 'Pour out the dirty water and refill the water fountain with fresh mineral water.',
 'water', 'weekly', '{1,5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 230, 3, public.manila_today()),

('mon-fri-refill-food',
 'I-refill ang cat food',
 'Refill the cat food',
 'I-refill ang cat food sa dispenser.',
 'Refill the cat food in the dispenser.',
 'food', 'weekly', '{1,5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 240, 2, public.manila_today()),

-- ---------------------------------------------------------------- TUWING BIYERNES (GENERAL CLEANING)
('fri-vacuum',
 'General cleaning: Vacuum maigi',
 'General cleaning: Vacuum thoroughly',
 'Vacuum maigi (pati ang mga gamit). I-move ang mga tables at litter boxes para malinis lahat. I-vacuum pati ang matataas na areas.',
 'Vacuum thoroughly (including the furniture). Move the tables and litter boxes so everything gets cleaned. Vacuum the high areas too.',
 'cleaning', 'weekly', '{5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 2, 300, 12, public.manila_today()),

('fri-wipe-items',
 'General cleaning: Punasan ang mga gamit',
 'General cleaning: Wipe down the furniture and items',
 'Punasan ang mga gamit gamit ang wipes.',
 'Wipe down all the items and furniture with wipes.',
 'cleaning', 'weekly', '{5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 310, 6, public.manila_today()),

('fri-wipe-fountain-area',
 'General cleaning: Punasan maigi ang area ng water fountain',
 'General cleaning: Wipe the water fountain area thoroughly',
 'Punasan ang basa at mga balahibo sa ilalim ng mga fountain gamit ang wipes.',
 'Wipe up the water and fur under the fountains with wipes.',
 'cleaning', 'weekly', '{5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 320, 4, public.manila_today()),

('fri-mop-walls',
 'General cleaning: Mag-mop ng pader at sahig',
 'General cleaning: Mop the walls and floor',
 'Mag-mop ng pader at ng sahig gamit ang nakalaang mop.',
 'Mop the walls and the floor with the dedicated mop.',
 'cleaning', 'weekly', '{5}', '{}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 1, true, 1, 330, 8, public.manila_today()),

-- ---------------------------------------------------------------- IKA-15 at IKA-30
-- The PDF says these may move by one day (before or after) when they land on a
-- Friday (general cleaning day) — hence grace_before/after = 1.
('monthly-wash-fountains',
 'Hugasan ang mga water fountains',
 'Wash the water fountains',
 'Hugasan ang mga water fountains sa lababo sa labas gamit ang sponge na para lang sa kanila.',
 'Wash the water fountains in the outside sink with their dedicated sponge.',
 'water', 'monthly', '{}', '{15,30}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 1, 1, true, 1, 400, 10, public.manila_today()),

('monthly-fountain-filter',
 'Palitan ang filter ng water fountains',
 'Replace the water fountain filters',
 'Palitan ang filter ng mga water fountain (tuwing ika-15).',
 'Replace the filters of the water fountains (every 15th).',
 'water', 'monthly', '{}', '{15}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 1, 1, true, 1, 410, 5, public.manila_today()),

('monthly-nail-trim',
 'Gupitan ng kuko ang mga pusa',
 'Trim the cats'' nails',
 'Gupitan ng kuko ang mga pusa (every 2 weeks: ika-15 at ika-30).',
 'Trim the cats'' nails (every 2 weeks: 15th and 30th).',
 'grooming', 'monthly', '{}', '{15,30}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 1, 1, true, 1, 420, 12, public.manila_today()),

('monthly-wash-food-dispenser',
 'Hugasan ang food dispenser at food bowls',
 'Wash the food dispenser and food bowls',
 'Hugasan ang food dispenser at food bowls sa lababo sa labas gamit ang sponge na para lang sa kanila.',
 'Wash the food dispenser and food bowls in the outside sink with their dedicated sponge.',
 'food', 'monthly', '{}', '{30}', 1, date_trunc('month', public.manila_today())::date, 'anytime', null,
 1, 1, true, 1, 430, 8, public.manila_today()),

-- ---------------------------------------------------------------- TUWING IKALAWANG BUWAN
-- Day-of-month is not specified in the rules; defaulting to the 22nd of every
-- second month with a 3-day window. Adjust in Admin → Tasks.
-- Anchored to the month it is seeded in, not the next one: anchoring forward
-- meant the first wash was always a month away, and re-seeding kept pushing it.
('bimonthly-wash-litter-boxes',
 'Hugasan ang mga litter boxes',
 'Wash the litter boxes',
 'Hugasan ang mga litter boxes sa may garahe (may sariling sponge). Tuwing ikalawang buwan.',
 'Wash the litter boxes in the garage (they have their own sponge). Every second month.',
 'litter', 'monthly', '{}', '{22}', 2, date_trunc('month', public.manila_today())::date, 'anytime', null,
 0, 3, true, 1, 500, 500, public.manila_today())

on conflict (slug) do update set
  title_tl          = excluded.title_tl,
  title_en          = excluded.title_en,
  description_tl    = excluded.description_tl,
  description_en    = excluded.description_en,
  category          = excluded.category,
  recurrence        = excluded.recurrence,
  weekdays          = excluded.weekdays,
  month_days        = excluded.month_days,
  interval_months   = excluded.interval_months,
  -- anchor_month is deliberately NOT updated. It is computed relative to
  -- "today", so re-seeding would walk it forward a month at a time — which for
  -- an every-2-months task flips the parity on every run and can defer it
  -- forever (the litter-box wash never came due). Set it once on insert; move
  -- it afterwards only from Admin → Tasks.
  time_of_day       = excluded.time_of_day,
  due_time          = excluded.due_time,
  grace_before      = excluded.grace_before,
  grace_after       = excluded.grace_after,
  evidence_required = excluded.evidence_required,
  min_photos        = excluded.min_photos,
  sort_order        = excluded.sort_order,
  peso_value        = excluded.peso_value;
