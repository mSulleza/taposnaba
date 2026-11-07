"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { peso } from "@/lib/money";
import { Checkbox } from "@/components/ui/field";
import { setCompletionPaid } from "./actions";

/**
 * Flip an already-approved completion in or out of the payout. Sits in the QA
 * history, where an approval you regret two minutes later is still on screen.
 *
 * Optimistic: the tick moves immediately and rolls back if the server refuses,
 * because the row it lives in is one line tall and a spinner would jump it.
 */
export function PayToggle({
  completionId,
  paid,
  amount,
}: {
  completionId: string;
  paid: boolean;
  amount: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const [on, setOn] = useState(paid);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs">
      <Checkbox
        className="size-4"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          setFailed(false);
          startTransition(async () => {
            const res = await setCompletionPaid({ completionId, pay: next });
            if (!res.ok) {
              setOn(!next);
              setFailed(true);
              return;
            }
            router.refresh();
          });
        }}
      />
      <span className={on ? "font-medium" : "text-muted"}>{t("review_pay_toggle")}</span>
      <span className={"tabular-nums " + (on ? "font-semibold text-emerald-700" : "text-muted line-through")}>
        {peso(amount)}
      </span>
      {failed && <span className="text-red-700">{t("error_generic")}</span>}
    </label>
  );
}
