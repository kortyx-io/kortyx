import { CirclePause, Clock3 } from "lucide-react";
import { CostValue } from "@/components/cost-value";
import type { DataTableColumn } from "@/components/data-table";
import { DetailLink } from "@/components/detail/detail-link";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FeedbackBadge } from "@/features/feedback/components/feedback-badge";
import { effectiveInterruptStatus } from "@/features/interrupts/lib/interrupt-presentation";
import {
  WorkflowPathCell,
  workflowPathTitle,
} from "@/features/runs/components/workflow-path-cell";
import { statusMeta } from "@/features/runs/lib/constants";
import type { Run, RunStatus, SortKey } from "@/features/runs/schema";
import { CopyableCell } from "@/features/telemetry/components/copyable-cell";
import { TruncatedText } from "@/features/telemetry/components/line-clamp-2 whitespace-normal break-wordsd-text";
import {
  studioColumnFilters,
  studioValueColumn,
  withStudioSorting,
} from "@/features/telemetry/lib/column-filters";
import { costDisplay } from "@/lib/cost";
import {
  formatCount,
  formatDateTime,
  formatDurationSeconds,
} from "@/lib/format";
import { studioHelp, withStudioColumnHelp } from "@/lib/studio-help";
import { studioDetailHref } from "@/lib/studio-routes";
import { cn } from "@/lib/utils";

type CreateRunColumnsOptions = {
  /** Server-provided render clock, advanced by the client after hydration. */
  now: number;
  onToggleStatus: (status: RunStatus) => void;
  onCopy: (text: string) => void;
  workflowFilter?: string;
  versionFilter?: string;
};

const workflowRefsFor = (run: Run) =>
  run.workflowRefs?.length
    ? run.workflowRefs
    : [
        {
          workflowId: run.workflow,
          declaredVersion: run.version,
        },
      ];

const activeDurationSeconds = (run: Run, now: number) => {
  if (
    run.status !== "running" &&
    !(run.parentRunId && run.status === "interrupted")
  )
    return run.duration;
  const startedAt = Date.parse(run.startedAt);
  if (!Number.isFinite(startedAt)) return run.duration;
  return Math.max(0, (now - startedAt) / 1000);
};

