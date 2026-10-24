import type { StudioEvalRunSummary } from "@kortyx/agent/evals";
import type { CaseRow } from "../lib/presentation";

export const suiteStatusColors: Record<string, string> = {
  passed: "text-emerald-500",
  failed: "text-red-500",
  error: "text-red-700 dark:text-red-400",
  running: "text-blue-500",
  queued: "text-muted-foreground/30",
  pending: "text-muted-foreground/30",
  retrying: "text-amber-500",
  reconnecting: "text-amber-500",
  interrupted: "text-amber-500",
  ungraded: "text-amber-500",
  cancelled: "text-muted-foreground/60",
  "not-run": "text-muted-foreground/30",
};

export const suiteStatusLabels: Record<string, string> = {
  passed: "Passed",
  failed: "Failed",
  error: "Errors",
  running: "Running",
  queued: "Queued",
  pending: "Pending",
  retrying: "Retrying",
  reconnecting: "Reconnecting",
  interrupted: "Interrupted",
  ungraded: "Ungraded",
  cancelled: "Cancelled",
  "not-run": "Not run",
};

export function suiteStatusEntries(counts: Record<string, number>) {
  return [
    ...Object.keys(suiteStatusColors),
    ...Object.keys(counts)
      .filter((status) => !Object.hasOwn(suiteStatusColors, status))
      .sort(),
  ]
    .filter((status) => Object.hasOwn(counts, status))
    .map((status) => [status, counts[status] ?? 0] as const);
}

export function suiteStatusCounts(
  suite: Pick<StudioEvalRunSummary, "counts" | "totalAttempts" | "status">,
  rows?: CaseRow[],
) {
  if (rows?.length) {
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }
  const counts: Record<string, number> = { ...suite.counts };
  const recorded = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const remaining = Math.max(0, (suite.totalAttempts ?? recorded) - recorded);
  if (remaining)
    counts[
      suite.status === "queued"
        ? "queued"
        : suite.status === "running"
          ? "pending"
          : "not-run"
    ] = remaining;
  return counts;
}

export function EvalSuiteStatusBar({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const segments = suiteStatusEntries(counts).filter(([, count]) => count > 0);
  const total = segments.reduce((sum, [, count]) => sum + count, 0);
  const label = segments
    .map(([status, count]) => `${count} ${status}`)
    .join(" · ");
  let offset = 0;
  return (
    <svg
      role="img"
      aria-label={label || "No conversation results"}
      viewBox={`0 0 ${total || 1} 1`}
      preserveAspectRatio="none"
      className="mt-2 block size-full h-1 shrink-0 overflow-hidden rounded-full bg-muted"
    >
      {segments.map(([status, count], index) => {
        const x = offset;
        offset += count;
        return (
          <g key={status}>
            <rect
              data-status={status}
              x={x}
              y={0}
              width={count}
              height={1}
              fill="currentColor"
              className={
                suiteStatusColors[status] ?? "text-muted-foreground/30"
              }
            />
            {index > 0 && (
              <line
                x1={x}
                x2={x}
                y1={0}
                y2={1}
                stroke="var(--background)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
