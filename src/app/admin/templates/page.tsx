import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronRight, Clock, Plus, ListChecks } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getT, pickLang, type Locale, type Translator } from "@/lib/i18n";
import { getTemplates } from "@/lib/queries";
import { formatClock, formatDate, todayISO } from "@/lib/dates";
import type { TaskTemplate } from "@/lib/database.types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/cn";
import { AdhocForm } from "./adhoc-form";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function scheduleSummary(tpl: TaskTemplate, t: Translator, locale: Locale): string {
  // Ad-hoc (one-off) tasks are inactive daily templates pinned to one date.
  if (!tpl.active && tpl.recurrence === "daily" && tpl.ends_on && tpl.ends_on === tpl.starts_on) {
    return `${t("templates_adhoc")} · ${formatDate(tpl.starts_on, locale)}`;
  }
  switch (tpl.recurrence) {
    case "daily":
      return t("recurrence_daily");
    case "weekly": {
      const days = WEEKDAY_ORDER.filter((d) => tpl.weekdays.includes(d));
      return days.length === 7 ? t("recurrence_daily") : days.map((d) => t(`weekday_${d}`)).join(", ");
    }
    case "monthly": {
      const days = [...tpl.month_days].sort((a, b) => a - b).join(", ");
      return `${days} · ${t("tpl_every_months", { n: tpl.interval_months })}`;
    }
    default:
      return "";
  }
}

function graceSummary(tpl: TaskTemplate, t: Translator): string | null {
  if (!tpl.grace_before && !tpl.grace_after) return null;
  if (tpl.grace_before === tpl.grace_after) return t("tpl_grace_sym", { n: tpl.grace_after });
  return t("tpl_grace_asym", { b: tpl.grace_before, a: tpl.grace_after });
}

function TemplateRow({ tpl, t, locale }: { tpl: TaskTemplate; t: Translator; locale: Locale }) {
  const grace = graceSummary(tpl, t);
  return (
    <Link
      href={`/admin/templates/${tpl.id}`}
      className={cn(
        "flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors active:bg-surface-2",
        !tpl.active && "opacity-60"
      )}
    >
      <CategoryIcon category={tpl.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-snug">{pickLang(tpl, "title", locale)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{scheduleSummary(tpl, t, locale)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            {tpl.due_time ? (
              <>
                <Clock className="size-3.5" /> {formatClock(tpl.due_time)}
              </>
            ) : (
              t(`tod_${tpl.time_of_day}`)
            )}
          </span>
          {grace && (
            <>
              <span>·</span>
              <span className="tabular-nums">{grace}</span>
            </>
          )}
          {tpl.evidence_required && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Camera className="size-3.5" /> {tpl.min_photos}
              </span>
            </>
          )}
          <Badge tone={tpl.active ? "success" : "neutral"}>{tpl.active ? t("templates_active") : t("templates_inactive")}</Badge>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted/60" />
    </Link>
  );
}

function Section({
  title,
  items,
  dim,
  t,
  locale,
}: {
  title: string;
  items: TaskTemplate[];
  dim?: boolean;
  t: Translator;
  locale: Locale;
}) {
  if (!items.length) return null;
  return (
    <section className="mb-5">
      <h2 className={cn("mb-2 px-1 text-xs font-bold uppercase tracking-wide", dim ? "text-muted/70" : "text-muted")}>
        {title} · {items.length}
      </h2>
      <div className="space-y-2">
        {items.map((tpl) => (
          <TemplateRow key={tpl.id} tpl={tpl} t={t} locale={locale} />
        ))}
      </div>
    </section>
  );
}

export default async function TemplatesPage() {
  const { locale } = await requireAdmin();
  const t = getT(locale);
  const templates = await getTemplates(true);
  const today = todayISO();

  const active = templates.filter((x) => x.active);
  const inactive = templates.filter((x) => !x.active);
  const byRecurrence = (r: TaskTemplate["recurrence"]) => active.filter((x) => x.recurrence === r);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={t("templates_title")}
        right={
          <Link
            href="/admin/templates/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 active:bg-brand-800"
          >
            <Plus className="size-4" /> {t("templates_new")}
          </Link>
        }
      />

      <Card className="mb-5">
        <CardBody>
          <CardTitle className="mb-2">{t("templates_adhoc")}</CardTitle>
          <AdhocForm today={today} />
        </CardBody>
      </Card>

      {templates.length === 0 && <Empty icon={<ListChecks className="size-5" />} title={t("tpl_empty")} />}

      <Section title={t("recurrence_daily")} items={byRecurrence("daily")} t={t} locale={locale} />
      <Section title={t("recurrence_weekly")} items={byRecurrence("weekly")} t={t} locale={locale} />
      <Section title={t("recurrence_monthly")} items={byRecurrence("monthly")} t={t} locale={locale} />
      <Section title={t("templates_inactive")} items={inactive} dim t={t} locale={locale} />
    </div>
  );
}
