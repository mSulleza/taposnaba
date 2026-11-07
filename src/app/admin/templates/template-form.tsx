"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import type { RecurrenceKind, TaskCategory, TaskTemplate, TimeOfDay } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { deleteTemplate, saveTemplate, type TemplateInput } from "./actions";

export const TASK_CATEGORIES: TaskCategory[] = [
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
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon..Sun for display

type FormState = {
  title_tl: string;
  title_en: string;
  description_tl: string;
  description_en: string;
  category: TaskCategory;
  recurrence: RecurrenceKind;
  weekdays: number[];
  month_days: string; // raw comma list, parsed on submit
  interval_months: string;
  anchor_month: string; // YYYY-MM
  time_of_day: TimeOfDay;
  due_time: string; // HH:MM or ""
  grace_before: string;
  grace_after: string;
  evidence_required: boolean;
  min_photos: string;
  sort_order: string;
  peso_value: string;
  starts_on: string;
  ends_on: string;
  active: boolean;
};

function fromTemplate(tpl: TaskTemplate | undefined, today: string): FormState {
  if (!tpl) {
    return {
      title_tl: "",
      title_en: "",
      description_tl: "",
      description_en: "",
      category: "other",
      recurrence: "daily",
      weekdays: [],
      month_days: "",
      interval_months: "1",
      anchor_month: today.slice(0, 7),
      time_of_day: "anytime",
      due_time: "",
      grace_before: "0",
      grace_after: "0",
      evidence_required: true,
      min_photos: "1",
      sort_order: "100",
      peso_value: "0",
      starts_on: today,
      ends_on: "",
      active: true,
    };
  }
  return {
    title_tl: tpl.title_tl,
    title_en: tpl.title_en,
    description_tl: tpl.description_tl ?? "",
    description_en: tpl.description_en ?? "",
    category: tpl.category,
    recurrence: tpl.recurrence,
    weekdays: tpl.weekdays ?? [],
    month_days: (tpl.month_days ?? []).join(","),
    interval_months: String(tpl.interval_months ?? 1),
    anchor_month: (tpl.anchor_month ?? today).slice(0, 7),
    time_of_day: tpl.time_of_day,
    due_time: tpl.due_time ? tpl.due_time.slice(0, 5) : "",
    grace_before: String(tpl.grace_before ?? 0),
    grace_after: String(tpl.grace_after ?? 0),
    evidence_required: tpl.evidence_required,
    min_photos: String(tpl.min_photos ?? 1),
    sort_order: String(tpl.sort_order ?? 100),
    peso_value: String(tpl.peso_value ?? 0),
    starts_on: tpl.starts_on,
    ends_on: tpl.ends_on ?? "",
    active: tpl.active,
  };
}

function parseMonthDays(raw: string): number[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
    )
  ).sort((a, b) => a - b);
}

