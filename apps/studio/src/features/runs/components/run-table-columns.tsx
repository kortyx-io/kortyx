import { CirclePause, Clipboard } from "lucide-react";
import type { DataTableColumn } from "@/components/data-table";
import { statusMeta } from "@/features/runs/lib/constants";
import {
  formatCost,
  formatDuration,
  formatTokens,
} from "@/features/runs/lib/format";
import type { Run, RunStatus, SortKey } from "@/features/runs/types";
import { cn } from "@/lib/utils";

type CreateRunColumnsOptions = {
  /** Seconds elapsed since live mode started, used to tick running durations. */
  liveSeconds: number;
  onToggleStatus: (status: RunStatus) => void;
  onCopy: (text: string) => void;
};

export function createRunColumns({
  liveSeconds,
  onToggleStatus,
  onCopy,
}: CreateRunColumnsOptions): DataTableColumn<Run, SortKey>[] {
  return [
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      defaultWidth: 140,
      minWidth: 110,
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
              "flex items-center gap-2 text-xs font-medium hover:underline",
              status.className,
            )}
          >
            <StatusIcon
              className={cn(
                "size-4",
                run.status === "running" && "animate-spin",
              )}
            />
            {status.label}
          </button>
        );
      },
    },
    {
      key: "started",
      label: "Started",
      sortKey: "started",
      defaultWidth: 108,
      minWidth: 90,
      cellClassName: "text-xs text-muted-foreground",
      cellTitle: (run) => run.startedAt,
      render: (run) => run.started,
    },
    {
      key: "workflow",
      label: "Workflow",
      defaultWidth: 170,
      minWidth: 120,
      render: (run) => (
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="block max-w-full truncate text-left text-xs font-medium hover:underline"
        >
          {run.workflow}
          <span className="ml-1 text-muted-foreground">{run.version}</span>
        </button>
      ),
    },
    {
      key: "path",
      label: "Path",
      defaultWidth: 200,
      minWidth: 140,
      render: (run) => (
        <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
          {run.path.slice(0, 3).map((node, index) => (
            <span key={node} className="flex items-center gap-1">
              {index > 0 && <span className="text-border">→</span>}
              <span className="max-w-16 truncate">{node}</span>
            </span>
          ))}
          {run.path.length > 3 && <span>+{run.path.length - 3}</span>}
        </div>
      ),
    },
    {
      key: "session",
      label: "Session",
      defaultWidth: 155,
      minWidth: 120,
      render: (run) => (
        <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <span>{run.session.slice(0, 12)}…</span>
          <button
            type="button"
            aria-label="Copy session ID"
            onClick={(event) => {
              event.stopPropagation();
              onCopy(run.session);
            }}
            className="invisible rounded p-1 hover:bg-accent group-hover:visible"
          >
            <Clipboard className="size-3" />
          </button>
        </div>
      ),
    },
    {
      key: "model",
      label: "Model",
      defaultWidth: 165,
      minWidth: 120,
      render: (run) => (
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
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
          <span className="max-w-full truncate">{run.model}</span>
          {run.models && (
            <span className="text-muted-foreground">+{run.models}</span>
          )}
        </div>
      ),
    },
    {
      key: "duration",
      label: "Duration",
      sortKey: "duration",
      defaultWidth: 108,
      minWidth: 90,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (run) => {
        const duration =
          run.status === "running" ? run.duration + liveSeconds : run.duration;
        return (
          <>
            {run.status === "running" && (
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-blue-500" />
            )}
            {formatDuration(duration)}
          </>
        );
      },
    },
    {
      key: "tokens",
      label: "Tokens",
      sortKey: "tokens",
      defaultWidth: 98,
      minWidth: 80,
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (run) =>
        run.tokens
          ? `Input ${Math.round(run.tokens * 0.48).toLocaleString()} · Output ${Math.round(run.tokens * 0.36).toLocaleString()} · Reasoning ${Math.round(run.tokens * 0.11).toLocaleString()} · Cache read ${Math.round(run.tokens * 0.05).toLocaleString()}`
          : undefined,
      render: (run) => formatTokens(run.tokens),
    },
    {
      key: "cost",
      label: "Cost",
      sortKey: "cost",
      defaultWidth: 100,
      minWidth: 80,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (run) => formatCost(run.cost),
    },
    {
      key: "result",
      label: "Result",
      defaultWidth: 360,
      minWidth: 200,
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
