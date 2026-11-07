import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import Link from "next/link";
import { sessionT } from "@/lib/auth";
import { ensureInstancesAroundToday, getEarningsOutlook, getTodayBuckets, getWallet } from "@/lib/queries";
import { formatDate } from "@/lib/dates";
import { peso } from "@/lib/money";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/ui/empty";
import type { InstanceWithTemplate } from "@/lib/database.types";
import type { Locale, Translator } from "@/lib/i18n";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

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
  tone?: "warn" | "danger";
  today: string;
  locale: Locale;
  t: Translator;
}) {
  if (!items.length) return null;
  return (
    <section className="mb-5">
      <h2
        className={
          "mb-2 px-1 text-xs font-bold uppercase tracking-wide " +
          (tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-muted")
        }
      >
        {title} · {items.length}
      </h2>
      <div className="space-y-2">
        {items.map((i) => (
          <TaskCard key={i.id} item={i} today={today} locale={locale} t={t} />
        ))}
      </div>
    </section>
  );
}

export default async function TodayPage() {
  // The session lookup and the instance materialization are independent, so
  // they overlap; only the buckets query genuinely has to wait for `ensure`.
  const [{ locale, t }] = await Promise.all([sessionT(), ensureInstancesAroundToday()]);
  const [b, wallet, outlook] = await Promise.all([
    getTodayBuckets(),
    getWallet(),
    getEarningsOutlook(),
  ]);

  const finished = (i: InstanceWithTemplate) => i.status === "approved" || i.status === "submitted" || i.status === "skipped";
  const total = b.dueToday.length;
  const done = b.dueToday.filter(finished).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const open = b.dueToday.filter((i) => !finished(i) && i.status !== "rejected");
  const byTod = (tod: "morning" | "anytime" | "evening") => open.filter((i) => i.template.time_of_day === tod);
  // Tasks submitted ahead of their due date still belong on the "done" list,
  // otherwise they vanish from Today entirely until QA gets to them.
  const doneToday = [...b.dueToday.filter(finished), ...b.submitted];
  // What is still on the table today — the nudge that makes the values matter.
  const stillEarnable = Math.max(0, outlook.today_potential - outlook.today_earned);

  return (
    <div>
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-md">
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">{formatDate(b.today, locale, { weekday: "long", month: "long" })}</p>
        <h1 className="mt-0.5 text-xl font-bold">{t("today_title")}</h1>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums">{t("today_progress", { done, total })}</span>
        </div>
        <Link
          href="/earnings"
          className="mt-3 block rounded-xl bg-white/15 px-3 py-2 active:bg-white/25"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-white/85">{t("earnings_balance")}</span>
            <span className="text-lg font-bold tabular-nums">{peso(wallet.balance)}</span>
          </span>
          {outlook.today_potential > 0 && (
            <span className="mt-1 flex items-center justify-between gap-3 border-t border-white/20 pt-1 text-xs text-white/80">
              <span>{t("earnings_today_potential")}</span>
              <span className="tabular-nums">
                {peso(outlook.today_earned)} {t("earnings_of", { total: peso(outlook.today_potential) })}
                {stillEarnable > 0 && ` · +${peso(stillEarnable)}`}
              </span>
            </span>
          )}
        </Link>
      </div>

      <Section title={t("section_redo")} items={b.redo} tone="danger" today={b.today} locale={locale} t={t} />
      <Section title={t("section_overdue")} items={b.overdue} tone="warn" today={b.today} locale={locale} t={t} />

      {total === 0 &&
        b.windowOpen.length === 0 &&
        b.overdue.length === 0 &&
        b.redo.length === 0 &&
        b.upcoming.length === 0 && <Empty title={t("today_empty")} />}

      {total > 0 && open.length === 0 && b.redo.length === 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <PartyPopper className="size-6 shrink-0" />
          <p className="font-semibold">{t("today_all_done")}</p>
        </div>
      )}

      <Section title={t("section_morning")} items={byTod("morning")} today={b.today} locale={locale} t={t} />
      <Section title={t("section_anytime")} items={byTod("anytime")} today={b.today} locale={locale} t={t} />
      <Section title={t("section_evening")} items={byTod("evening")} today={b.today} locale={locale} t={t} />
      <Section title={t("section_window")} items={b.windowOpen} today={b.today} locale={locale} t={t} />
      {/* Monthly work exists on one day a month. Showing the next occurrence
          keeps it from being invisible — and it can be done ahead of time. */}
      <Section title={t("section_upcoming")} items={b.upcoming} today={b.today} locale={locale} t={t} />
      <Section title={t("section_done")} items={doneToday} today={b.today} locale={locale} t={t} />
    </div>
  );
}
