import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { getProfiles } from "@/lib/queries";
import { supabaseServiceKey } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { locale, userId } = await requireAdmin();
  const t = getT(locale);
  const profiles = await getProfiles();
  const serviceConfigured = Boolean(supabaseServiceKey());

  return (
    <div>
      <PageHeader title={t("users_title")} subtitle={`${profiles.length} · ${t("usr_list_title")}`} backHref="/admin" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
            {t("usr_list_title")} · {profiles.length}
          </h2>
          {profiles.length === 0 ? (
            <Empty icon={<Users className="size-5" />} title={t("none")} />
          ) : (
            <div className="space-y-3">
              {profiles.map((p) => (
                <UserRow key={p.id} profile={p} isSelf={p.id === userId} />
              ))}
            </div>
          )}
        </section>

        <Card>
          <CardBody>
            <CardTitle className="mb-3">{t("users_create")}</CardTitle>
            <CreateUserForm serviceConfigured={serviceConfigured} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
