"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, Undo2, User } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { pickLang } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/dates";
import { peso } from "@/lib/money";
import type { CompletionWithPhotos, InstanceWithTemplate } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Textarea, Label, Checkbox } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Empty } from "@/components/ui/empty";
import { PhotoGrid } from "@/components/photo-grid";
import { CategoryIcon } from "@/components/category-icon";
import { reviewCompletion, type ReviewDecision } from "./actions";

export type ReviewItem = CompletionWithPhotos & { instance: InstanceWithTemplate };

/**
 * The QA queue. Holds the "already handled" set so cards disappear
 * optimistically and the empty state shows once everything is reviewed.
 * `urls` is a plain object (storage_path -> signed URL) so it can cross the
 * server/client boundary; converted to a Map for PhotoGrid.
 */
export function ReviewQueue({ items, urls, today }: { items: ReviewItem[]; urls: Record<string, string>; today: string }) {
  const { t } = useT();
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const urlMap = useMemo(() => new Map(Object.entries(urls)), [urls]);
  const visible = items.filter((i) => !handled.has(i.id));

  if (visible.length === 0) {
    return <Empty icon={<CheckCircle2 className="size-5" />} title={t("admin_no_pending")} />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {visible.map((item) => (
        <ReviewCard
          key={item.id}
          item={item}
          urls={urlMap}
          today={today}
          onDone={(id) => setHandled((prev) => new Set(prev).add(id))}
        />
      ))}
    </div>
  );
}

export function ReviewCard({
  item,
  urls,
  today,
  onDone,
}: {
  item: ReviewItem;
  urls: Map<string, string>;
  today: string;
  onDone: (completionId: string) => void;
}) {
  const { t, locale } = useT();
  const [note, setNote] = useState("");
  // Approving usually pays. Unticking says "this is done, but not billable" —
  // the completion keeps what it was worth, it just stops counting as earnings.
  const [pay, setPay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [pending, startTransition] = useTransition();

  const tpl = item.instance.template;
  const title = pickLang(tpl, "title", locale);
  const canReject = note.trim().length > 0;
  const submitter = item.submitter?.full_name ?? "";
  const dueLabel = item.instance.due_date === today ? t("today") : formatDate(item.instance.due_date, locale);

  function decide(decision: ReviewDecision) {
    setError(null);
    if (decision === "rejected" && !canReject) {
      setError(t("review_note_required"));
      return;
    }
    setBusy(decision);
    startTransition(async () => {
      try {
        const res = await reviewCompletion({ completionId: item.id, decision, note, pay });
        if (!res.ok) {
          setError(res.error === "note_required" ? t("review_note_required") : t("error_generic"));
          setBusy(null);
          return;
        }
        onDone(item.id);
      } catch (err) {
        console.error(err);
        setError(t("error_generic"));
        setBusy(null);
      }
    });
  }

  const disabled = busy !== null || pending;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <CategoryIcon category={tpl.category} />
          <div className="min-w-0 flex-1">
            <Link href={`/tasks/${item.instance.id}`} className="-my-1 block py-1 text-base font-semibold leading-snug hover:underline">
              {title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span>{t("due_on", { date: dueLabel })}</span>
              {submitter && (
                <span className="inline-flex items-center gap-1">
                  <User className="size-3.5" /> {t("review_by", { name: submitter })}
                </span>
              )}
              <span>{t("review_submitted_at", { when: formatDateTime(item.submitted_at, locale) })}</span>
            </div>
          </div>
        </div>

        {item.note && (
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="font-semibold">{t("rev_helper_note")}:</span> <span className="whitespace-pre-wrap">{item.note}</span>
          </div>
        )}

        {item.photos.length ? (
          <PhotoGrid photos={item.photos} urls={urls} size="lg" />
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Camera className="size-4" /> {t("review_no_photos")}
          </p>
        )}

        <div>
          <Label htmlFor={`note-${item.id}`}>{t("review_note")}</Label>
          <Textarea
            id={`note-${item.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={disabled}
            maxLength={2000}
            className="min-h-[72px]"
          />
          <p className="mt-1 text-xs text-muted">{t("review_note_required")}</p>
        </div>

        {item.peso_value > 0 && (
          <label className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
            <Checkbox
              checked={pay}
              disabled={disabled}
              onChange={(e) => setPay(e.target.checked)}
            />
            <span className="flex-1">{t("review_include_in_payout")}</span>
            <span className={"font-semibold tabular-nums " + (pay ? "text-emerald-700" : "text-muted line-through")}>
              {peso(item.peso_value)}
            </span>
          </label>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="lg"
            variant="danger"
            disabled={disabled || !canReject}
            loading={busy === "rejected"}
            onClick={() => decide("rejected")}
          >
            <Undo2 className="size-5" /> {busy === "rejected" ? t("rev_sending") : t("review_reject")}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="success"
            disabled={disabled}
            loading={busy === "approved"}
            onClick={() => decide("approved")}
          >
            <CheckCircle2 className="size-5" /> {busy === "approved" ? t("rev_sending") : t("review_approve")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
