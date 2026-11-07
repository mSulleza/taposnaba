"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";

export type SubmitResult = { ok: true; completionId: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Record a completion for a task instance. The browser has already uploaded
 * the photos to the private bucket; submit_completion() then records the
 * completion and its evidence in a single transaction and re-checks the rules
 * server-side (task still open, window already started, min_photos met, every
 * path really uploaded and inside the caller's own folder).
 */
export async function submitCompletion(input: {
  instanceId: string;
  note: string;
  photoPaths: string[];
}): Promise<SubmitResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const instanceId = String(input.instanceId ?? "");
  if (!UUID_RE.test(instanceId)) return { ok: false, error: "not_found" };
  const note = String(input.note ?? "").trim().slice(0, 2000);
  const photoPaths = Array.isArray(input.photoPaths)
    ? input.photoPaths
        .filter((p) => typeof p === "string" && p.startsWith(`${session.userId}/`))
        .slice(0, 12)
    : [];

  const { data, error } = await supabase.rpc("submit_completion", {
    p_instance_id: instanceId,
    p_note: note || null,
    p_paths: photoPaths,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/already (approved|skipped)/i.test(msg)) return { ok: false, error: "locked" };
    if (/at least .* photo/i.test(msg)) return { ok: false, error: "need_photos" };
    if (/cannot be submitted yet/i.test(msg)) return { ok: false, error: "too_early" };
    if (/not found/i.test(msg)) return { ok: false, error: "not_found" };
    return { ok: false, error: msg || "insert_failed" };
  }

  const completion = data as { id: string } | null;
  if (!completion?.id) return { ok: false, error: "insert_failed" };

  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath(`/tasks/${instanceId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/review");
  return { ok: true, completionId: completion.id };
}
