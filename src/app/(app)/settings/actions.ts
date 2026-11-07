"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Update the signed-in user's own profile: display name + UI language only.
 * (Role changes are admin-only and go through /admin/users.)
 */
export async function updateProfile(input: { fullName: string; locale: string }): Promise<UpdateProfileResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const full_name = String(input.fullName ?? "").trim().slice(0, 120);
  if (!full_name) return { ok: false, error: "name_required" };
  const locale = isLocale(input.locale) ? input.locale : session.locale;

  const { error } = await supabase.from("profiles").update({ full_name, locale }).eq("id", session.userId);
  if (error) return { ok: false, error: error.message };

  // Locale is read in every layout, so revalidate the whole tree.
  revalidatePath("/", "layout");
  return { ok: true };
}
