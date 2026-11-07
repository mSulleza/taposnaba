import type { Metadata } from "next";
import { LogOut, Smartphone } from "lucide-react";
import pkg from "../../../../package.json";
import { sessionT } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t, email, profile, locale } = await sessionT();

  return (
    <div>
      <PageHeader title={t("settings_title")} />

      <Card className="mb-4">
        <CardBody>
          <SettingsForm
            email={email}
            fullName={profile.full_name}
            locale={locale}
            role={profile.role}
          />
        </CardBody>
      </Card>

      <Alert tone="info" className="mb-4 flex items-start gap-2">
        <Smartphone className="mt-0.5 size-4 shrink-0" />
        <span>{t("settings_install_hint")}</span>
      </Alert>

      <form action={logout}>
        <Button type="submit" variant="outline" size="lg" block>
          <LogOut className="size-5" /> {t("logout")}
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-muted">
        {t("set_version", { app: t("appName"), v: pkg.version })}
      </p>
    </div>
  );
}
