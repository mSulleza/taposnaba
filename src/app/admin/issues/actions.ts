"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export type IssueActionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateIssues() {
  revalidatePath("/admin/issues");
  revalidatePath("/admin");
  revalidatePath("/report");
}

/** Admin: mark a report as seen (acknowledged). */
export async function acknowledgeIssue(input: { id: string }): Promise<IssueActionResult> {
  const session = await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("issues")
    .update({
      status: "acknowledged",
      acknowledged_by: session.userId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "resolved");
  if (error) return { ok: false, error: error.message };

  revalidateIssues();
  return { ok: true };
}

/** Admin: mark a report as resolved, with an optional note for the helper. */
export async function resolveIssue(input: { id: string; note?: string }): Promise<IssueActionResult> {
  const session = await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };
  const note = String(input?.note ?? "").trim().slice(0, 2000);
  const now = new Date().toISOString();

  const supabase = await createClient();
  const { data: current } = await supabase.from("issues").select("acknowledged_by").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: "not_found" };

  const { error } = await supabase
    .from("issues")
    .update({
      status: "resolved",
      resolved_by: session.userId,
      resolved_at: now,
      resolution_note: note || null,
      // Resolving implies it was seen.
      acknowledged_by: current.acknowledged_by ?? session.userId,
      ...(current.acknowledged_by ? {} : { acknowledged_at: now }),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateIssues();
  return { ok: true };
}

/** Admin: reopen a resolved (or acknowledged) report. */
export async function reopenIssue(input: { id: string }): Promise<IssueActionResult> {
  await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("issues")
    .update({
      status: "open",
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateIssues();
  return { ok: true };
}
