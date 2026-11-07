"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export type PayoutDecision = "approved" | "paid" | "rejected";
export type ReviewPayoutResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin: approve, mark paid, or reject a withdrawal request. */
export async function reviewPayout(input: {
  payoutId: string;
  decision: PayoutDecision;
  note?: string;
}): Promise<ReviewPayoutResult> {
  await requireAdmin();
  const id = String(input?.payoutId ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };
  const decision = input?.decision;
  if (decision !== "approved" && decision !== "paid" && decision !== "rejected") {
    return { ok: false, error: "invalid_decision" };
  }
  const note = String(input?.note ?? "").trim().slice(0, 500);
  if (decision === "rejected" && !note) return { ok: false, error: "note_required" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_payout", {
    p_payout_id: id,
    p_decision: decision,
    p_note: note || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payouts");
  revalidatePath("/admin");
  revalidatePath("/earnings");
  return { ok: true };
}

/**
 * Admin: record cash already handed over, with no request behind it. Lands as
 * `paid` immediately — the DB still refuses more than the helper's balance.
 */
export async function recordPayout(input: {
  helperId: string;
  amount: number;
  note?: string;
}): Promise<ReviewPayoutResult> {
  await requireAdmin();
  const helperId = String(input?.helperId ?? "");
  if (!UUID_RE.test(helperId)) return { ok: false, error: "invalid_id" };
  const amount = Math.floor(Number(input?.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid_amount" };
  const note = String(input?.note ?? "").trim().slice(0, 500);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_record_payout", {
    p_helper_id: helperId,
    p_amount: amount,
    p_note: note || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payouts");
  revalidatePath("/admin");
  revalidatePath("/earnings");
  return { ok: true };
}
