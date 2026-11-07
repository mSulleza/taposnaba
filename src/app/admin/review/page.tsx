import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { sessionT } from "@/lib/auth";
import { collectPaths, getRecentlyReviewed, getReviewQueue } from "@/lib/queries";
import { signPaths } from "@/lib/storage";
import { pickLang } from "@/lib/i18n";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BypassBadge, UnpaidBadge } from "@/components/status-badge";
import { ReviewQueue } from "./review-card";
import { PayToggle } from "./pay-toggle";

export const metadata: Metadata = { title: "QA" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { locale, t } = await sessionT();
  const today = todayISO();
  const [queue, recent] = await Promise.all([getReviewQueue(), getRecentlyReviewed(20)]);
  const signed = await signPaths(collectPaths(queue));
  const urls = Object.fromEntries(signed);

  return (
    <div>
      <PageHeader title={t("review_title")} subtitle={queue.length ? `${queue.length}` : undefined} />

      <ReviewQueue items={queue} urls={urls} today={today} />

      <details className="group mt-8">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl px-1 py-2 text-xs font-bold uppercase tracking-wide text-muted [&::-webkit-details-marker]:hidden">
          <span>
            {t("review_history_title")} · {recent.length}
          </span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        {recent.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted">{t("rev_history_empty")}</p>
        ) : (
          <Card className="mt-2 divide-y divide-line overflow-hidden">
            {recent.map((c) => {
              const title = pickLang(c.instance.template, "title", locale);
              const approved = c.review_status === "approved";
              // A bypass carries no price of its own; what it WOULD pay is the
              // template's value today.
              const worth = c.peso_value > 0 ? c.peso_value : c.instance.template.peso_value;
              const paid = !c.unpaid && c.peso_value > 0;
              return (
                // Not a single wrapping <Link>: the pay toggle would sit inside
                // the anchor and every tap on it would navigate away.
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/tasks/${c.instance.id}`}
                      className="-my-1 min-w-0 flex-1 truncate py-1 text-sm font-medium hover:underline"
                    >
                      {title}
                    </Link>
                    {c.admin_override && <BypassBadge t={t} />}
                    {approved && worth > 0 && !paid && <UnpaidBadge t={t} />}
                    <Badge tone={approved ? "success" : "danger"}>
                      {approved ? t("status_approved") : t("status_rejected")}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>{formatDate(c.instance.due_date, locale)}</span>
                    {c.reviewed_at && <span>· {formatDateTime(c.reviewed_at, locale)}</span>}
                    {c.reviewer?.full_name && <span>· {t("rev_reviewed_by", { name: c.reviewer.full_name })}</span>}
                    {/* Bypasses included: one is frozen at ₱0 and filed under
                        the admin, so it reads as unpaid until the tick prices
                        it from the template and credits the helper. */}
                    {approved && worth > 0 && (
                      <PayToggle completionId={c.id} paid={paid} amount={worth} />
                    )}
                  </div>
                  {c.review_note && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink/80">
                      <span className="font-semibold">{t("task_reviewer_note")}:</span> {c.review_note}
                    </p>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </details>
    </div>
  );
}
