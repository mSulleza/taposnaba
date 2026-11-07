import { Skeleton } from "@/components/ui/skeleton";

/** Task detail placeholder: title, meta row, then the evidence card. */
export default function TaskLoading() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="size-11 shrink-0 rounded-xl" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mb-4 rounded-2xl border border-line bg-white p-4">
        <Skeleton className="mb-3 h-3 w-28" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="rounded-2xl border border-line bg-white p-4">
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}
