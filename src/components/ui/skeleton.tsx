import { cn } from "@/lib/cn";

/** A single shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-black/[0.07]", className)} />;
}

/** Placeholder shaped like a TaskCard, so the swap to real content barely moves. */
export function TaskCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
      <Skeleton className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** A section heading plus `n` task cards. */
export function TaskListSkeleton({ n = 3 }: { n?: number }) {
  return (
    <section className="mb-5">
      <Skeleton className="mb-2 ml-1 h-3 w-24" />
      <div className="space-y-2">
        {Array.from({ length: n }, (_, i) => (
          <TaskCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
