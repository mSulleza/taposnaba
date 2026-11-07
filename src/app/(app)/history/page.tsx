import type { Metadata } from "next";
import { History } from "lucide-react";
import { sessionT } from "@/lib/auth";
import { ensureInstancesAroundToday, getInstancesInRange } from "@/lib/queries";
import { addDaysISO, formatDate, todayISO } from "@/lib/dates";
import { TaskCard } from "@/components/task-card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import type { InstanceStatus, InstanceWithTemplate } from "@/lib/database.types";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

const RANGE_DAYS = 30;

const SUMMARY: { status: InstanceStatus; key: `hist_sum_${InstanceStatus}`; tone: "success" | "info" | "danger" | "neutral" | "warning" }[] = [
  { status: "approved", key: "hist_sum_approved", tone: "success" },
  { status: "submitted", key: "hist_sum_submitted", tone: "info" },
  { status: "rejected", key: "hist_sum_rejected", tone: "danger" },
  { status: "skipped", key: "hist_sum_skipped", tone: "neutral" },
  { status: "pending", key: "hist_sum_pending", tone: "warning" },
];

export default async function HistoryPage() {
  const [{ locale, t }] = await Promise.all([sessionT(), ensureInstancesAroundToday()]);
  const today = todayISO();
  const rows = await getInstancesInRange(addDaysISO(today, -RANGE_DAYS), today);

  // Group by due_date, newest day first (query already orders desc).
  const days = new Map<string, InstanceWithTemplate[]>();
  for (const r of rows) {
    const list = days.get(r.due_date);
    if (list) list.push(r);
    else days.set(r.due_date, [r]);
  }
  const dates = Array.from(days.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <PageHeader title={t("history_title")} subtitle={t("history_range", { n: RANGE_DAYS })} />

      {dates.length === 0 && <Empty icon={<History className="size-5" />} title={t("history_empty")} />}

      <div className="space-y-6">
        {dates.map((date) => {
          const items = days.get(date)!;
          const counts = items.reduce<Record<InstanceStatus, number>>(
            (acc, i) => {
              acc[i.status] += 1;
              return acc;
            },
            { pending: 0, submitted: 0, approved: 0, rejected: 0, skipped: 0 }
          );
          return (
            <section key={date}>
              <h2 className="sticky top-[calc(3rem+env(safe-area-inset-top,0px))] z-10 -mx-4 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface-2/95 px-4 py-2 backdrop-blur">
                <span className="text-sm font-bold">
                  {date === today ? t("today") : formatDate(date, locale)}
                </span>
                {date === today && <span className="text-xs text-muted">{formatDate(date, locale)}</span>}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {SUMMARY.filter((s) => counts[s.status] > 0).map((s) => (
                    <Badge key={s.status} tone={s.tone} className="px-1.5 text-[10px]">
                      {t(s.key, { n: counts[s.status] })}
                    </Badge>
                  ))}
                </span>
              </h2>
              <div className="space-y-2">
                {items.map((i) => (
                  <TaskCard key={i.id} item={i} today={today} locale={locale} t={t} href={`/tasks/${i.id}`} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
