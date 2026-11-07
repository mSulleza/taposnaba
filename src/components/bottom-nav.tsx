"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Coins,
  HandCoins,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquareWarning,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Icon registry. Nav items cross the server→client boundary, so they may only
 * carry serializable values — an icon *name*, never a component reference.
 * (Passing a lucide component from a Server Component throws
 * "Functions cannot be passed directly to Client Components".)
 */
const ICONS = {
  today: CalendarCheck,
  history: History,
  report: MessageSquareWarning,
  rules: BookOpen,
  settings: Settings,
  dashboard: LayoutDashboard,
  review: ClipboardCheck,
  templates: ListChecks,
  calendar: CalendarDays,
  issues: MessageSquareWarning,
  earnings: Coins,
  payouts: HandCoins,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof ICONS;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
  exact?: boolean;
};

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur pb-safe"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(({ href, label, icon, badge, exact }) => {
          const Icon = ICONS[icon];
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                  active ? "text-brand-700" : "text-muted"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full",
                    active && "bg-brand-100"
                  )}
                >
                  <Icon className="size-5" />
                  {!!badge && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="w-full truncate px-0.5 text-center">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
