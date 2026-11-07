"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isValidISODate, todayISO } from "@/lib/dates";
import type { RecurrenceKind, TaskCategory, TaskTemplate, TimeOfDay } from "@/lib/database.types";
import type { MessageKey } from "@/lib/i18n";

// Note: "use server" files may only export async functions, so these stay local.
const TASK_CATEGORIES: TaskCategory[] = [
  "cleaning",
  "aircon",
  "water",
  "food",
  "litter",
  "health",
  "grooming",
  "play",
  "equipment",
  "other",
];
const RECURRENCES: RecurrenceKind[] = ["daily", "weekly", "monthly"];
const TIMES_OF_DAY: TimeOfDay[] = ["morning", "anytime", "evening"];

/** Shape the TemplateForm sends. Everything is plain JSON (strings/numbers/booleans). */
export type TemplateInput = {
  id?: string;
  title_tl: string;
  title_en: string;
  description_tl: string;
  description_en: string;
  category: TaskCategory;
  recurrence: RecurrenceKind;
  weekdays: number[];
  month_days: number[];
  interval_months: number;
  /** YYYY-MM */
  anchor_month: string;
  time_of_day: TimeOfDay;
  /** HH:MM or "" */
  due_time: string;
  grace_before: number;
  grace_after: number;
  evidence_required: boolean;
  min_photos: number;
  sort_order: number;
  /** Whole pesos an approved completion pays the helper. */
  peso_value: number;
  starts_on: string;
  /** YYYY-MM-DD or "" */
  ends_on: string;
  active: boolean;
};

export type SaveTemplateResult =
  | { ok: true; id: string }
  | { ok: false; error: string; errors?: MessageKey[] };

export type SimpleResult = { ok: true } | { ok: false; error: string; errors?: MessageKey[] };

type TemplateRow = Omit<TaskTemplate, "id" | "slug" | "created_by" | "created_at" | "updated_at">;

function toInt(v: unknown, fallback = NaN): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isInteger(n) ? n : fallback;
}

function isEnum<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/**
 * Server-side validation mirroring the DB check constraints. Returns the
 * cleaned row or a list of message keys describing what is wrong.
 */
function validateTemplate(input: TemplateInput): { row: TemplateRow; errors: MessageKey[] } {
  const errors: MessageKey[] = [];

  const title_tl = String(input.title_tl ?? "").trim().slice(0, 200);
  const title_en = String(input.title_en ?? "").trim().slice(0, 200);
  if (!title_tl) errors.push("tpl_err_title_tl");
  if (!title_en) errors.push("tpl_err_title_en");

  const description_tl = String(input.description_tl ?? "").trim().slice(0, 4000) || null;
  const description_en = String(input.description_en ?? "").trim().slice(0, 4000) || null;

  const category = isEnum(TASK_CATEGORIES, input.category) ? input.category : null;
  const recurrence = isEnum(RECURRENCES, input.recurrence) ? input.recurrence : null;
  const time_of_day = isEnum(TIMES_OF_DAY, input.time_of_day) ? input.time_of_day : null;
  if (!category || !recurrence || !time_of_day) errors.push("tpl_err_choice");

  const weekdays = Array.from(
    new Set((Array.isArray(input.weekdays) ? input.weekdays : []).map((d) => toInt(d)).filter((d) => d >= 0 && d <= 6))
  ).sort((a, b) => a - b);
  const month_days = Array.from(
    new Set((Array.isArray(input.month_days) ? input.month_days : []).map((d) => toInt(d)).filter((d) => d >= 1 && d <= 31))
  ).sort((a, b) => a - b);
  if (recurrence === "weekly" && weekdays.length === 0) errors.push("tpl_err_weekdays");
  if (recurrence === "monthly" && month_days.length === 0) errors.push("tpl_err_month_days");

  const interval_months = recurrence === "monthly" ? toInt(input.interval_months, 1) : 1;
  if (interval_months < 1 || interval_months > 24) errors.push("tpl_err_interval");

  // anchor_month arrives as YYYY-MM; store as first of month.
  let anchor_month = `${todayISO().slice(0, 7)}-01`;
  const anchorRaw = String(input.anchor_month ?? "").trim();
  if (anchorRaw) {
    const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(anchorRaw);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) anchor_month = `${m[1]}-${m[2]}-01`;
    else if (recurrence === "monthly") errors.push("tpl_err_anchor");
  }

  let due_time: string | null = null;
  const dueRaw = String(input.due_time ?? "").trim();
  if (dueRaw) {
    const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(dueRaw);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) due_time = `${m[1]}:${m[2]}:00`;
    else errors.push("tpl_err_due_time");
  }

  const grace_before = toInt(input.grace_before, 0);
  const grace_after = toInt(input.grace_after, 0);
  if (grace_before < 0 || grace_before > 14 || grace_after < 0 || grace_after > 14) errors.push("tpl_err_grace");

  const evidence_required = Boolean(input.evidence_required);
  let min_photos = toInt(input.min_photos, evidence_required ? 1 : 0);
  if (!evidence_required) min_photos = 0;
  if (min_photos < 0 || min_photos > 6) errors.push("tpl_err_min_photos");
  if (evidence_required && min_photos === 0) min_photos = 1;

  const sort_order = toInt(input.sort_order, 100);

  // What one approved completion pays. 0 means the task is unpaid; the upper
  // bound matches the DB check constraint so a typo fails here, not in Postgres.
  const peso_value = toInt(input.peso_value, 0);
  if (peso_value < 0 || peso_value > 5000) errors.push("tpl_err_peso_value");

  const starts_on = String(input.starts_on ?? "").trim();
  if (!isValidISODate(starts_on)) errors.push("tpl_err_starts_on");
  const endsRaw = String(input.ends_on ?? "").trim();
  const ends_on = endsRaw ? endsRaw : null;
  if (ends_on && (!isValidISODate(ends_on) || (isValidISODate(starts_on) && ends_on < starts_on))) {
    errors.push("tpl_err_ends_on");
  }

  const row: TemplateRow = {
    title_tl,
    title_en,
    description_tl,
    description_en,
    category: category ?? "other",
    recurrence: recurrence ?? "daily",
    weekdays: recurrence === "weekly" ? weekdays : [],
    month_days: recurrence === "monthly" ? month_days : [],
    interval_months,
    anchor_month,
    time_of_day: time_of_day ?? "anytime",
    due_time,
    grace_before,
    grace_after,
    evidence_required,
    min_photos,
    sort_order,
    peso_value,
    active: Boolean(input.active),
    starts_on,
    ends_on,
  };
  return { row, errors };
}

