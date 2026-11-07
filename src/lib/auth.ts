import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/database.types";
import { getT, isLocale, type Locale } from "@/lib/i18n";

export type Session = {
  userId: string;
  email: string | null;
  profile: Profile;
  locale: Locale;
  isAdmin: boolean;
};

/**
 * Current user + profile, memoized per request. Returns null when signed out.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  // getClaims() verifies the JWT signature locally against the project's
  // asymmetric (ES256) signing keys, so this is a CPU operation, not a network
  // one — unlike getUser(), which round-trips to the Auth server on every
  // render. It is still safe for authorization: the signature is checked, not
  // merely decoded. (On a project using the legacy symmetric secret it falls
  // back to a server call, so this stays correct either way.)
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : data?.claims;
  if (!claims?.sub) return null;
  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  // Profile is created by a DB trigger; on the rare race it is missing,
  // fall back to a helper view rather than crashing.
  const p: Profile =
    profile ??
    ({
      id: userId,
      full_name: email?.split("@")[0] ?? "",
      role: "helper",
      locale: "tl",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies Profile);

  const locale: Locale = isLocale(p.locale) ? p.locale : "tl";
  return { userId, email, profile: p, locale, isAdmin: p.role === "admin" };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!s.isAdmin) redirect("/today");
  return s;
}

/** Convenience for server components: session + translator. */
export async function sessionT() {
  const s = await requireSession();
  return { ...s, t: getT(s.locale) };
}

/**
 * Same as sessionT, for admin pages. The admin layout checks the role too, but a
 * page can render without its layout re-running, so each admin page checks it.
 */
export async function adminT() {
  const s = await requireAdmin();
  return { ...s, t: getT(s.locale) };
}
