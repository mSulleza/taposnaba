"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";

export type PayoutResult = { ok: true } | { ok: false; error: string };

/**
 * Helper: ask the admin to pay out part of the balance. The RPC re-checks the
 * balance under a row lock, so this cannot be raced into an overdraft even if
 * the page's idea of the balance is stale.
 */
export async function requestPayout(input: { amount: number; note?: string }): Promise<PayoutResult> {
  await requireSession();
  const amount = Math.floor(Number(input?.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "amount_invalid" };
  const note = String(input?.note ?? "").trim().slice(0, 500);

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_payout", {
    p_amount: amount,
    p_note: note || null,
  });
  if (error) {
    // The RPC raises "you can withdraw at most N right now" when the request
    // outruns the balance; surface that as its own message.
    if (/at most/i.test(error.message)) return { ok: false, error: "too_much" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/earnings");
  revalidatePath("/today");
  revalidatePath("/admin/payouts");
  revalidatePath("/admin");
  return { ok: true };
}
