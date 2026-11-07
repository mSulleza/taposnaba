import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Camera, Clock } from "lucide-react";
import { sessionT } from "@/lib/auth";
import { getInstanceDetail, UPCOMING_DAYS } from "@/lib/queries";
import { signPaths } from "@/lib/storage";
import { pickLang } from "@/lib/i18n";
import { addDaysISO, formatClock, formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { peso } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/category-icon";
import { BypassBadge, StatusBadge, UnpaidBadge } from "@/components/status-badge";
import { PhotoGrid } from "@/components/photo-grid";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const { locale, t, userId } = await sessionT();
  const detail = await getInstanceDetail(id);
  if (!detail) notFound();
  const { instance, completions } = detail;
  const tpl = instance.template;
  const today = todayISO();

  const urls = await signPaths(completions.flatMap((c) => c.photos.map((p) => p.storage_path)));
  const title = pickLang(tpl, "title", locale);
  const description = pickLang(tpl, "description", locale);
  const overdue = instance.window_end < today && (instance.status === "pending" || instance.status === "rejected");
  // The window has not opened yet. A monthly task may still be submitted up to
  // UPCOMING_DAYS early (public.early_submit_days() enforces the same rule in
  // the DB); anything else has to wait, so don't offer a form that will fail.
  const notOpenYet = instance.window_start > today;
  const earlyOk = notOpenYet && tpl.recurrence === "monthly" && instance.window_start <= addDaysISO(today, UPCOMING_DAYS);
  const locked = instance.status === "approved" || instance.status === "skipped";
  const tooEarly = notOpenYet && !earlyOk;
  const latest = completions[0];
  // An approved task with no photos must say why: an admin recorded it.
  const bypassed = Boolean(latest?.admin_override);
  const need = tpl.evidence_required ? Math.max(1, tpl.min_photos) : 0;

  return (
    <div>
      <PageHeader title={title} backHref="/today" />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <CategoryIcon category={tpl.category} className="size-8 rounded-lg [&>svg]:size-4" />
        <span>{t(`category_${tpl.category}`)}</span>
        <span>·</span>
        <span>{instance.due_date === today ? t("today") : formatDate(instance.due_date, locale)}</span>
        {tpl.due_time && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {formatClock(tpl.due_time)}
          </span>
        )}
        {(instance.window_end !== instance.due_date || instance.window_start !== instance.due_date) && (
          <span>· {t("window_until", { date: formatDate(instance.window_end, locale) })}</span>
        )}
        <StatusBadge status={instance.status} t={t} overdue={overdue} />
        {bypassed && <BypassBadge t={t} />}
        {tpl.peso_value > 0 && (
          <Badge tone={instance.status === "approved" && !bypassed && !latest?.unpaid ? "success" : "neutral"}>
            {peso(tpl.peso_value)} ·{" "}
            {instance.status === "approved"
              ? bypassed
                ? t("earnings_bypass_unpaid")
                : latest?.unpaid
                  ? t("earnings_not_paid")
                  : t("earnings_earned")
              : t("earnings_earn_on_approve")}
          </Badge>
        )}
      </div>

      {instance.status === "rejected" && latest?.review_note && (
        <Alert tone="danger" className="mb-3">
          <p className="font-semibold">{t("task_rejected_banner")}</p>
          <p className="mt-1 whitespace-pre-wrap">“{latest.review_note}”</p>
        </Alert>
      )}
      {instance.status === "approved" &&
        (bypassed ? (
          <Alert tone="info" className="mb-3">
            <p className="font-semibold">{t("task_bypass_banner")}</p>
            {latest?.note && <p className="mt-1 whitespace-pre-wrap">“{latest.note}”</p>}
          </Alert>
        ) : (
          <Alert tone="success" className="mb-3">{t("task_approved_banner")}</Alert>
        ))}
      {instance.status === "submitted" && <Alert tone="info" className="mb-3">{t("task_submitted_banner")}</Alert>}
      {instance.status === "skipped" && (
        <Alert tone="warning" className="mb-3">
          {t("task_skipped_banner")} {instance.skip_reason && <span>— {instance.skip_reason}</span>}
        </Alert>
      )}
      {overdue && <Alert tone="warning" className="mb-3">{t("task_late_notice")}</Alert>}
      {earlyOk && (
        <Alert tone="info" className="mb-3">
          {t("task_early_notice", { date: formatDate(instance.due_date, locale) })}
        </Alert>
      )}

      {description && (
        <Card className="mb-4">
          <CardBody>
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t("task_instructions")}</h2>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{description}</p>
          </CardBody>
        </Card>
      )}

      {!locked && tooEarly && (
        <Alert tone="info" className="mb-4">
          {t("task_not_open_yet", { date: formatDate(instance.window_start, locale) })}
        </Alert>
      )}

      {!locked && !tooEarly && (
        <Card className="mb-4">
          <CardBody>
            <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
              <Camera className="size-3.5" /> {t("task_evidence")}
            </h2>
            <p className="mb-3 text-sm text-muted">
              {need > 0 ? t("task_evidence_required", { n: need }) : t("task_evidence_optional")}
            </p>
            <SubmitForm
              instanceId={instance.id}
              userId={userId}
              minPhotos={need}
              resubmit={instance.status === "rejected" || instance.status === "submitted"}
            />
          </CardBody>
        </Card>
      )}
      {locked && <p className="mb-4 text-sm text-muted">{t("task_locked")}</p>}

      {completions.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("task_previous_submissions")}</h2>
          <div className="space-y-3">
            {completions.map((c) => (
              <Card key={c.id}>
                <CardBody>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted">{formatDateTime(c.submitted_at, locale)}</span>
                    {c.admin_override && <BypassBadge t={t} />}
                    {c.review_status === "approved" && c.unpaid && <UnpaidBadge t={t} />}
                    <Badge tone={c.review_status === "approved" ? "success" : c.review_status === "rejected" ? "danger" : "info"}>
                      {c.review_status === "pending"
                        ? t("status_submitted")
                        : c.review_status === "approved"
                          ? t("status_approved")
                          : t("status_rejected")}
                    </Badge>
                  </div>
                  {c.note && <p className="mb-2 whitespace-pre-wrap text-sm">{c.note}</p>}
                  {c.admin_override && c.photos.length === 0 ? (
                    <p className="text-sm text-muted">{t("bypass_no_evidence")}</p>
                  ) : (
                    <PhotoGrid photos={c.photos} urls={urls} size="md" />
                  )}
                  {c.review_note && (
                    <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="font-semibold">{t("task_reviewer_note")}:</span> {c.review_note}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
