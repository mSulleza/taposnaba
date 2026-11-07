"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export type ReviewDecision = "approved" | "rejected";
export type ReviewResult = { ok: true; instanceId: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin QA decision on a completion. Goes through the `review_completion`
 * RPC (security definer) which also updates the instance status.
 */
export async function reviewCompletion(input: {
  completionId: string;
  decision: ReviewDecision;
  note?: string;
  /** Approve without paying for it. Ignored on a rejection, which pays nothing. */
  pay?: boolean;
}): Promise<ReviewResult> {
  await requireAdmin();

  const completionId = String(input?.completionId ?? "");
  const decision = input?.decision;
  const note = String(input?.note ?? "").trim().slice(0, 2000);

  if (!UUID_RE.test(completionId)) return { ok: false, error: "invalid_id" };
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "invalid_decision" };
  if (decision === "rejected" && !note) return { ok: false, error: "note_required" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_completion", {
    p_completion_id: completionId,
    p_decision: decision,
    p_note: note || null,
    p_pay: input?.pay !== false,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "review_failed" };

  const instanceId = data.instance_id;
  revalidatePath("/admin/review");
  revalidatePath("/admin");
  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath(`/tasks/${instanceId}`);
  // Approving decides money, so every wallet view is now stale.
  revalidatePath("/earnings");
  revalidatePath("/admin/payouts");
  return { ok: true, instanceId };
}

/**
 * Admin: include an already-approved completion in the payout, or withhold it.
 * Deliberately NOT `review_completion` — that would rewrite the review note
 * from its own argument and erase what the admin told the helper.
 */
export async function setCompletionPaid(input: {
  completionId: string;
  pay: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const completionId = String(input?.completionId ?? "");
  if (!UUID_RE.test(completionId)) return { ok: false, error: "invalid_id" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_completion_paid", {
    p_completion_id: completionId,
    p_pay: input.pay === true,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/review");
  revalidatePath("/admin");
  revalidatePath("/earnings");
  revalidatePath("/admin/payouts");
  return { ok: true };
}
