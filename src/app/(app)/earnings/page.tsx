import type { Metadata } from "next";
import { Coins, Wallet } from "lucide-react";
import { sessionT } from "@/lib/auth";
import { getEarningsBreakdown, getEarningsOutlook, getMyPayouts, getWallet } from "@/lib/queries";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { daysUntilPayday, earningDaysLeft, monthRange, peso } from "@/lib/money";
import { pickLang } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { PayoutStatusBadge } from "@/components/payout-status-badge";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Earnings" };
export const dynamic = "force-dynamic";

/** One "earned of potential" line with a progress bar. */
function OutlookRow({
  label,
  earned,
  potential,
  of,
}: {
  label: string;
  earned: number;
  potential: number;
  of: string;
}) {
  const pct = potential > 0 ? Math.min(100, Math.round((earned / potential) * 100)) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums">
          <span className="font-bold text-emerald-700">{peso(earned)}</span>{" "}
          <span className="text-muted">{of}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function EarningsPage() {
  const { locale, t } = await sessionT();
  const today = todayISO();
  const { start, end } = monthRange(today);

  const [wallet, month, payouts, outlook] = await Promise.all([
    getWallet(),
    getEarningsBreakdown(start, today),
    getMyPayouts(),
    getEarningsOutlook(),
  ]);

  // 0 means today IS payday; otherwise show how many days are still available
  // to earn, today included.
  const isPayday = daysUntilPayday(today) === 0;
  const left = earningDaysLeft(today);

  return (
    <div>
      <PageHeader title={t("earnings_title")} />

      {/* The number the whole feature exists to show. */}
      <div className="mb-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-5 text-white shadow-md">
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">{t("earnings_balance")}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{peso(wallet.balance)}</p>
        <p className="mt-2 text-sm text-white/90">
          {isPayday ? t("earnings_payday_today") : t("earnings_payday_in", { n: left, date: formatDate(end, locale) })}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/25 pt-3 text-sm">
          <div>
            <p className="text-white/75">{t("earnings_earned_total")}</p>
            <p className="font-semibold tabular-nums">{peso(wallet.earned)}</p>
          </div>
          {wallet.committed > 0 && (
            <div>
              <p className="text-white/75">{t("earnings_pending_hold")}</p>
              <p className="font-semibold tabular-nums">{peso(wallet.committed)}</p>
            </div>
          )}
        </div>
      </div>

      {/* What is still on the table — the reason to go and do the next task. */}
      <Card className="mb-4">
        <CardBody className="p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t("earnings_outlook")}</h2>
            <p className="text-xs text-muted">{t("earnings_outlook_hint")}</p>
          </div>
          <OutlookRow
            label={t("earnings_outlook_today")}
            earned={outlook.today_earned}
            potential={outlook.today_potential}
            of={t("earnings_of", { total: peso(outlook.today_potential) })}
          />
          <OutlookRow
            label={t("earnings_outlook_month")}
            earned={outlook.month_earned}
            potential={outlook.month_potential}
            of={t("earnings_of", { total: peso(outlook.month_potential) })}
          />
        </CardBody>
      </Card>

      <div className="mb-6">
        <RequestForm balance={wallet.balance} />
      </div>

      {wallet.earned === 0 && payouts.length === 0 && (
        <Empty icon={<Coins className="size-5" />} title={t("earnings_none_yet")} />
      )}

      {month.rows.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
            {t("earnings_breakdown")} · {formatDate(start, locale, { month: "long", day: undefined, weekday: undefined })}
          </h2>
          <Card className="divide-y divide-line overflow-hidden">
            {month.rows.map((r) => (
              <div key={r.title_en} className="flex items-center gap-3 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-sm">{pickLang(r, "title", locale)}</p>
                <Badge tone="neutral">{t("earnings_times", { n: r.count })}</Badge>
                <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{peso(r.total)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("earnings_history")}</h2>
        {payouts.length === 0 ? (
          <p className="px-1 text-sm text-muted">{t("earnings_history_empty")}</p>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {payouts.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
                    <Wallet className="size-4 text-muted" /> {peso(p.amount)}
                  </span>
                  <PayoutStatusBadge status={p.status} t={t} />
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDateTime(p.requested_at, locale)}
                  {p.admin_recorded && ` · ${t("earnings_recorded_by_admin")}`}
                </p>
                {p.note && <p className="mt-1 whitespace-pre-wrap text-sm">{p.note}</p>}
                {p.review_note && (
                  <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">{p.review_note}</p>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
