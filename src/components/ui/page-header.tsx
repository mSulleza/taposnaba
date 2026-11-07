import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  subtitle,
  backHref,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-4 flex items-start gap-2", className)}>
      {backHref && (
        <Link
          href={backHref}
          className="-ml-2 mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-black/5"
          aria-label="Back"
        >
          <ChevronLeft className="size-6" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
