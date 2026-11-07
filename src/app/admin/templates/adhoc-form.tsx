"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { formatDate } from "@/lib/dates";
import type { TaskCategory } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { createAdhocTask } from "./actions";
import { TASK_CATEGORIES } from "./template-form";

export function AdhocForm({ today }: { today: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [titleTl, setTitleTl] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [category, setCategory] = useState<TaskCategory>("other");
  const [evidence, setEvidence] = useState(true);
  const [pesoValue, setPesoValue] = useState("0");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await createAdhocTask({
        title_tl: titleTl,
        title_en: titleEn,
        due_date: dueDate,
        category,
        evidence_required: evidence,
        peso_value: Number(pesoValue),
      });
      if (!res.ok) {
        setErrors(res.errors?.length ? res.errors.map((k) => t(k)) : [t("error_generic")]);
        return;
      }
      setSuccess(t("tpl_adhoc_created", { date: formatDate(dueDate, locale) }));
      setTitleTl("");
      setTitleEn("");
      setPesoValue("0");
      startTransition(() => router.refresh());
    } catch (err) {
      console.error(err);
      setErrors([t("error_generic")]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-muted">{t("tpl_adhoc_hint")}</p>
      <Field label={t("templates_field_title_tl")} htmlFor="adhoc_title_tl">
        <Input
          id="adhoc_title_tl"
          value={titleTl}
          onChange={(e) => setTitleTl(e.target.value)}
          required
          maxLength={200}
          disabled={busy}
        />
      </Field>
      <Field label={t("tpl_adhoc_title_en")} htmlFor="adhoc_title_en">
        <Input id="adhoc_title_en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} maxLength={200} disabled={busy} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("date")} htmlFor="adhoc_due_date">
          <Input id="adhoc_due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required disabled={busy} />
        </Field>
        <Field label={t("templates_field_category")} htmlFor="adhoc_category">
          <Select
            id="adhoc_category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            disabled={busy}
          >
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category_${c}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t("tpl_peso_value")} htmlFor="adhoc_peso" hint={t("tpl_peso_hint")}>
        <Input
          id="adhoc_peso"
          type="number"
          inputMode="numeric"
          min={0}
          max={5000}
          value={pesoValue}
          onChange={(e) => setPesoValue(e.target.value)}
          disabled={busy}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <Checkbox checked={evidence} onChange={(e) => setEvidence(e.target.checked)} disabled={busy} />
        {t("templates_field_evidence")}
      </label>

      {errors.length > 0 && (
        <Alert tone="danger">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      {success && (
        <Alert tone="success" className="flex items-center gap-2">
          <CheckCircle2 className="size-5 shrink-0" /> {success}
        </Alert>
      )}

      <Button type="submit" variant="secondary" block loading={busy} disabled={busy}>
        <Plus className="size-4" /> {t("tpl_adhoc_create")}
      </Button>
    </form>
  );
}
