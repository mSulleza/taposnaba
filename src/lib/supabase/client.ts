"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Supabase client for Client Components (browser). Singleton per tab. */
export function createClient() {
  if (!client) {
    client = createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
  }
  return client;
}
