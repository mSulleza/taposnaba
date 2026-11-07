import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardCheck,
  AlertTriangle,
  MessageSquareWarning,
  CalendarCheck,
  HandCoins,
  Users,
  ListChecks,
} from "lucide-react";
import { sessionT } from "@/lib/auth";
import { ensureInstancesAroundToday, getDashboardCounts, getInstancesInRange, getOverdueInstances } from "@/lib/queries";
import { formatDate, todayISO } from "@/lib/dates";
import { peso } from "@/lib/money";
import { TaskCard } from "@/components/task-card";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import type { InstanceWithTemplate } from "@/lib/database.types";
import type { Locale, Translator } from "@/lib/i18n";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

function StatTile({
  href,
  label,
  value,
  icon,
  tone = "neutral",
  children,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: "neutral" | "brand" | "warn" | "danger" | "info";
  children?: React.ReactNode;
}) {
  const tones = {
    neutral: "text-ink",
    brand: "text-brand-700",
    warn: "text-amber-700",
    danger: "text-red-700",
    info: "text-sky-700",
  } as const;
  return (
    <Link href={href} className="block active:bg-surface-2">
      <Card className="flex h-full min-h-[96px] flex-col justify-between p-3.5 transition-colors hover:bg-surface-2/60">
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
          <span className="truncate">{label}</span>
          <span className={cn("shrink-0", tones[tone])}>{icon}</span>
        </div>
        <div className={cn("mt-1 text-2xl font-bold tabular-nums leading-none", tones[tone])}>{value}</div>
        {children}
      </Card>
    </Link>
  );
}

function Section({
  title,
  items,
  tone,
  today,
  locale,
  t,
}: {
  title: string;
  items: InstanceWithTemplate[];
  tone?: "warn" | "info";
  today: string;
  locale: Locale;
  t: Translator;
}) {
  if (!items.length) return null;
  return (
    <section className="mb-5">
      <h2
        className={cn(
          "mb-2 px-1 text-xs font-bold uppercase tracking-wide",
          tone === "warn" ? "text-red-700" : tone === "info" ? "text-sky-700" : "text-muted"
        )}
      >
        {title} · {items.length}
      </h2>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((i) => (
          <TaskCard key={i.id} item={i} today={today} locale={locale} t={t} href={`/tasks/${i.id}`} />
        ))}
      </div>
    </section>
  );
}

export default async function AdminDashboardPage() {
  const { locale, t } = await sessionT();
  await ensureInstancesAroundToday();
  const today = todayISO();
  const [counts, todayList, overdueList] = await Promise.all([
    getDashboardCounts(today),
    getInstancesInRange(today, today),
    getOverdueInstances(today),
  ]);

  // Skipped tasks are not work anyone still owes, so they leave the denominator
  // — otherwise the bar could never reach 100% once something is skipped.
  const expected = Math.max(0, counts.total - counts.skipped);
  const done = counts.approved + counts.submitted;
  const pct = expected ? Math.round((done / expected) * 100) : 100;

  const attention = todayList.filter((i) => i.status === "rejected" || i.status === "pending");
  const submitted = todayList.filter((i) => i.status === "submitted");
  const finished = todayList.filter((i) => i.status === "approved" || i.status === "skipped");
  // rejected first within "needs attention"
  attention.sort((a, b) => (a.status === b.status ? 0 : a.status === "rejected" ? -1 : 1));

  return (
    <div>
      <PageHeader title={t("nav_dashboard")} subtitle={formatDate(today, locale, { weekday: "long", month: "long" })} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          href={`/admin/calendar?date=${today}`}
          label={t("admin_today_progress")}
          value={`${done}/${expected}`}
          icon={<CalendarCheck className="size-4" />}
          tone="brand"
        >
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </StatTile>
        <StatTile
          href="/admin/review"
          label={t("admin_qa_queue")}
          value={counts.queue}
          icon={<ClipboardCheck className="size-4" />}
          tone={counts.queue ? "info" : "neutral"}
        />
        <StatTile
          href="#overdue"
          label={t("admin_overdue")}
          value={counts.overdue}
          icon={<AlertTriangle className="size-4" />}
          tone={counts.overdue ? "warn" : "neutral"}
        />
        <StatTile
          href="/admin/issues"
          label={t("admin_open_issues")}
          value={counts.openIssues}
          icon={<MessageSquareWarning className="size-4" />}
          tone={counts.openIssues ? "danger" : "neutral"}
        />
        <StatTile
          href="/admin/payouts"
          label={t("payouts_title")}
          value={counts.payouts ? peso(counts.payoutsOwed) : 0}
          icon={<HandCoins className="size-4" />}
          tone={counts.payouts ? "info" : "neutral"}
        />
      </div>

      <h2 className="mb-2 px-1 text-base font-bold">
        {t("today")} <span className="text-sm font-medium text-muted">· {t("adm_progress_hint", { done, total: expected })}</span>
      </h2>

      {todayList.length === 0 && <Empty title={t("today_empty")} />}

      <Section title={t("adm_needs_attention")} items={attention} tone="warn" today={today} locale={locale} t={t} />
      <Section title={t("admin_qa_queue")} items={submitted} tone="info" today={today} locale={locale} t={t} />
      <Section title={t("section_done")} items={finished} today={today} locale={locale} t={t} />

      <div id="overdue" className="scroll-mt-16">
        <Section title={t("admin_overdue")} items={overdueList} tone="warn" today={today} locale={locale} t={t} />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("adm_manage")}</h2>
        <Card className="divide-y divide-line overflow-hidden">
          <Link href="/admin/users" className="flex min-h-[52px] items-center gap-3 px-4 py-3 active:bg-surface-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Users className="size-4.5" />
            </span>
            <span className="flex-1 font-medium">{t("nav_users")}</span>
            <ChevronRight className="size-5 text-muted/60" />
          </Link>
          <Link href="/admin/templates" className="flex min-h-[52px] items-center gap-3 px-4 py-3 active:bg-surface-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <ListChecks className="size-4.5" />
            </span>
            <span className="flex-1 font-medium">{t("nav_templates")}</span>
            <ChevronRight className="size-5 text-muted/60" />
          </Link>
        </Card>
      </section>
    </div>
  );
}
