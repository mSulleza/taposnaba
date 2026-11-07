import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/dates";
import type {
  CompletionWithPhotos,
  InstanceWithTemplate,
  IssueWithPhotos,
  IssueStatus,
  EarningsOutlook,
  HelperWallet,
  Payout,
  PayoutWithHelper,
  Photo,
  Profile,
  TaskCompletion,
  TaskInstance,
  TaskTemplate,
} from "@/lib/database.types";

/**
 * Select fragment for an instance joined with its template, plus just enough of
 * the completion it points at to tell an admin bypass from a real submission.
 * The FK must be named: `latest_completion_id` is one of two FKs between these
 * tables (see QUEUE_INSTANCE_SELECT below).
 */
export const INSTANCE_SELECT =
  "*, template:task_templates(*), latest:task_completions!task_instances_latest_completion_fk(admin_override)";

/**
 * Embedding task_instances from task_completions is AMBIGUOUS: there are two
 * FKs between the tables (task_completions.instance_id and
 * task_instances.latest_completion_id). PostgREST returns PGRST201 unless the
 * constraint is named explicitly.
 */
export const QUEUE_INSTANCE_SELECT =
  "instance:task_instances!task_completions_instance_id_fkey(*, template:task_templates(*))";

/**
 * How far ahead a MONTHLY task shows up in "Paparating", and how early it may
 * therefore be submitted. Must equal `public.early_submit_days()` in
 * supabase/migrations/20260821000000_monthly_visibility.sql — a larger number
 * here surfaces tasks the database will refuse to accept.
 */
export const UPCOMING_DAYS = 21;

/** Select fragment for a completion with photos + people. */
export const COMPLETION_SELECT =
  "*, photos(*), submitter:profiles!task_completions_submitted_by_fkey(id, full_name), reviewer:profiles!task_completions_reviewed_by_fkey(id, full_name)";

/**
 * Make sure task instances exist around today. Idempotent and cheap; called
 * from pages that list tasks (and by the daily cron).
 */
export const ensureInstancesAroundToday = cache(async (): Promise<void> => {
  const supabase = await createClient();
  const today = todayISO();
  await supabase.rpc("ensure_task_instances", {
    p_from: addDaysISO(today, -7),
    p_to: addDaysISO(today, 31),
  });
});

export type TodayBuckets = {
  today: string;
  overdue: InstanceWithTemplate[]; // past window, not finished
  redo: InstanceWithTemplate[]; // rejected — needs redoing, whatever the date
  dueToday: InstanceWithTemplate[]; // due today (any status)
  windowOpen: InstanceWithTemplate[]; // due another day but window includes today, unfinished
  submitted: InstanceWithTemplate[]; // submitted early (due another day), still awaiting QA
  upcoming: InstanceWithTemplate[]; // monthly work due soon — doable ahead of time
};

/**
 * The next occurrence of each MONTHLY task whose window has not opened yet.
 *
 * A monthly task exists on exactly one day of the month, so without this it is
 * invisible on the other ~28 — and a helper who does it early has nothing to
 * submit against and earns nothing. One card per template (the earliest), so a
 * task with two month_days does not show up twice.
 */
async function getUpcomingMonthly(today: string): Promise<InstanceWithTemplate[]> {
  const supabase = await createClient();
  // Filtering on an embedded resource needs an `!inner` join that the typed
  // client cannot express; there are only a handful of templates, so resolve
  // the monthly ones first and filter instances by id.
  const { data: tpls, error: tplErr } = await supabase
    .from("task_templates")
    .select("id")
    .eq("active", true)
    .eq("recurrence", "monthly");
  if (tplErr) throw tplErr;
  const ids = (tpls ?? []).map((t) => t.id);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("task_instances")
    .select(INSTANCE_SELECT)
    .in("template_id", ids)
    .eq("status", "pending")
    .gt("window_start", today)
    .lte("due_date", addDaysISO(today, UPCOMING_DAYS))
    .order("due_date", { ascending: true });
  if (error) throw error;
  const seen = new Set<string>();
  const out: InstanceWithTemplate[] = [];
  for (const r of (data ?? []) as unknown as InstanceWithTemplate[]) {
    if (!r.template || seen.has(r.template_id)) continue;
    seen.add(r.template_id);
    out.push(r);
  }
  return out;
}

