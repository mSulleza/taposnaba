import Link from "next/link";
import { ChevronRight, Camera, Clock } from "lucide-react";
import type { InstanceWithTemplate } from "@/lib/database.types";
import { pickLang, type Locale, type Translator } from "@/lib/i18n";
import { peso } from "@/lib/money";
import { formatClock, formatDate, diffDays } from "@/lib/dates";
import { CategoryIcon } from "@/components/category-icon";
import { BypassBadge, StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/cn";

export function TaskCard({
  item,
  today,
  locale,
  t,
  href,
}: {
  item: InstanceWithTemplate;
  today: string;
  locale: Locale;
  t: Translator;
  href?: string;
}) {
  const tpl = item.template;
  const title = pickLang(tpl, "title", locale);
  const overdue = item.window_end < today && (item.status === "pending" || item.status === "rejected");
  const done = item.status === "approved" || item.status === "submitted";
  const late = overdue ? diffDays(item.window_end, today) : 0;
  const notToday = item.due_date !== today;

  return (
    <Link
      href={href ?? `/tasks/${item.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-white p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] active:bg-surface-2 transition-colors",
        item.status === "rejected" ? "border-red-200" : overdue ? "border-amber-200" : "border-line",
        done && "opacity-80"
      )}
    >
      <CategoryIcon category={tpl.category} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px] font-semibold leading-snug", item.status === "approved" && "line-through decoration-emerald-600/60")}>{title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {tpl.due_time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {formatClock(tpl.due_time)}
            </span>
          )}
          {tpl.evidence_required && (
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" /> {tpl.min_photos}
            </span>
          )}
          {notToday && !overdue && <span>{t("due_on", { date: formatDate(item.due_date, locale) })}</span>}
          {overdue && <span className="text-amber-700">{t("days_late", { n: late })}</span>}
          <StatusBadge status={item.status} t={t} overdue={overdue} />
          {item.latest?.admin_override && <BypassBadge t={t} />}
        </div>
      </div>
      {tpl.peso_value > 0 && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1 ring-inset",
            item.status === "approved"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-stone-100 text-stone-600 ring-stone-200"
          )}
        >
          {peso(tpl.peso_value)}
        </span>
      )}
      <ChevronRight className="size-5 shrink-0 text-muted/60" />
    </Link>
  );
}
