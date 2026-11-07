import type { Metadata } from "next";
import { CalendarDays, Camera, Clock } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getT, pickLang } from "@/lib/i18n";
import { ensureInstancesAroundToday, getInstancesInRange, getProfiles } from "@/lib/queries";
import { addDaysISO, formatClock, formatDate, isValidISODate, todayISO } from "@/lib/dates";
import type { InstanceStatus, InstanceWithTemplate } from "@/lib/database.types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { CategoryIcon } from "@/components/category-icon";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { CalendarNav, InstanceActions } from "./instance-actions";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const SUMMARY_ORDER: InstanceStatus[] = ["approved", "submitted", "pending", "rejected", "skipped"];

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await requireAdmin();
  const t = getT(locale);
  const sp = await searchParams;
  const today = todayISO();
  const date = isValidISODate(sp.date) ? sp.date : today;

  await ensureInstancesAroundToday();
  const [items, profiles] = await Promise.all([getInstancesInRange(date, date), getProfiles()]);
  // Helpers first: recording a bypass for the helper is the usual case, and
  // whoever is picked is who gets paid for it.
  const people = [...profiles]
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "helper" ? -1 : 1))
    .map((p) => ({ id: p.id, full_name: p.full_name, role: p.role }));

  const counts: Record<InstanceStatus, number> = { pending: 0, submitted: 0, approved: 0, rejected: 0, skipped: 0 };
  for (const i of items) counts[i.status] += 1;

  return (
    <div>
      <PageHeader
        title={t("calendar_title")}
        subtitle={`${formatDate(date, locale, { weekday: "long", month: "long", year: "numeric" })} · ${t("cal_tasks_count", { n: items.length })}`}
        backHref="/admin"
      />

      <CalendarNav date={date} prev={addDaysISO(date, -1)} next={addDaysISO(date, 1)} today={today} />

      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SUMMARY_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <Badge key={s} tone={statusTone(s)}>
              {t(`hist_sum_${s}`, { n: counts[s] })}
            </Badge>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Empty icon={<CalendarDays className="size-5" />} title={t("cal_empty")} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <InstanceRow key={item.id} item={item} today={today} locale={locale} t={t} people={people} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstanceRow({
  item,
  today,
  locale,
  t,
  people,
}: {
  item: InstanceWithTemplate;
  today: string;
  locale: "tl" | "en";
  t: ReturnType<typeof getT>;
  people: { id: string; full_name: string; role: string }[];
}) {
  const tpl = item.template;
  const title = pickLang(tpl, "title", locale);
  const overdue = item.window_end < today && (item.status === "pending" || item.status === "rejected");
  const hasWindow = item.window_start !== item.due_date || item.window_end !== item.due_date;

  return (
    <Card>
      <CardBody className="p-3.5">
        <div className="flex items-start gap-3">
          <CategoryIcon category={tpl.category} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug">{title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{t(`tod_${tpl.time_of_day}`)}</span>
              {tpl.due_time && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {formatClock(tpl.due_time)}
                </span>
              )}
              {tpl.evidence_required && (
                <span className="inline-flex items-center gap-1">
                  <Camera className="size-3.5" /> {tpl.min_photos}
                </span>
              )}
              {hasWindow && (
                <span>
                  {t("cal_window", {
                    from: formatDate(item.window_start, locale),
                    to: formatDate(item.window_end, locale),
                  })}
                </span>
              )}
              <StatusBadge status={item.status} t={t} overdue={overdue} />
            </div>
            {item.status === "skipped" && item.skip_reason && (
              <p className="mt-1.5 text-sm text-muted">
                {t("cal_skip_reason_label")}: {item.skip_reason}
              </p>
            )}
          </div>
        </div>
        <InstanceActions
          id={item.id}
          status={item.status}
          dueDate={item.due_date}
          people={people}
          pesoValue={tpl.peso_value}
        />
      </CardBody>
    </Card>
  );
}
