import { Skeleton, TaskCardSkeleton } from "@/components/ui/skeleton";

/** Admin pages placeholder (dashboard tiles / queue cards). */
export default function AdminLoading() {
  return (
    <div>
      <Skeleton className="mb-4 h-6 w-40" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <TaskCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
