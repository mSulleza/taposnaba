import { Badge } from "@/components/ui/badge";
import type { PayoutStatus } from "@/lib/database.types";
import type { Translator } from "@/lib/i18n";

const TONES = {
  requested: "warning",
  approved: "info",
  paid: "success",
  rejected: "danger",
} as const;

export function PayoutStatusBadge({ status, t }: { status: PayoutStatus; t: Translator }) {
  return <Badge tone={TONES[status]}>{t(`payout_status_${status}` as const)}</Badge>;
}
