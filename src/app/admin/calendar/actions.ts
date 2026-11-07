"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { addDaysISO, diffDays, isValidISODate } from "@/lib/dates";

export type CalendarActionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateCalendar(id: string) {
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath(`/tasks/${id}`);
}

/** Admin: mark an instance as skipped (e.g. cats at the vet). */
export async function skipInstance(input: { id: string; reason?: string }): Promise<CalendarActionResult> {
  await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };
  const reason = String(input?.reason ?? "").trim().slice(0, 500);

  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_task_instance", {
    p_instance_id: id,
    p_reason: reason || null,
    p_undo: false,
  });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar(id);
  return { ok: true };
}

/** Admin: undo a skip; the instance goes back to its previous state. */
export async function unskipInstance(input: { id: string }): Promise<CalendarActionResult> {
  await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_task_instance", {
    p_instance_id: id,
    p_reason: null,
    p_undo: true,
  });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar(id);
  return { ok: true };
}

/**
 * Admin: mark an instance done outright — no photo evidence, no QA round trip.
 *
 * The reason is mandatory and stored on the completion, which the RPC stamps
 * with `admin_override` so every surface can label it as a bypass rather than
 * letting it pass for a helper's photographed submission.
 */
export async function bypassInstance(input: {
  id: string;
  reason: string;
  /** Who actually did it. Defaults to the household's single helper. */
  doneBy?: string;
  /** Whether it earns. A task recorded for the helper normally pays them. */
  pay?: boolean;
}): Promise<CalendarActionResult> {
  await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };
  const reason = String(input?.reason ?? "").trim().slice(0, 500);
  if (!reason) return { ok: false, error: "reason_required" };
  const doneBy = String(input?.doneBy ?? "");
  if (doneBy && !UUID_RE.test(doneBy)) return { ok: false, error: "invalid_id" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_complete_task", {
    p_instance_id: id,
    p_reason: reason,
    p_done_by: doneBy || null,
    p_pay: input?.pay !== false,
  });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar(id);
  revalidatePath("/admin/review");
  // A bypass can now pay, so the wallets are stale too.
  revalidatePath("/earnings");
  revalidatePath("/admin/payouts");
  return { ok: true };
}

/** Admin: move an instance to another due date (window end follows). */
export async function rescheduleInstance(input: { id: string; dueDate: string }): Promise<CalendarActionResult> {
  await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };
  const dueDate = String(input?.dueDate ?? "");
  if (!isValidISODate(dueDate)) return { ok: false, error: "invalid_date" };

  const supabase = await createClient();
  // Preserve the instance's "grace after" span when moving it.
  const { data: current } = await supabase
    .from("task_instances")
    .select("due_date, window_end")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { ok: false, error: "not_found" };
  const graceAfter = Math.max(0, diffDays(current.due_date, current.window_end));

  const { error } = await supabase.rpc("reschedule_task_instance", {
    p_instance_id: id,
    p_due_date: dueDate,
    p_window_end: addDaysISO(dueDate, graceAfter),
  });
  if (error) return { ok: false, error: error.message };

  revalidateCalendar(id);
  return { ok: true };
}
