import type { StudioEvalRunSummary } from "@kortyx/agent/evals";
import type { CaseRow } from "../lib/presentation";

const colors: Record<string, string> = {
  passed: "bg-emerald-500",
  failed: "bg-red-500",
  error: "bg-red-700 dark:bg-red-400",
  running: "bg-blue-500",
  queued: "bg-muted-foreground/30",
  pending: "bg-muted-foreground/30",
  retrying: "bg-amber-500",
  reconnecting: "bg-amber-500",
  interrupted: "bg-amber-500",
  ungraded: "bg-amber-500",
  cancelled: "bg-muted-foreground/60",
};

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
  const statuses = [
    ...Object.keys(colors),
    ...Object.keys(counts)
      .filter((status) => !Object.hasOwn(colors, status))
      .sort(),
  ];
  const segments = statuses
    .map((status) => [status, counts[status] ?? 0] as const)
    .filter(([, count]) => count > 0);
  const total = segments.reduce((sum, [, count]) => sum + count, 0);
  const label = segments
    .map(([status, count]) => `${count} ${status}`)
    .join(" · ");
  return (
    <span
      role="img"
      aria-label={label || "No conversation results"}
      title={label || "No conversation results"}
      className="mt-2 flex h-1.5 w-full overflow-hidden bg-muted"
    >
      {segments.map(([status, count]) => (
        <span
          key={status}
          data-status={status}
          className={colors[status] ?? "bg-muted-foreground/30"}
          style={{ width: `${(count / total) * 100}%` }}
        />
      ))}
    </span>
  );
}