function sortInstances(list: InstanceWithTemplate[]) {
  const todOrder = { morning: 0, anytime: 1, evening: 2 } as const;
  return list.sort((a, b) => {
    const t = todOrder[a.template.time_of_day] - todOrder[b.template.time_of_day];
    if (t !== 0) return t;
    if (a.template.sort_order !== b.template.sort_order) return a.template.sort_order - b.template.sort_order;
    return a.due_date.localeCompare(b.due_date);
  });
}

/** Everything the helper needs to see for "today". */
export async function getTodayBuckets(today = todayISO()): Promise<TodayBuckets> {
  const supabase = await createClient();
  const from = addDaysISO(today, -45); // overdue lookback
  const [open, upcoming] = await Promise.all([
    supabase
      .from("task_instances")
      .select(INSTANCE_SELECT)
      .gte("due_date", from)
      .lte("window_start", today)
      .order("due_date", { ascending: true }),
    getUpcomingMonthly(today),
  ]);
  const { data, error } = open;
  if (error) throw error;
  const rows = (data ?? []) as unknown as InstanceWithTemplate[];

  const overdue: InstanceWithTemplate[] = [];
  const redo: InstanceWithTemplate[] = [];
  const dueToday: InstanceWithTemplate[] = [];
  const windowOpen: InstanceWithTemplate[] = [];
  const submitted: InstanceWithTemplate[] = [];

  for (const r of rows) {
    // A rejection always needs action, whatever the date — never let it be
    // filed away as merely "overdue", or the helper loses the redo request.
    if (r.status === "rejected") {
      redo.push(r);
      if (r.due_date === today) dueToday.push(r);
      continue;
    }
    if (r.due_date === today) {
      dueToday.push(r);
      continue;
    }
    if (r.window_end < today) {
      if (r.status === "pending") overdue.push(r);
      continue;
    }
    // Window covers today but the task is due on another day.
    if (r.status === "pending") windowOpen.push(r);
    // Submitted early: keep it visible so it doesn't silently disappear.
    else if (r.status === "submitted") submitted.push(r);
  }

  return {
    today,
    overdue: sortInstances(overdue),
    redo: sortInstances(redo),
    dueToday: sortInstances(dueToday),
    windowOpen: sortInstances(windowOpen),
    submitted: sortInstances(submitted),
    upcoming,
  };
}

/** One instance with template + all completions (newest first) with photos. */
export async function getInstanceDetail(id: string): Promise<{
  instance: InstanceWithTemplate;
  completions: CompletionWithPhotos[];
} | null> {
  const supabase = await createClient();
  const { data: inst } = await supabase.from("task_instances").select(INSTANCE_SELECT).eq("id", id).maybeSingle();
  if (!inst) return null;
  const { data: comps } = await supabase
    .from("task_completions")
    .select(COMPLETION_SELECT)
    .eq("instance_id", id)
    .order("submitted_at", { ascending: false });
  return {
    instance: inst as unknown as InstanceWithTemplate,
    completions: (comps ?? []) as unknown as CompletionWithPhotos[],
  };
}

/** Instances in a date range (by due_date), joined with template. */
export async function getInstancesInRange(from: string, to: string): Promise<InstanceWithTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_instances")
    .select(INSTANCE_SELECT)
    .gte("due_date", from)
    .lte("due_date", to)
    .order("due_date", { ascending: false });
  if (error) throw error;
  return sortInstances((data ?? []) as unknown as InstanceWithTemplate[]);
}

/**
 * A completion is only reviewable if its instance (and that instance's
 * template) came back with it. Dropping incomplete rows keeps one bad row from
 * taking down the whole QA page.
 */
