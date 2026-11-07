import type { Metadata } from "next";
import { sessionT } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "New report" };
export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const { t, userId } = await sessionT();
  return (
    <div>
      <PageHeader title={t("report_new")} subtitle={t("report_intro")} backHref="/report" />
      <Card>
        <CardBody>
          <ReportForm userId={userId} />
        </CardBody>
      </Card>
    </div>
  );
}
