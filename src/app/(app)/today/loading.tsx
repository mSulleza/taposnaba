import { Skeleton, TaskListSkeleton } from "@/components/ui/skeleton";

/**
 * Shown the instant a nav tap starts, while the page's data streams in.
 * Its existence is also what lets Next prefetch this (dynamic) route at all —
 * without a loading boundary, dynamic routes are skipped by the prefetcher.
 */
export default function TodayLoading() {
  return (
    <div>
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 shadow-md">
        <Skeleton className="h-3 w-32 bg-white/25" />
        <Skeleton className="mt-2 h-5 w-40 bg-white/30" />
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/25" />
          <Skeleton className="h-4 w-10 bg-white/30" />
        </div>
      </div>
      <TaskListSkeleton n={3} />
      <TaskListSkeleton n={2} />
    </div>
  );
}
