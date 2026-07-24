import { CirclePause } from "lucide-react";
import type { DataTableColumn } from "@/components/data-table";
import {
  WorkflowPathCell,
  workflowPathTitle,
} from "@/features/runs/components/workflow-path-cell";
import { statusMeta } from "@/features/runs/lib/constants";
import {
  formatCost,
  formatDuration,
  formatTokens,
} from "@/features/runs/lib/format";
import type { Run, RunStatus, SortKey } from "@/features/runs/schema";
import { CopyableCell } from "@/features/telemetry/components/copyable-cell";
import { TruncatedText } from "@/features/telemetry/components/truncated-text";
import { cn } from "@/lib/utils";

type CreateRunColumnsOptions = {
  /** Seconds elapsed since live mode started, used to tick running durations. */
  liveSeconds: number;
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

const activeDurationSeconds = (run: Run, liveSeconds: number) => {
  if (run.status !== "running" && run.status !== "interrupted") {
    return run.duration;
  }
  const startedAt = Date.parse(run.startedAt);
  if (!Number.isFinite(startedAt)) return run.duration + liveSeconds;
  return Math.max(0, (Date.now() - startedAt) / 1000);
};

export function createRunColumns({
  liveSeconds,
  onToggleStatus,
  onCopy,
  workflowFilter = "",
  versionFilter = "",
}: CreateRunColumnsOptions): DataTableColumn<Run, SortKey>[] {
  return [
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      defaultWidth: 140,
      cellClassName: "px-4",
      render: (run) => {
        const status = statusMeta[run.status];
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
            <span className="truncate">{status.label}</span>
          </button>
        );
      },
    },
    {
      key: "started",
      label: "Started",
      sortKey: "started",
      defaultWidth: 108,
      cellClassName: "text-xs text-muted-foreground",
      cellTitle: (run) => run.startedAt,
      render: (run) => <TruncatedText>{run.started}</TruncatedText>,
    },
    {
      key: "workflow",
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
          <div className="truncate text-xs font-medium">
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
      label: "Path",
      defaultWidth: 200,
      cellTitle: (run) => workflowPathTitle(run.path),
      render: (run) => <WorkflowPathCell path={run.path} />,
    },
    {
      key: "session",
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
    {
      key: "model",
      label: "Model",
      defaultWidth: 165,
      render: (run) => (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
              run.provider === "OpenAI"
                ? "bg-emerald-500/15 text-emerald-700"
                : run.provider === "Anthropic"
                  ? "bg-orange-500/15 text-orange-700"
                  : "bg-blue-500/15 text-blue-700",
            )}
          >
            {run.provider === "OpenAI"
              ? "O"
              : run.provider === "Anthropic"
                ? "A"
                : "G"}
          </span>
          <span className="min-w-0 truncate">{run.model}</span>
          {run.models && (
            <span className="shrink-0 text-muted-foreground">
              +{run.models}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "duration",
      label: "Duration",
      sortKey: "duration",
      defaultWidth: 108,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (run) => {
        const duration = activeDurationSeconds(run, liveSeconds);
        return (
          <TruncatedText>
            {(run.status === "running" || run.status === "interrupted") && (
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-blue-500" />
            )}
            {formatDuration(duration)}
          </TruncatedText>
        );
      },
    },
    {
      key: "tokens",
      label: "Tokens",
      sortKey: "tokens",
      defaultWidth: 98,
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (run) =>
        run.tokens
          ? `Input ${Math.round(run.tokens * 0.48).toLocaleString()} · Output ${Math.round(run.tokens * 0.36).toLocaleString()} · Reasoning ${Math.round(run.tokens * 0.11).toLocaleString()} · Cache read ${Math.round(run.tokens * 0.05).toLocaleString()}`
          : undefined,
      render: (run) => (
        <TruncatedText>{formatTokens(run.tokens)}</TruncatedText>
      ),
    },
    {
      key: "cost",
      label: "Cost",
      sortKey: "cost",
      defaultWidth: 100,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (run) => <TruncatedText>{formatCost(run.cost)}</TruncatedText>,
    },
    {
      key: "result",
      label: "Result",
      defaultWidth: 360,
      render: (run) => (
        <>
          <p
            className={cn(
              "max-w-full truncate text-xs",
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
  ];
}
