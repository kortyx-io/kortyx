import { Skeleton } from "@/components/ui/skeleton";

export function DetailSkeleton() {
  const rows = ["event-a", "event-b", "event-c", "event-d", "event-e"];
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-3/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-14 w-28" />
        <Skeleton className="h-14 w-28" />
        <Skeleton className="h-14 w-28" />
      </div>
      <Skeleton className="h-10 w-full" />
      {rows.map((row) => (
        <div key={row} className="flex gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeletonFrame({ floating }: { floating: boolean }) {
  return (
    <output
      aria-label="Loading details"
      className={
        floating
          ? "fixed top-12 right-4 bottom-4 z-50 flex w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          : "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
      }
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        {floating && <Skeleton className="size-8 rounded-md" />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-52 max-w-full" />
        </div>
        {floating && <Skeleton className="size-8 rounded-md" />}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DetailSkeleton />
      </div>
    </output>
  );
}

export function DetailDrawerSkeleton() {
  return <DetailSkeletonFrame floating />;
}

export function DetailPageSkeleton() {
  return <DetailSkeletonFrame floating={false} />;
}