export function TemplateForm({ initial, today }: { initial?: TaskTemplate; today: string }) {
  const { t } = useT();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => fromTemplate(initial, today));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();

  const isEdit = Boolean(initial);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function toggleWeekday(d: number) {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort((a, b) => a - b),
    }));
  }

  function describeErrors(res: { error: string; errors?: MessageKey[] }): string[] {
    if (res.errors?.length) return res.errors.map((k) => t(k));
    return [t("error_generic")];
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setBusy(true);
    try {
      const input: TemplateInput = {
        id: initial?.id,
        title_tl: form.title_tl,
        title_en: form.title_en,
        description_tl: form.description_tl,
        description_en: form.description_en,
        category: form.category,
        recurrence: form.recurrence,
        weekdays: form.weekdays,
        month_days: parseMonthDays(form.month_days),
        interval_months: Number(form.interval_months),
        anchor_month: form.anchor_month,
        time_of_day: form.time_of_day,
        due_time: form.due_time,
        grace_before: Number(form.grace_before),
        grace_after: Number(form.grace_after),
        evidence_required: form.evidence_required,
        min_photos: Number(form.min_photos),
        sort_order: Number(form.sort_order),
        peso_value: Number(form.peso_value),
        starts_on: form.starts_on,
        ends_on: form.ends_on,
        active: form.active,
      };
      const res = await saveTemplate(input);
      if (!res.ok) {
        setErrors(describeErrors(res));
        setBusy(false);
        return;
      }
      // Deliberately stay "busy" through the navigation, so a second tap
      // cannot create a duplicate template.
      startTransition(() => {
        router.push("/admin/templates");
        router.refresh();
      });
    } catch (err) {
      console.error(err);
      setErrors([t("error_generic")]);
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    setErrors([]);
    setDeleting(true);
    try {
      const res = await deleteTemplate(initial.id);
      if (!res.ok) {
        setErrors(describeErrors(res));
        setConfirmDelete(false);
        return;
      }
      startTransition(() => {
        router.push("/admin/templates");
        router.refresh();
      });
    } catch (err) {
      console.error(err);
      setErrors([t("error_generic")]);
    } finally {
      setDeleting(false);
    }
  }

  const disabled = busy || deleting;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Titles + instructions */}
      <Card>
        <CardBody className="space-y-4">
          <Field label={t("templates_field_title_tl")} htmlFor="title_tl">
            <Input
              id="title_tl"
              value={form.title_tl}
              onChange={(e) => set("title_tl", e.target.value)}
              required
              maxLength={200}
              disabled={disabled}
            />
          </Field>
          <Field label={t("templates_field_title_en")} htmlFor="title_en">
            <Input
              id="title_en"
              value={form.title_en}
              onChange={(e) => set("title_en", e.target.value)}
              required
              maxLength={200}
              disabled={disabled}
            />
          </Field>
          <Field label={t("templates_field_desc_tl")} htmlFor="description_tl">
            <Textarea
              id="description_tl"
              value={form.description_tl}
              onChange={(e) => set("description_tl", e.target.value)}
              maxLength={4000}
              disabled={disabled}
            />
          </Field>
          <Field label={t("templates_field_desc_en")} htmlFor="description_en">
            <Textarea
              id="description_en"
              value={form.description_en}
              onChange={(e) => set("description_en", e.target.value)}
              maxLength={4000}
              disabled={disabled}
            />
          </Field>
          <Field label={t("templates_field_category")} htmlFor="category">
            <Select
              id="category"
              value={form.category}
              onChange={(e) => set("category", e.target.value as TaskCategory)}
              disabled={disabled}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category_${c}`)}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {/* Schedule */}
      <Card>
        <CardBody className="space-y-4">
          <CardTitle>{t("templates_field_recurrence")}</CardTitle>
          <Field label={t("templates_field_recurrence")} htmlFor="recurrence" hint={isEdit ? t("tpl_schedule_hint") : undefined}>
            <Select
              id="recurrence"
              value={form.recurrence}
              onChange={(e) => set("recurrence", e.target.value as RecurrenceKind)}
              disabled={disabled}
            >
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {t(`recurrence_${r}`)}
                </option>
              ))}
            </Select>
          </Field>

          {form.recurrence === "weekly" && (
            <Field label={t("templates_field_weekdays")}>
              <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t("templates_field_weekdays")}>
                {WEEKDAYS.map((d) => {
                  const on = form.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      onClick={() => toggleWeekday(d)}
                      className={cn(
                        "flex h-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors",
                        on
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-line bg-white text-ink active:bg-surface-2"
                      )}
                    >
                      {t(`weekday_${d}`)}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {form.recurrence === "monthly" && (
            <>
              <Field label={t("templates_field_month_days")} htmlFor="month_days" hint={t("tpl_month_days_hint")}>
                <Input
                  id="month_days"
                  inputMode="numeric"
                  value={form.month_days}
                  onChange={(e) => set("month_days", e.target.value)}
                  placeholder="1,15"
                  disabled={disabled}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("templates_field_interval")} htmlFor="interval_months">
                  <Input
                    id="interval_months"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={24}
                    value={form.interval_months}
                    onChange={(e) => set("interval_months", e.target.value)}
                    disabled={disabled}
                  />
                </Field>
                <Field label={t("templates_field_anchor")} htmlFor="anchor_month">
                  <Input
                    id="anchor_month"
                    type="month"
                    value={form.anchor_month}
                    onChange={(e) => set("anchor_month", e.target.value)}
                    disabled={disabled}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("templates_field_time_of_day")} htmlFor="time_of_day">
              <Select
                id="time_of_day"
                value={form.time_of_day}
                onChange={(e) => set("time_of_day", e.target.value as TimeOfDay)}
                disabled={disabled}
              >
                {TIMES_OF_DAY.map((x) => (
                  <option key={x} value={x}>
                    {t(`tod_${x}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("templates_field_due_time")} htmlFor="due_time">
              <Input
                id="due_time"
                type="time"
                value={form.due_time}
                onChange={(e) => set("due_time", e.target.value)}
                disabled={disabled}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("templates_field_grace_before")} htmlFor="grace_before">
              <Input
                id="grace_before"
                type="number"
                inputMode="numeric"
                min={0}
                max={14}
                value={form.grace_before}
                onChange={(e) => set("grace_before", e.target.value)}
                disabled={disabled}
              />
            </Field>
            <Field label={t("templates_field_grace_after")} htmlFor="grace_after">
              <Input
                id="grace_after"
                type="number"
                inputMode="numeric"
                min={0}
                max={14}
                value={form.grace_after}
                onChange={(e) => set("grace_after", e.target.value)}
                disabled={disabled}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("templates_field_starts_on")} htmlFor="starts_on">
              <Input
                id="starts_on"
                type="date"
                value={form.starts_on}
                onChange={(e) => set("starts_on", e.target.value)}
                required
                disabled={disabled}
              />
            </Field>
            <Field label={t("templates_field_ends_on")} htmlFor="ends_on">
              <Input
                id="ends_on"
                type="date"
                value={form.ends_on}
                min={form.starts_on || undefined}
                onChange={(e) => set("ends_on", e.target.value)}
                disabled={disabled}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* Evidence + misc */}
      <Card>
        <CardBody className="space-y-4">
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={form.evidence_required}
              onChange={(e) => {
                const on = e.target.checked;
                setForm((f) => ({
                  ...f,
                  evidence_required: on,
                  min_photos: on ? (Number(f.min_photos) > 0 ? f.min_photos : "1") : "0",
                }));
              }}
              disabled={disabled}
            />
            <span>
              <span className="block text-sm font-medium">{t("templates_field_evidence")}</span>
              <span className="block text-xs text-muted">{t("tpl_evidence_hint")}</span>
            </span>
          </label>
          <Field label={t("tpl_peso_value")} htmlFor="peso_value" hint={t("tpl_peso_hint")}>
            <Input
              id="peso_value"
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              value={form.peso_value}
              onChange={(e) => set("peso_value", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("templates_field_min_photos")} htmlFor="min_photos">
              <Input
                id="min_photos"
                type="number"
                inputMode="numeric"
                min={0}
                max={6}
                value={form.min_photos}
                onChange={(e) => set("min_photos", e.target.value)}
                disabled={disabled || !form.evidence_required}
              />
            </Field>
            <Field label={t("templates_field_sort")} htmlFor="sort_order">
              <Input
                id="sort_order"
                type="number"
                inputMode="numeric"
                value={form.sort_order}
                onChange={(e) => set("sort_order", e.target.value)}
                disabled={disabled}
              />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox checked={form.active} onChange={(e) => set("active", e.target.checked)} disabled={disabled} />
            <span>
              <span className="block text-sm font-medium">{t("templates_active")}</span>
              <span className="block text-xs text-muted">{t("tpl_active_hint")}</span>
            </span>
          </label>
        </CardBody>
      </Card>

      {errors.length > 0 && (
        <Alert tone="danger">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Button type="submit" size="lg" block loading={busy} disabled={disabled}>
        {busy ? t("tpl_saving") : t("templates_save")}
      </Button>

      {isEdit && (
        <Card className="border-red-200">
          <CardBody className="space-y-3">
            <p className="text-xs text-muted">{t("tpl_delete_warning")}</p>
            {!confirmDelete ? (
              <Button
                type="button"
                variant="outline"
                block
                disabled={disabled}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4 text-red-700" /> {t("templates_delete")}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-red-800">{t("tpl_delete_confirm")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" disabled={disabled} onClick={() => setConfirmDelete(false)}>
                    {t("cancel")}
                  </Button>
                  <Button type="button" variant="danger" loading={deleting} disabled={disabled} onClick={onDelete}>
                    {deleting ? t("tpl_deleting") : t("tpl_delete_yes")}
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </form>
  );
}
