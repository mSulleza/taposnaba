"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { IssueStatus } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { acknowledgeIssue, reopenIssue, resolveIssue } from "./actions";

export function IssueActions({ id, status }: { id: string; status: IssueStatus }) {
  const { t } = useT();
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(t("error_generic"));
        return;
      }
      setResolving(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "open" && (
          <Button type="button" variant="outline" loading={pending} onClick={() => run(() => acknowledgeIssue({ id }))}>
            <Eye className="size-4" /> {t("issues_acknowledge")}
          </Button>
        )}
        {status !== "resolved" && (
          <Button
            type="button"
            variant={resolving ? "secondary" : "success"}
            disabled={pending}
            onClick={() => setResolving((v) => !v)}
          >
            <Check className="size-4" /> {t("issues_resolve")}
          </Button>
        )}
        {status === "resolved" && (
          <Button type="button" variant="outline" loading={pending} onClick={() => run(() => reopenIssue({ id }))}>
            <RotateCcw className="size-4" /> {t("issues_reopen")}
          </Button>
        )}
      </div>

      {resolving && status !== "resolved" && (
        <form
          className="space-y-2 rounded-xl bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => resolveIssue({ id, note }));
          }}
        >
          <Label htmlFor={`res-${id}`}>{t("issues_resolution")}</Label>
          <Textarea
            id={`res-${id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("iss_resolution_placeholder")}
            maxLength={2000}
            disabled={pending}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="success" loading={pending}>
              {t("iss_confirm_resolve")}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setResolving(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
