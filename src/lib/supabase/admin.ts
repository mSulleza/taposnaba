import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseServiceKey, supabaseUrl } from "@/lib/env";

/**
 * Service-role client (bypasses RLS). Server-only. Used for admin user
 * management and the cron job. Returns null when the key is not configured.
 */
export function createAdminClient() {
  const key = supabaseServiceKey();
  if (!key) return null;
  return createSupabaseClient<Database>(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
