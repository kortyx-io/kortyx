import { Skeleton } from "@/components/ui/skeleton";

const line = <Skeleton className="h-4 w-24 max-w-full" />;
export function EvalStatsSkeleton() {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg border bg-muted/20"
      aria-hidden="true"
    >
      <dl className="grid grid-cols-3 text-xs">
        {["Outcome", "Execution time", "Total cost"].map((label) => (
          <div
            key={label}
            className="flex min-w-0 flex-col gap-2 border-r px-3 py-3 last:border-r-0"
          >
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd>{line}</dd>
          </div>
        ))}
      </dl>
      <div className="flex justify-center border-t bg-muted/40 py-1.5">
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
export function EvalStepSelectorSkeleton() {
  return (
    <div className="flex h-8 w-full shrink-0 gap-2" aria-hidden="true">
      <Skeleton className="size-8 shrink-0" />
      <Skeleton className="h-8 flex-1" />
      <Skeleton className="size-8 shrink-0" />
    </div>
  );
}
export function EvalAssessmentSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-hidden="true">
      <div className="flex h-10 items-center rounded-md bg-muted/20 px-3">
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
export function EvalTranscriptSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-4 w-28" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg bg-muted/20 p-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-4/5" />
        </div>
      ))}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-36" />
      </div>
    </div>
  );
}
export function EvalCaseEvidenceSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading repetition evidence"
      className="data-table-body-scroll flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-4"
    >
      <EvalStatsSkeleton />
      <EvalStepSelectorSkeleton />
      <div className="flex shrink-0 flex-col gap-4 border-t border-foreground/15 pt-5">
        <EvalAssessmentSkeleton />
        <EvalTranscriptSkeleton />
      </div>
    </section>
  );
}

export function EvalComparisonEvidenceSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading comparison"
      className="flex min-w-0 flex-col gap-5 p-5"
    >
      <EvalStepSelectorSkeleton />
      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
        {[0, 1].map((i) => (
          <div key={i} className="contents">
            {i === 1 ? (
              <div className="hidden self-stretch border-l md:block" />
            ) : null}
            <section className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {i ? "This run" : "Earlier"}
                </h3>
                {line}
                <Skeleton className="h-8 w-full" />
                {line}
              </div>
              <EvalStatsSkeleton />
              <EvalAssessmentSkeleton />
              <EvalTranscriptSkeleton />
            </section>
          </div>
        ))}
      </div>
    </section>
  );
}
