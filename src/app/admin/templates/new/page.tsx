import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "New task" };
export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const { locale } = await requireAdmin();
  const t = getT(locale);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t("templates_new")} backHref="/admin/templates" />
      <TemplateForm today={todayISO()} />
    </div>
  );
}