function revalidateTemplateRoutes(id?: string) {
  revalidatePath("/admin/templates");
  if (id) revalidatePath(`/admin/templates/${id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  revalidatePath("/today");
}

/** Create or update a task template (admin only; RLS also enforces this). */
export async function saveTemplate(input: TemplateInput): Promise<SaveTemplateResult> {
  const session = await requireAdmin();
  const { row, errors } = validateTemplate(input);
  if (errors.length) return { ok: false, error: "validation", errors };

  const supabase = await createClient();
  const id = typeof input.id === "string" && input.id ? input.id : null;

  if (id) {
    const { data, error } = await supabase.from("task_templates").update(row).eq("id", id).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "not_found", errors: ["tpl_err_not_found"] };
    revalidateTemplateRoutes(id);
    return { ok: true, id };
  }

  const { data, error } = await supabase
    .from("task_templates")
    .insert({ ...row, created_by: session.userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };
  revalidateTemplateRoutes(data.id);
  return { ok: true, id: data.id };
}

/** Delete a template. Instances/completions/photo rows cascade in the DB. */
export async function deleteTemplate(id: string): Promise<SimpleResult> {
  await requireAdmin();
  const templateId = String(id ?? "");
  if (!templateId) return { ok: false, error: "not_found", errors: ["tpl_err_not_found"] };
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_templates").delete().eq("id", templateId).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found", errors: ["tpl_err_not_found"] };
  revalidateTemplateRoutes(templateId);
  revalidatePath("/history");
  revalidatePath("/admin/review");
  return { ok: true };
}

/** Quick activate/deactivate without touching the rest of the row. */
export async function setTemplateActive(id: string, active: boolean): Promise<SimpleResult> {
  await requireAdmin();
  const templateId = String(id ?? "");
  if (!templateId) return { ok: false, error: "not_found", errors: ["tpl_err_not_found"] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_templates")
    .update({ active: Boolean(active) })
    .eq("id", templateId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found", errors: ["tpl_err_not_found"] };
  revalidateTemplateRoutes(templateId);
  return { ok: true };
}

export type AdhocInput = {
  title_tl: string;
  title_en: string;
  due_date: string;
  category: TaskCategory;
  evidence_required: boolean;
  /** Whole pesos this one-off task pays once approved. */
  peso_value: number;
};

/** One-off task for a single date via the create_adhoc_task RPC. */
export async function createAdhocTask(input: AdhocInput): Promise<SimpleResult> {
  await requireAdmin();
  const errors: MessageKey[] = [];
  const title_tl = String(input.title_tl ?? "").trim().slice(0, 200);
  const title_en = String(input.title_en ?? "").trim().slice(0, 200);
  const due_date = String(input.due_date ?? "").trim();
  if (!title_tl && !title_en) errors.push("tpl_err_title_tl");
  if (!isValidISODate(due_date)) errors.push("tpl_err_starts_on");
  const category = isEnum(TASK_CATEGORIES, input.category) ? input.category : "other";
  const peso_value = toInt(input.peso_value, 0);
  if (peso_value < 0 || peso_value > 5000) errors.push("tpl_err_peso_value");
  if (errors.length) return { ok: false, error: "validation", errors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_adhoc_task", {
    p_title_tl: title_tl || title_en,
    p_title_en: title_en || title_tl,
    p_due_date: due_date,
    p_category: category,
    p_evidence_required: Boolean(input.evidence_required),
    p_grace_after: 0,
    p_peso_value: peso_value,
  });
  if (error) return { ok: false, error: error.message };
  revalidateTemplateRoutes();
  return { ok: true };
}
