import { Skeleton, TaskListSkeleton } from "@/components/ui/skeleton";

/** Fallback loading state for helper pages without their own skeleton. */
export default function AppLoading() {
  return (
    <div>
      <Skeleton className="mb-1 h-6 w-44" />
      <Skeleton className="mb-5 h-3.5 w-32" />
      <TaskListSkeleton n={4} />
    </div>
  );
}
