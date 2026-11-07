import { AppShell } from "@/components/app-shell";
import { sessionT } from "@/lib/auth";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default async function HelperLayout({ children }: LayoutProps<"/">) {
  const { locale, t, isAdmin } = await sessionT();
  const nav = [
    { href: "/today", label: t("nav_today"), icon: "today" as const },
    { href: "/earnings", label: t("nav_earnings"), icon: "earnings" as const },
    { href: "/history", label: t("nav_history"), icon: "history" as const },
    { href: "/report", label: t("nav_report"), icon: "report" as const },
    { href: "/rules", label: t("nav_rules"), icon: "rules" as const },
    { href: "/settings", label: t("nav_settings"), icon: "settings" as const },
  ];
  return (
    <AppShell
      locale={locale}
      nav={nav}
      homeHref="/today"
      right={
        isAdmin ? (
          <Link href="/admin" className="inline-flex min-h-10 items-center gap-1 rounded-full bg-brand-100 px-3.5 text-xs font-semibold text-brand-800 active:bg-brand-200">
            <ShieldCheck className="size-3.5" /> {t("nav_admin")}
          </Link>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
