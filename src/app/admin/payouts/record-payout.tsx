"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { peso } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { recordPayout } from "./actions";

/**
 * Cash handed over without the helper ever filing a request. Lands as `paid`,
 * so it comes straight off the balance. Defaults to the whole balance — paying
 * out everything owed is the usual case.
 */
export function RecordPayout({ helperId, balance }: { helperId: string; balance: number }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(balance));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const n = Math.floor(Number(amount));
  const valid = Number.isFinite(n) && n > 0 && n <= balance;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="md"
        block
        className="mt-3"
        disabled={balance <= 0}
        onClick={() => {
          setAmount(String(balance));
          setOpen(true);
        }}
      >
        <HandCoins className="size-4" /> {t("payouts_record")}
      </Button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) {
          setError(t("payout_amount_invalid"));
          return;
        }
        setError(null);
        startTransition(async () => {
          const res = await recordPayout({ helperId, amount: n, note });
          if (!res.ok) {
            setError(res.error === "invalid_amount" ? t("payout_amount_invalid") : t("payout_too_much"));
            return;
          }
          setOpen(false);
          setNote("");
          router.refresh();
        });
      }}
    >
      <p className="text-xs text-muted">{t("payouts_record_hint")}</p>
      <div>
        <Label htmlFor={`record-amount-${helperId}`}>{t("earnings_request_amount")}</Label>
        <Input
          id={`record-amount-${helperId}`}
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
        <Label htmlFor={`record-note-${helperId}`}>{t("payouts_record_note")}</Label>
        <Textarea
          id={`record-note-${helperId}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          disabled={pending}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="md" variant="success" loading={pending} disabled={!valid}>
          {t("payouts_record_confirm")}
        </Button>
        <Button type="button" size="md" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
