"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, HandCoins, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { PayoutStatus } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { reviewPayout, type PayoutDecision } from "./actions";

/**
 * Approve / mark paid / reject. "Approved" means agreed but the cash has not
 * changed hands yet, so it stays in the open list until it is marked paid.
 */
export function PayoutActions({ id, status }: { id: string; status: PayoutStatus }) {
  const { t } = useT();
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status === "paid" || status === "rejected") return null;

  function run(decision: PayoutDecision, noteArg?: string) {
    setError(null);
    startTransition(async () => {
      const res = await reviewPayout({ payoutId: id, decision, note: noteArg });
      if (!res.ok) {
        setError(res.error === "note_required" ? t("payout_note_required") : t("error_generic"));
        return;
      }
      setRejecting(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "requested" && (
          <Button type="button" variant="outline" disabled={pending} onClick={() => run("approved")}>
            <BadgeCheck className="size-4" /> {t("payouts_approve")}
          </Button>
        )}
        <Button type="button" variant="success" disabled={pending} onClick={() => run("paid")}>
          <HandCoins className="size-4" /> {t("payouts_mark_paid")}
        </Button>
        <Button
          type="button"
          variant={rejecting ? "secondary" : "outline"}
          disabled={pending}
          onClick={() => {
            setError(null);
            setRejecting(!rejecting);
          }}
        >
          <XCircle className="size-4" /> {t("payouts_reject")}
        </Button>
      </div>

      {rejecting && (
        <form
          className="space-y-2 rounded-xl bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) {
              setError(t("payout_note_required"));
              return;
            }
            run("rejected", note);
          }}
        >
          <Label htmlFor={`reject-${id}`}>{t("payouts_reject_note")}</Label>
          <Input
            id={`reject-${id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            disabled={pending}
            required
          />
          <div className="flex gap-2">
            <Button type="submit" size="md" variant="danger" loading={pending} disabled={!note.trim()}>
              {t("payouts_reject")}
            </Button>
            <Button type="button" variant="ghost" size="md" disabled={pending} onClick={() => setRejecting(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