function withInstance(data: unknown): (CompletionWithPhotos & { instance: InstanceWithTemplate })[] {
  const rows = (data ?? []) as (CompletionWithPhotos & { instance?: InstanceWithTemplate | null })[];
  return rows.filter(
    (r): r is CompletionWithPhotos & { instance: InstanceWithTemplate } => Boolean(r.instance?.template)
  );
}

/** Pending QA queue: completions awaiting review, oldest first. */
export async function getReviewQueue(): Promise<
  (CompletionWithPhotos & { instance: InstanceWithTemplate })[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_completions")
    .select(`${COMPLETION_SELECT}, ${QUEUE_INSTANCE_SELECT}`)
    .eq("review_status", "pending")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return withInstance(data);
}

/** Recently reviewed completions (for the QA page's history tab). */
export async function getRecentlyReviewed(limit = 30): Promise<
  (CompletionWithPhotos & { instance: InstanceWithTemplate })[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_completions")
    .select(`${COMPLETION_SELECT}, ${QUEUE_INSTANCE_SELECT}`)
    .neq("review_status", "pending")
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return withInstance(data);
}

export async function getTemplates(includeInactive = true): Promise<TaskTemplate[]> {
  const supabase = await createClient();
  let q = supabase.from("task_templates").select("*").order("sort_order").order("title_en");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TaskTemplate[];
}

export async function getTemplate(id: string): Promise<TaskTemplate | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("task_templates").select("*").eq("id", id).maybeSingle();
  return (data as TaskTemplate | null) ?? null;
}

export async function getIssues(opts: { mineOnly?: string; status?: IssueStatus[] } = {}): Promise<IssueWithPhotos[]> {
  const supabase = await createClient();
  let q = supabase
    .from("issues")
    .select("*, photos(*), reporter:profiles!issues_reported_by_fkey(id, full_name)")
    .order("created_at", { ascending: false });
  if (opts.mineOnly) q = q.eq("reported_by", opts.mineOnly);
  if (opts.status?.length) q = q.in("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as IssueWithPhotos[];
}

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

/** Instances past their window that were never finished (admin follow-up). */
export async function getOverdueInstances(today = todayISO(), limit = 50): Promise<InstanceWithTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_instances")
    .select(INSTANCE_SELECT)
    .lt("window_end", today)
    .in("status", ["pending", "rejected"])
    .order("due_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as InstanceWithTemplate[];
}

/** Admin dashboard counters. */
export async function getDashboardCounts(today = todayISO()) {
  const supabase = await createClient();
  const [dueToday, queue, issues, overdue, payouts] = await Promise.all([
    supabase.from("task_instances").select("id,status", { count: "exact" }).eq("due_date", today),
    supabase.from("task_completions").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("issues").select("id", { count: "exact", head: true }).in("status", ["open", "acknowledged"]),
    supabase
      .from("task_instances")
      .select("id", { count: "exact", head: true })
      .lt("window_end", today)
      .in("status", ["pending", "rejected"]),
    // Requested *and* approved: both still owe the helper money.
    supabase.from("payouts").select("amount").in("status", ["requested", "approved"]),
  ]);
  const rows = (dueToday.data ?? []) as Pick<TaskInstance, "id" | "status">[];
  const total = rows.length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const submitted = rows.filter((r) => r.status === "submitted").length;
  const skipped = rows.filter((r) => r.status === "skipped").length;
  return {
    today,
    total,
    approved,
    submitted,
    skipped,
    remaining: total - approved - submitted - skipped,
    queue: queue.count ?? 0,
    openIssues: issues.count ?? 0,
    overdue: overdue.count ?? 0,
    payouts: (payouts.data ?? []).length,
    payoutsOwed: ((payouts.data ?? []) as { amount: number }[]).reduce((sum, p) => sum + p.amount, 0),
  };
}

/** Collect all storage paths from a set of completions/issues (for signing). */
export function collectPaths(items: { photos?: Photo[] }[]): string[] {
  return items.flatMap((i) => (i.photos ?? []).map((p) => p.storage_path));
}

export type { TaskCompletion };

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export type Wallet = {
  /** Everything ever earned from approved submissions. */
  earned: number;
  /** Held by payouts that are requested, approved or already paid. */
  committed: number;
  /** What can be withdrawn right now. */
  balance: number;
};

/**
 * The signed-in helper's wallet. The three totals come from one round trip;
 * they are derived from the same rows, so fetching them separately would let
 * them disagree.
 */
export const getWallet = cache(async (): Promise<Wallet> => {
  const supabase = await createClient();
  const [earned, committed] = await Promise.all([
    supabase.rpc("helper_earned_total", {}),
    supabase.rpc("helper_payouts_committed", {}),
  ]);
  if (earned.error) throw earned.error;
  if (committed.error) throw committed.error;
  const e = Number(earned.data ?? 0);
  const c = Number(committed.data ?? 0);
  return { earned: e, committed: c, balance: e - c };
});

/**
 * What is on the table today and for the rest of the month. Cached per request
 * because both the Today hero and the Earnings page want it.
 */
export const getEarningsOutlook = cache(async (): Promise<EarningsOutlook> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("earnings_outlook", {});
  if (error) throw error;
  // A `returns table` RPC comes back as an array of one row.
  const row = (Array.isArray(data) ? data[0] : data) as EarningsOutlook | undefined;
  return row ?? { today_potential: 0, today_earned: 0, month_potential: 0, month_earned: 0 };
});

