"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, ExternalLink, ShieldCheck, SkipForward, Undo2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { InstanceStatus } from "@/lib/database.types";
import { peso } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Checkbox } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { bypassInstance, rescheduleInstance, skipInstance, unskipInstance } from "./actions";

/** Prev / next day links plus a native date input that navigates on change. */
export function CalendarNav({ date, prev, next, today }: { date: string; prev: string; next: string; today: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const linkCls =
    "flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink active:bg-surface-2";
  return (
    <div className="mb-4 flex items-center gap-2">
      <Link href={`/admin/calendar?date=${prev}`} className={linkCls} aria-label={t("cal_prev_day")}>
        <ChevronLeft className="size-5" />
      </Link>
      <Input
        key={date}
        type="date"
        defaultValue={date}
        aria-label={t("date")}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) startTransition(() => router.push(`/admin/calendar?date=${v}`));
        }}
        className="min-w-0 flex-1"
      />
      <Link href={`/admin/calendar?date=${next}`} className={linkCls} aria-label={t("cal_next_day")}>
        <ChevronRight className="size-5" />
      </Link>
      {date !== today && (
        <Link
          href={`/admin/calendar?date=${today}`}
          className="flex h-12 shrink-0 items-center rounded-xl bg-brand-100 px-3 text-sm font-semibold text-brand-800 active:bg-brand-200"
        >
          {t("today")}
        </Link>
      )}
    </div>
  );
}

type Mode = null | "skip" | "reschedule" | "bypass";

export function InstanceActions({
  id,
  status,
  dueDate,
  people,
  pesoValue,
}: {
  id: string;
  status: InstanceStatus;
  dueDate: string;
  /** Who a bypass can be recorded for. Helpers first — the usual answer. */
  people: { id: string; full_name: string; role: string }[];
  pesoValue: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState(dueDate);
  // A bypass records work SOMEONE did — normally the helper, who should be paid
  // for it. Getting this wrong silently moves wages into the admin's wallet.
  const defaultDoneBy = people.find((p) => p.role === "helper")?.id ?? people[0]?.id ?? "";
  const [doneBy, setDoneBy] = useState(defaultDoneBy);
  const [pay, setPay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSkip = status !== "approved" && status !== "skipped";
  const canReschedule = status !== "approved" && status !== "skipped";
  // Bypass = "this really was done, I just have no photo". Pointless once the
  // task is already approved, and a skipped task should be un-skipped first.
  const canBypass = status !== "approved" && status !== "skipped";

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error === "reason_required" ? t("bypass_reason_required") : t("error_generic"));
        return;
      }
      setMode(null);
      setReason("");
      if (after) after();
      else router.refresh();
    });
  }

  function toggle(next: Exclude<Mode, null>) {
    setError(null);
    setReason("");
    setMode(mode === next ? null : next);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "skipped" && (
          <Button type="button" variant="outline" loading={pending} onClick={() => run(() => unskipInstance({ id }))}>
            <Undo2 className="size-4" /> {t("calendar_unskip")}
          </Button>
        )}
        {canBypass && (
          <Button
            type="button"
            variant={mode === "bypass" ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => toggle("bypass")}
          >
            <ShieldCheck className="size-4" /> {t("calendar_bypass")}
          </Button>
        )}
        {canSkip && (
          <Button
            type="button"
            variant={mode === "skip" ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => toggle("skip")}
          >
            <SkipForward className="size-4" /> {t("calendar_skip")}
          </Button>
        )}
        {canReschedule && (
          <Button
            type="button"
            variant={mode === "reschedule" ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => toggle("reschedule")}
          >
            <CalendarClock className="size-4" /> {t("calendar_reschedule")}
          </Button>
        )}
        <Link
          href={`/tasks/${id}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand-800 hover:bg-black/5"
        >
          <ExternalLink className="size-4" /> {t("cal_open")}
        </Link>
      </div>

      {mode === "bypass" && (
        <form
          className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => bypassInstance({ id, reason, doneBy, pay }));
          }}
        >
          <Label htmlFor={`bypass-${id}`}>{t("calendar_bypass_reason")}</Label>
          <Input
            id={`bypass-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("cal_bypass_placeholder")}
            maxLength={500}
            required
            disabled={pending}
          />
          <p className="text-xs text-brand-800">{t("calendar_bypass_hint")}</p>

          <Label htmlFor={`doneby-${id}`}>{t("cal_bypass_done_by")}</Label>
          <Select
            id={`doneby-${id}`}
            value={doneBy}
            onChange={(e) => setDoneBy(e.target.value)}
            disabled={pending}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>

          {pesoValue > 0 && (
            <label className="flex items-center gap-2.5 rounded-lg bg-white/70 px-3 py-2 text-sm">
              <Checkbox checked={pay} disabled={pending} onChange={(e) => setPay(e.target.checked)} />
              <span className="flex-1">{t("review_include_in_payout")}</span>
              <span className={"font-semibold tabular-nums " + (pay ? "text-emerald-700" : "text-muted line-through")}>
                {peso(pesoValue)}
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="md" loading={pending} disabled={!reason.trim() || !doneBy}>
              {t("cal_confirm")}
            </Button>
            <Button type="button" variant="ghost" size="md" disabled={pending} onClick={() => setMode(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {mode === "skip" && (
        <form
          className="space-y-2 rounded-xl bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => skipInstance({ id, reason }));
          }}
        >
          <Label htmlFor={`skip-${id}`}>{t("calendar_skip_reason")}</Label>
          <Input
            id={`skip-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("cal_reason_placeholder")}
            maxLength={500}
            disabled={pending}
          />
          <div className="flex gap-2">
            <Button type="submit" size="md" loading={pending}>
              {t("cal_confirm")}
            </Button>
            <Button type="button" variant="ghost" size="md" disabled={pending} onClick={() => setMode(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {mode === "reschedule" && (
        <form
          className="space-y-2 rounded-xl bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const target = newDate;
            run(
              () => rescheduleInstance({ id, dueDate: target }),
              () => {
                router.refresh();
                if (target !== dueDate) router.push(`/admin/calendar?date=${target}`);
              }
            );
          }}
        >
          <Label htmlFor={`date-${id}`}>{t("cal_new_date")}</Label>
          <Input
            id={`date-${id}`}
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
            disabled={pending}
          />
          <p className="text-xs text-muted">{t("cal_moved_hint")}</p>
          <div className="flex gap-2">
            <Button type="submit" size="md" loading={pending} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(newDate)}>
              {t("cal_confirm")}
            </Button>
            <Button type="button" variant="ghost" size="md" disabled={pending} onClick={() => setMode(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
