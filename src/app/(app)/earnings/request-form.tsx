"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { peso } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { requestPayout } from "./actions";

/** Withdrawal request. Defaults to the whole balance — the usual case. */
export function RequestForm({ balance }: { balance: number }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(balance));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const n = Math.floor(Number(amount));
  const valid = Number.isFinite(n) && n > 0 && n <= balance;

  if (done) {
    return <Alert tone="success">{t("earnings_request_sent")}</Alert>;
  }

  if (!open) {
    return (
      <Button type="button" size="lg" block disabled={balance <= 0} onClick={() => setOpen(true)}>
        <HandCoins className="size-5" /> {t("earnings_request")}
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) {
          setError(t("payout_amount_invalid"));
          return;
        }
        setError(null);
        startTransition(async () => {
          const res = await requestPayout({ amount: n, note });
          if (!res.ok) {
            setError(res.error === "too_much" ? t("payout_too_much") : t("payout_amount_invalid"));
            return;
          }
          setDone(true);
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="payout-amount">{t("earnings_request_amount")}</Label>
        <Input
          id="payout-amount"
          type="number"
          inputMode="numeric"
          min={1}
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending}
          required
        />
        <p className="mt-1 text-xs text-muted">{t("earnings_request_max", { amount: peso(balance) })}</p>
      </div>
      <div>
        <Label htmlFor="payout-note">{t("earnings_request_note")}</Label>
        <Textarea
          id="payout-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          disabled={pending}
          className="min-h-[64px]"
        />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="lg" loading={pending} disabled={!valid}>
          {t("earnings_request")}
        </Button>
        <Button type="button" variant="ghost" size="lg" disabled={pending} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