/** Approved completions in a date range, for the earnings breakdown. */
export async function getEarningsBreakdown(
  from: string,
  to: string
): Promise<{ total: number; rows: { title_tl: string; title_en: string; count: number; total: number }[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_completions")
    .select("peso_value, submitted_at, instance:task_instances!task_completions_instance_id_fkey(template:task_templates(title_tl, title_en))")
    .eq("review_status", "approved")
    // An approval the admin chose not to pay for is not earnings.
    .eq("unpaid", false)
    // submitted_at is timestamptz and the DB session is UTC, so a bare
    // "2026-08-01T00:00:00" is read as UTC — which is 08:00 Manila, silently
    // dropping work done in the first eight hours of the month. Pin the bounds
    // to Manila explicitly. The Philippines has never observed DST, so the
    // +08:00 offset is fixed and safe to hard-code.
    .gte("submitted_at", `${from}T00:00:00+08:00`)
    .lte("submitted_at", `${to}T23:59:59.999+08:00`)
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  type Row = { peso_value: number; instance?: { template?: { title_tl: string; title_en: string } | null } | null };
  const byTitle = new Map<string, { title_tl: string; title_en: string; count: number; total: number }>();
  let total = 0;
  for (const r of (data ?? []) as unknown as Row[]) {
    const tpl = r.instance?.template;
    if (!tpl) continue;
    total += r.peso_value;
    const hit = byTitle.get(tpl.title_en);
    if (hit) {
      hit.count += 1;
      hit.total += r.peso_value;
    } else {
      byTitle.set(tpl.title_en, { title_tl: tpl.title_tl, title_en: tpl.title_en, count: 1, total: r.peso_value });
    }
  }
  return { total, rows: [...byTitle.values()].sort((a, b) => b.total - a.total) };
}

/** The signed-in helper's own payout history, newest first. */
export async function getMyPayouts(limit = 24): Promise<Payout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payouts")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Payout[];
}

/** Admin: every payout, with who asked and who decided. */
export async function getPayouts(limit = 60): Promise<PayoutWithHelper[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(
      "*, helper:profiles!payouts_helper_id_fkey(id, full_name), reviewer:profiles!payouts_reviewed_by_fkey(id, full_name)"
    )
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PayoutWithHelper[];
}

/**
 * Admin: every profile's wallet in one round trip. Includes people who have
 * earned nothing, so a helper who has not started still shows up at zero
 * rather than silently vanishing from the list.
 */
export async function getHelperWallets(): Promise<HelperWallet[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_wallets", {});
  if (error) throw error;
  return (data ?? []) as HelperWallet[];
}
