"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import type { UserRole } from "@/lib/database.types";

export type UserActionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRole(x: unknown): x is UserRole {
  return x === "admin" || x === "helper";
}

/**
 * Admin: rename a user and/or change their role. Refuses to demote the last
 * remaining admin (which would lock everyone out of /admin).
 */
export async function updateUserProfile(input: {
  id: string;
  full_name: string;
  role: UserRole;
}): Promise<UserActionResult> {
  await requireAdmin();
  const id = String(input?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };
  const full_name = String(input?.full_name ?? "").trim().slice(0, 120);
  if (!full_name) return { ok: false, error: "name_required" };
  const role = input?.role;
  if (!isRole(role)) return { ok: false, error: "invalid_role" };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, role").eq("id", id).maybeSingle();
  if (!target) return { ok: false, error: "not_found" };

  if (target.role === "admin" && role === "helper") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) return { ok: false, error: "last_admin" };
  }

  const { error } = await supabase.from("profiles").update({ full_name, role }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Admin: create a new auth user (helper or admin) with a temporary password.
 * Requires the service-role / secret key on the server.
 */
export async function createUser(input: {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  locale: string;
}): Promise<UserActionResult> {
  await requireAdmin();

  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "invalid_email" };
  const password = String(input?.password ?? "");
  if (password.length < 8 || password.length > 72) return { ok: false, error: "weak_password" };
  const full_name = String(input?.full_name ?? "").trim().slice(0, 120);
  if (!full_name) return { ok: false, error: "name_required" };
  const role = input?.role;
  if (!isRole(role)) return { ok: false, error: "invalid_role" };
  const locale = isLocale(input?.locale) ? input.locale : "tl";

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "no_service_key" };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, locale },
    app_metadata: { role },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
      return { ok: false, error: "email_exists" };
    }
    return { ok: false, error: error.message };
  }

  // The DB trigger creates the profile from the metadata above; make sure the
  // row reflects exactly what the admin chose (best-effort).
  if (data.user) {
    await admin.from("profiles").upsert({ id: data.user.id, full_name, role, locale }, { onConflict: "id" });
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
