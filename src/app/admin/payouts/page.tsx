import type { Metadata } from "next";
import { Coins, User } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { getHelperWallets, getPayouts } from "@/lib/queries";
import { formatDateTime } from "@/lib/dates";
import { peso } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PayoutStatusBadge } from "@/components/payout-status-badge";
import { PayoutActions } from "./payout-actions";
import { RecordPayout } from "./record-payout";

export const metadata: Metadata = { title: "Withdrawals" };
export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage() {
  const { locale } = await requireAdmin();
  const t = getT(locale);
  const [payouts, wallets] = await Promise.all([getPayouts(), getHelperWallets()]);
  // Admins can submit tasks too, but this table is about what is owed to
  // helpers — an admin's own accrual is not a wage.
  const helperWallets = wallets.filter((w) => w.role === "helper");

  // Requested and approved both still owe the helper money, so they stay
  // together at the top until the cash actually changes hands.
  const open = payouts.filter((p) => p.status === "requested" || p.status === "approved");
  const settled = payouts.filter((p) => p.status === "paid" || p.status === "rejected");
  const owed = open.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <PageHeader
        title={t("payouts_title")}
        subtitle={open.length ? `${open.length} · ${peso(owed)}` : undefined}
        backHref="/admin"
      />

      {/* What each helper has accrued, independent of any request. */}
      <section className="mb-6">
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("wallets_title")}</h2>
        {helperWallets.length === 0 ? (
          <p className="px-1 text-sm text-muted">{t("wallets_empty")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {helperWallets.map((w) => (
              <Card key={w.helper_id}>
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{w.full_name}</p>
                      <p className="mt-0.5 text-xs text-muted">{t("wallets_available")}</p>
                      <p className="text-2xl font-bold tabular-nums text-emerald-700">{peso(w.balance)}</p>
                    </div>
                    <Coins className="size-5 shrink-0 text-muted" />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2 text-xs">
                    <div>
                      <dt className="text-muted">{t("wallets_this_month")}</dt>
                      <dd className="font-semibold tabular-nums">{peso(w.this_month)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("wallets_all_time")}</dt>
                      <dd className="font-semibold tabular-nums">{peso(w.earned)}</dd>
                    </div>
                  </dl>
                  {w.open_requests > 0 && (
                    <p className="mt-2 text-xs text-sky-700">
                      {t("wallets_open_requests", { n: w.open_requests })} · {peso(w.committed)}
                    </p>
                  )}
                  {/* Cash is often handed over before anyone opens the app. */}
                  <RecordPayout helperId={w.helper_id} balance={w.balance} />
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      {payouts.length === 0 && (
        <p className="px-1 text-sm text-muted">{t("payouts_empty")}</p>
      )}

      {open.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
            {t("payouts_open")} · {open.length}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {open.map((p) => (
              <Card key={p.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-2xl font-bold tabular-nums">{peso(p.amount)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
                        <User className="size-3.5" />
                        {t("payouts_requested_by", { name: p.helper?.full_name ?? "" })}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(p.requested_at, locale)}</p>
                    </div>
                    <PayoutStatusBadge status={p.status} t={t} />
                  </div>
                  {p.note && <p className="mt-2 whitespace-pre-wrap text-sm">{p.note}</p>}
                  <PayoutActions id={p.id} status={p.status} />
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      {settled.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted">
            {t("payouts_settled")} · {settled.length}
          </h2>
          <Card className="divide-y divide-line overflow-hidden">
            {settled.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold tabular-nums">{peso(p.amount)}</span>
                  <PayoutStatusBadge status={p.status} t={t} />
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {/* Nobody asked for an admin-recorded payout — saying "from
                      the helper" would misattribute it. */}
                  {t(p.admin_recorded ? "payouts_recorded_by" : "payouts_requested_by", {
                    name: p.helper?.full_name ?? "",
                  })}{" "}
                  · {formatDateTime(p.paid_at ?? p.reviewed_at ?? p.requested_at, locale)}
                </p>
                {p.review_note && <p className="mt-1 text-sm text-ink/80">{p.review_note}</p>}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
