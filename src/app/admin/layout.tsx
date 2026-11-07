import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { getDashboardCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Counts feed the nav badges, so the layout needs them before it renders —
  // but they do not depend on the admin check, so fetch both at once.
  const [{ locale }, counts] = await Promise.all([requireAdmin(), getDashboardCounts()]);
  const t = getT(locale);

  const nav = [
    { href: "/admin", label: t("nav_dashboard"), icon: "dashboard" as const, exact: true },
    { href: "/admin/review", label: t("nav_review"), icon: "review" as const, badge: counts.queue },
    { href: "/admin/templates", label: t("nav_templates"), icon: "templates" as const },
    { href: "/admin/calendar", label: t("nav_calendar"), icon: "calendar" as const },
    { href: "/admin/payouts", label: t("nav_payouts"), icon: "payouts" as const, badge: counts.payouts },
    { href: "/admin/issues", label: t("nav_issues"), icon: "issues" as const },
  ];

  return (
    <AppShell
      locale={locale}
      nav={nav}
      wide
      homeHref="/admin"
      title={t("admin_title")}
      right={
        <Link
          href="/today"
          className="inline-flex min-h-10 items-center gap-1 rounded-full bg-brand-100 px-3.5 text-xs font-semibold text-brand-800 active:bg-brand-200"
        >
          <CalendarCheck className="size-3.5" /> {t("nav_today")}
        </Link>
      }
    >
      {children}
    </AppShell>
  );
}
