import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getT, pickLang } from "@/lib/i18n";
import { getTemplate } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "Edit task" };
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale } = await requireAdmin();
  const t = getT(locale);
  const template = await getTemplate(id);
  if (!template) notFound();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t("templates_edit")} subtitle={pickLang(template, "title", locale)} backHref="/admin/templates" />
      <TemplateForm initial={template} today={todayISO()} />
    </div>
  );
}