export function createRunColumns({
  now,
  onToggleStatus,
  onCopy,
  workflowFilter = "",
  versionFilter = "",
}: CreateRunColumnsOptions): DataTableColumn<Run, SortKey>[] {
  const columns: DataTableColumn<Run, SortKey>[] = [
    {
      key: "parent",
      filter: studioColumnFilters("runs", "parent"),
      label: "Execution",
      defaultWidth: 170,
      render: (run) =>
        run.parentRunId ? (
          <div className="flex min-w-0 flex-col gap-1 text-xs">
            <span className="font-medium text-violet-600">
              ↳ Child · {run.callId}
            </span>
            <DetailLink
              className="line-clamp-2 whitespace-normal break-words text-muted-foreground hover:underline"
              href={studioDetailHref("runs", run.parentRunId, { tab: "calls" })}
              onClick={(event) => event.stopPropagation()}
            >
              Parent {run.parentRunId.slice(0, 8)}…
            </DetailLink>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Root execution</span>
        ),
    },
    {
      key: "status",
      filter: studioColumnFilters("runs", "status"),
      label: "Status",
      sortKey: "status",
      defaultWidth: 140,
      cellClassName: "px-4",
      render: (run) => {
        const interruptStatus = run.interruptStatus
          ? effectiveInterruptStatus(
              {
                status: run.interruptStatus,
                expiresAt: run.interruptExpiresAt,
              },
              now,
            )
          : null;
        const status =
          run.status === "interrupted" &&
          (interruptStatus === "pending" || Boolean(run.parentRunId))
            ? {
                label: "Waiting for input",
                icon: CirclePause,
                className: "text-amber-600",
              }
            : run.status === "interrupted" && interruptStatus === "expired"
              ? {
                  label: "Input expired",
                  icon: Clock3,
                  className: "text-muted-foreground",
                }
              : statusMeta[run.status];
        const StatusIcon = status.icon;
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleStatus(run.status);
            }}
            className={cn(
              "flex max-w-full min-w-0 items-center gap-2 text-xs font-medium hover:underline",
              status.className,
            )}
          >
            <StatusIcon
              className={cn(
                "size-4 shrink-0",
                run.status === "running" && "animate-spin",
              )}
            />
            <span className="line-clamp-2 whitespace-normal break-words">
              {status.label}
            </span>
          </button>
        );
      },
    },
    {
      key: "started",
      filter: studioColumnFilters("runs", "started"),
      label: "Started",
      sortKey: "started",
      defaultWidth: 108,
      cellClassName: "text-xs text-muted-foreground",
      cellTitle: (run) => run.startedAt,
      render: (run) => <TruncatedText>{run.started}</TruncatedText>,
    },
    {
      key: "feedback",
      filter: studioColumnFilters("runs", "feedback"),
      label: "Feedback",
      defaultWidth: 120,
      render: (run) =>
        run.parentRunId ? (
          <span
            className="text-xs text-muted-foreground"
            title="Feedback is collected on the root execution"
          >
            —
          </span>
        ) : (
          <DetailLink
            href={studioDetailHref("runs", run.id, { tab: "feedback" })}
            onClick={(event) => event.stopPropagation()}
            aria-label={`View feedback for run ${run.id}`}
          >
            <FeedbackBadge feedback={run.feedback} />
          </DetailLink>
        ),
    },
    {
      key: "workflow",
      filter: studioColumnFilters("runs", "workflow"),
      label: "Workflows",
      defaultWidth: 190,
      cellTitle: (run) =>
        workflowRefsFor(run)
          .map(
            (ref) =>
              `${ref.workflowId} ${ref.declaredVersion ?? "unversioned"}`,
          )
          .join(" → "),
      render: (run) => {
        const workflowRefs = workflowRefsFor(run);
        const normalizedWorkflowFilter = workflowFilter.trim().toLowerCase();
        const normalizedVersionFilter = versionFilter.trim().toLowerCase();
        const primary = workflowRefs.find((ref) => {
          const workflowMatches =
            !normalizedWorkflowFilter ||
            ref.workflowId.toLowerCase().includes(normalizedWorkflowFilter);
          const versionMatches =
            !normalizedVersionFilter ||
            (ref.declaredVersion ?? "unversioned")
              .toLowerCase()
              .includes(normalizedVersionFilter);
          return workflowMatches && versionMatches;
        }) ??
          workflowRefs[0] ?? {
            workflowId: run.workflow,
            declaredVersion: run.version,
          };
        const additionalWorkflowCount = Math.max(
          0,
          new Set(workflowRefs.map((ref) => ref.workflowId)).size - 1,
        );
        return (
          <div className="line-clamp-2 whitespace-normal break-words text-xs font-medium">
            {primary.workflowId}
            <span className="ml-1 text-muted-foreground">
              {primary.declaredVersion ?? "unversioned"}
            </span>
            {additionalWorkflowCount > 0 && (
              <span className="ml-1 text-muted-foreground">
                +{additionalWorkflowCount}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "path",
      filter: studioColumnFilters("runs", "path"),
      label: "Path",
      defaultWidth: 200,
      cellTitle: (run) => workflowPathTitle(run.path),
      render: (run) => <WorkflowPathCell path={run.path} />,
    },
    {
      key: "session",
      filter: studioColumnFilters("runs", "session"),
      label: "Session",
      defaultWidth: 155,
      cellTitle: (run) => run.session,
      render: (run) => (
        <CopyableCell
          value={run.session}
          onCopy={onCopy}
          ariaLabel="Copy session ID"
        />
      ),
    },
    studioValueColumn<Run, SortKey>("runs", "userId"),
    studioValueColumn<Run, SortKey>("runs", "tenantId"),
    {
      key: "model",
      filter: studioColumnFilters("runs", "model"),
      label: "Model",
      defaultWidth: 165,
      render: (run) => (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
          <InfoTooltip
            label={
              run.provider === "unknown"
                ? "Provider not captured"
                : `${run.provider} provider`
            }
            documentationUrl={studioHelp.tokens.documentationUrl}
            trigger={
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                aria-label={
                  run.provider === "unknown"
                    ? "Provider not captured"
                    : `${run.provider} provider`
                }
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  run.provider.toLowerCase() === "openai"
                    ? "bg-emerald-500/15 text-emerald-700"
                    : run.provider.toLowerCase() === "anthropic"
                      ? "bg-orange-500/15 text-orange-700"
                      : run.provider.toLowerCase() === "google"
                        ? "bg-blue-500/15 text-blue-700"
                        : "bg-muted text-muted-foreground",
                )}
              >
                {run.provider.toLowerCase() === "openai"
                  ? "O"
                  : run.provider.toLowerCase() === "anthropic"
                    ? "A"
                    : run.provider.toLowerCase() === "google"
                      ? "G"
                      : "?"}
              </button>
            }
          >
            {run.provider === "unknown"
              ? "Your app did not report which AI service handled this call. The request may still have run."
              : `Your app used ${run.provider} for AI model requests. Open the run to see the calls and their usage.`}
          </InfoTooltip>
          <span className="min-w-0 line-clamp-2 whitespace-normal break-words">
            {run.model}
          </span>
          {run.models && (
            <InfoTooltip
              label={`${run.models} additional models`}
              documentationUrl={studioHelp.metrics.documentationUrl}
              trigger={
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${run.models} additional models`}
                  className="shrink-0 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  +{run.models}
                </button>
              }
            >
              {run.models} additional models used in this run. Open the run to
              inspect each captured model call.
            </InfoTooltip>
          )}
        </div>
      ),
    },
    {
      key: "duration",
      filter: studioColumnFilters("runs", "duration"),
      label: "Duration",
      sortKey: "duration",
      defaultWidth: 108,
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (run) =>
        formatDurationSeconds(activeDurationSeconds(run, now), {
          style: "full",
        }),
      render: (run) => {
        const duration = activeDurationSeconds(run, now);
        return (
          <TruncatedText>
            {run.status === "running" && (
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-blue-500" />
            )}
            {formatDurationSeconds(duration)}
          </TruncatedText>
        );
      },
    },
    {
      key: "tokens",
      filter: studioColumnFilters("runs", "tokens"),
      label: "Tokens",
      sortKey: "tokens",
      defaultWidth: 98,
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (run) =>
        run.tokens !== undefined
          ? `Total ${formatCount(run.tokens, { compact: false })}`
          : undefined,
      render: (run) => <TruncatedText>{formatCount(run.tokens)}</TruncatedText>,
    },
    {
      key: "cost",
      filter: studioColumnFilters("runs", "cost"),
      label: "Cost",
      sortKey: "cost",
      defaultWidth: 100,
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (run) => costDisplay(run).note,
      render: (run) => <CostValue value={run} />,
    },
    {
      key: "result",
      filter: studioColumnFilters("runs", "result"),
      label: "Result",
      defaultWidth: 360,
      render: (run) => (
        <>
          <p
            className={cn(
              "max-w-full line-clamp-2 whitespace-normal break-words text-xs",
              run.status === "failed"
                ? "text-red-700 dark:text-red-400"
                : "text-muted-foreground",
            )}
          >
            {run.status === "interrupted" && (
              <CirclePause className="mr-1 inline size-3 text-amber-600" />
            )}
            {run.result}
          </p>
          <span className="sr-only">{run.id}</span>
        </>
      ),
    },
    studioValueColumn<Run, SortKey>("runs", "environment"),
    studioValueColumn<Run, SortKey>("runs", "id"),
    studioValueColumn<Run, SortKey>("runs", "endedAt", (v) =>
      formatDateTime(String(v)),
    ),
    studioValueColumn<Run, SortKey>("runs", "pricingStatus"),
  ];
  return withStudioColumnHelp(withStudioSorting(columns, "runs"), "runs");
}
