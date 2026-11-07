import { ShieldCheck, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InstanceStatus } from "@/lib/database.types";
import type { Translator } from "@/lib/i18n";

export function statusTone(status: InstanceStatus | "overdue") {
  switch (status) {
    case "approved":
      return "success" as const;
    case "submitted":
      return "info" as const;
    case "rejected":
      return "danger" as const;
    case "overdue":
      return "warning" as const;
    case "skipped":
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
}

export function StatusBadge({ status, t, overdue }: { status: InstanceStatus; t: Translator; overdue?: boolean }) {
  const key = overdue && (status === "pending" || status === "rejected") ? "overdue" : status;
  const label = t(`status_${key}` as const);
  return <Badge tone={statusTone(key)}>{label}</Badge>;
}

/**
 * Marks a completion an admin recorded directly, with no photo evidence.
 * Deliberately loud and always shown next to the status: an approved task with
 * no evidence must never read like a helper's photographed submission.
 */
export function BypassBadge({ t, className }: { t: Translator; className?: string }) {
  return (
    <Badge tone="brand" className={className}>
      <ShieldCheck className="size-3" /> {t("admin_bypass_badge")}
    </Badge>
  );
}

/**
 * Marks an approval the admin chose not to pay for. Shown wherever an approved
 * completion is: "approved" alone would otherwise imply the money followed.
 */
export function UnpaidBadge({ t, className }: { t: Translator; className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      <CircleSlash className="size-3" /> {t("unpaid_badge")}
    </Badge>
  );
}
