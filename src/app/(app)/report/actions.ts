"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import type { IssueCategory } from "@/lib/database.types";

export type CreateIssueResult = { ok: true; id: string } | { ok: false; error: string };

const CATEGORIES: IssueCategory[] = ["health", "equipment", "supplies", "other"];
const MAX_ISSUE_PHOTOS = 6;

/**
 * Create a report (issue) from the helper. The browser has already uploaded the
 * photos to the private bucket; create_issue() records the issue and its photos
 * in one transaction and re-validates the paths server-side.
 */
export async function createIssue(input: {
  category: string;
  title: string;
  description?: string;
  photoPaths?: string[];
}): Promise<CreateIssueResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const category = CATEGORIES.includes(input.category as IssueCategory) ? (input.category as IssueCategory) : null;
  if (!category) return { ok: false, error: "bad_category" };
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: "title_required" };
  const description = String(input.description ?? "").trim().slice(0, 2000);
  const photoPaths = Array.isArray(input.photoPaths)
    ? input.photoPaths
        .filter((p) => typeof p === "string" && p.startsWith(`${session.userId}/`))
        .slice(0, MAX_ISSUE_PHOTOS)
    : [];

  const { data, error } = await supabase.rpc("create_issue", {
    p_title: title,
    p_category: category,
    p_description: description || null,
    p_paths: photoPaths,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/title is required/i.test(msg)) return { ok: false, error: "title_required" };
    return { ok: false, error: msg || "insert_failed" };
  }
  const issue = data as { id: string } | null;
  if (!issue?.id) return { ok: false, error: "insert_failed" };

  revalidatePath("/report");
  revalidatePath("/admin");
  revalidatePath("/admin/issues");
  return { ok: true, id: issue.id };
}
