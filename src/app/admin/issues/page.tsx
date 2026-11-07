import type { Metadata } from "next";
import { ChevronDown, Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getT, type Locale, type Translator } from "@/lib/i18n";
import { collectPaths, getIssues } from "@/lib/queries";
import { signPaths } from "@/lib/storage";
import { formatDateTime } from "@/lib/dates";
import type { IssueCategory, IssueStatus, IssueWithPhotos } from "@/lib/database.types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { PhotoGrid } from "@/components/photo-grid";
import { IssueActions } from "./issue-actions";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const categoryTone: Record<IssueCategory, "danger" | "warning" | "info" | "neutral"> = {
  health: "danger",
  equipment: "warning",
  supplies: "info",
  other: "neutral",
};

const statusTone: Record<IssueStatus, "danger" | "info" | "success"> = {
  open: "danger",
  acknowledged: "info",
  resolved: "success",
};

export default async function AdminIssuesPage() {
  const { locale } = await requireAdmin();
  const t = getT(locale);
  const issues = await getIssues();
  const urls = await signPaths(collectPaths(issues));

  const active = issues.filter((i) => i.status !== "resolved");
  const resolved = issues.filter((i) => i.status === "resolved");

  return (
    <div>
      <PageHeader title={t("issues_title")} subtitle={`${active.length} · ${t("iss_section_active")}`} backHref="/admin" />

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
          {t("iss_section_active")} · {active.length}
        </h2>
        {active.length === 0 ? (
          <Empty icon={<Inbox className="size-5" />} title={issues.length === 0 ? t("report_none") : t("iss_empty_active")} />
        ) : (
          <div className="space-y-3">
            {active.map((issue) => (
              <IssueCard key={issue.id} issue={issue} urls={urls} locale={locale} t={t} />
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <details className="group">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-1 text-xs font-bold uppercase tracking-wide text-muted [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            {t("iss_section_resolved")} · {resolved.length}
          </summary>
          <div className="mt-2 space-y-3">
            {resolved.map((issue) => (
              <IssueCard key={issue.id} issue={issue} urls={urls} locale={locale} t={t} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function IssueCard({
  issue,
  urls,
  locale,
  t,
}: {
  issue: IssueWithPhotos;
  urls: Map<string, string>;
  locale: Locale;
  t: Translator;
}) {
  return (
    <Card className={issue.status === "resolved" ? "opacity-80" : undefined}>
      <CardBody>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={categoryTone[issue.category]}>{t(`report_cat_${issue.category}`)}</Badge>
          <Badge tone={statusTone[issue.status]}>{t(`issue_status_${issue.status}`)}</Badge>
        </div>
        <h3 className="text-base font-semibold leading-snug">{issue.title}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {t("iss_reported_by", {
            name: issue.reporter?.full_name || "—",
            when: formatDateTime(issue.created_at, locale),
          })}
        </p>
        {issue.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{issue.description}</p>}
        {issue.photos.length > 0 && <PhotoGrid photos={issue.photos} urls={urls} size="md" className="mt-3" />}

        {(issue.acknowledged_at || issue.resolved_at) && (
          <div className="mt-3 space-y-1 text-xs text-muted">
            {issue.acknowledged_at && <p>{t("iss_seen_at", { when: formatDateTime(issue.acknowledged_at, locale) })}</p>}
            {issue.resolved_at && <p>{t("iss_resolved_at", { when: formatDateTime(issue.resolved_at, locale) })}</p>}
          </div>
        )}
        {issue.resolution_note && (
          <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="font-semibold">{t("issues_resolution")}:</span> {issue.resolution_note}
          </div>
        )}

        <IssueActions id={issue.id} status={issue.status} />
      </CardBody>
    </Card>
  );
}
