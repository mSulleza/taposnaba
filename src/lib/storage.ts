import "server-only";
import { createClient } from "@/lib/supabase/server";
import { EVIDENCE_BUCKET } from "@/lib/env";

/**
 * Sign a batch of storage paths (private bucket) for display. Returns a map
 * path -> signed URL. Paths that fail to sign are omitted.
 */
export async function signPaths(paths: string[], expiresInSeconds = 60 * 60): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(unique, expiresInSeconds);
  if (error || !data) return out;
  for (const item of data) {
    if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
  }
  return out;
}
