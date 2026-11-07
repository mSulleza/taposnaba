/**
 * Environment access. NEXT_PUBLIC_* values are inlined at build time, so both
 * names must be referenced literally (no dynamic keys).
 */
export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return v;
}

/** Supports both the new publishable key and the legacy anon key. */
export function supabaseAnonKey(): string {
  const v =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v)
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    );
  return v;
}

/** Server-only. Supports both the new secret key and the legacy service role key. */
export function supabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export const APP_TZ = "Asia/Manila";
export const EVIDENCE_BUCKET = "evidence";
