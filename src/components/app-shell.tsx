import Link from "next/link";
import { LocaleProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n";
import { BottomNav, type NavItem } from "@/components/bottom-nav";
import { cn } from "@/lib/cn";

/**
 * Mobile app frame: sticky top bar, scrollable content, fixed bottom nav.
 */
export function AppShell({
  locale,
  nav,
  title,
  right,
  children,
  wide,
  homeHref = "/",
}: {
  locale: Locale;
  nav: NavItem[];
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  /** Where the header logo goes — the role's own landing page. */
  homeHref?: string;
}) {
  return (
    <LocaleProvider locale={locale}>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur pt-safe">
          <div className={cn("mx-auto flex h-12 items-center justify-between px-4", wide ? "max-w-5xl" : "max-w-lg")}>
            <Link href={homeHref} className="-ml-1 flex h-12 items-center gap-2 rounded-lg px-1 font-bold tracking-tight active:bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-64.png" alt="" width={24} height={24} className="rounded-md" />
              <span>{title ?? "Tapos na ba?"}</span>
            </Link>
            {right}
          </div>
        </header>
        <main className={cn("mx-auto w-full flex-1 px-4 pb-28 pt-4", wide ? "max-w-5xl" : "max-w-lg")}>{children}</main>
        <BottomNav items={nav} />
      </div>
    </LocaleProvider>
  );
}
