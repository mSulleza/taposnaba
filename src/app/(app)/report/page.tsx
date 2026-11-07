import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareWarning, Plus } from "lucide-react";
import { sessionT } from "@/lib/auth";
import { collectPaths, getIssues } from "@/lib/queries";
import { signPaths } from "@/lib/storage";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { PhotoGrid } from "@/components/photo-grid";
import type { IssueStatus } from "@/lib/database.types";

export const metadata: Metadata = { title: "Report" };
export const dynamic = "force-dynamic";

function issueTone(status: IssueStatus) {
  switch (status) {
    case "resolved":
      return "success" as const;
    case "acknowledged":
      return "info" as const;
    default:
      return "warning" as const;
  }
}

export default async function ReportPage() {
  const { locale, t, userId } = await sessionT();
  const issues = await getIssues({ mineOnly: userId });
  const urls = await signPaths(collectPaths(issues));

  return (
    <div>
      <PageHeader title={t("report_title")} />

      <p className="mb-4 text-[15px] leading-relaxed text-muted">{t("report_intro")}</p>

      <Link
        href="/report/new"
        className="mb-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800"
      >
        <Plus className="size-5" /> {t("report_new")}
      </Link>

      <section>
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
          {t("report_mine")}
          {issues.length > 0 && <> · {issues.length}</>}
        </h2>

        {issues.length === 0 ? (
          <Empty icon={<MessageSquareWarning className="size-5" />} title={t("report_none")} />
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <Card key={issue.id}>
                <CardBody>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="brand">{t(`report_cat_${issue.category}`)}</Badge>
                    <Badge tone={issueTone(issue.status)}>{t(`issue_status_${issue.status}`)}</Badge>
                  </div>
                  <CardTitle>{issue.title}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted">
                    {t("rep_reported_at", { when: formatDateTime(issue.created_at, locale) })}
                  </p>
                  {issue.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{issue.description}</p>
                  )}
                  <PhotoGrid photos={issue.photos} urls={urls} size="md" className="mt-3" />
                  {issue.resolution_note && (
                    <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="font-semibold">{t("rep_admin_note")}:</span> {issue.resolution_note}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
