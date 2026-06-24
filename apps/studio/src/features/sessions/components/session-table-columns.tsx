import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  CircleX,
  Clipboard,
  GitFork,
  LoaderCircle,
} from "lucide-react";
import type { DataTableColumn } from "@/components/data-table";
import type {
  Session,
  SessionSortKey,
  SessionStatus,
} from "@/features/sessions/schema";
import {
  CompactStatus,
  type CompactStatusMeta,
} from "@/features/telemetry/components/compact-status";
import {
  formatElapsed,
  formatOptionalCost,
  formatOptionalNumber,
  formatRelativeTime,
} from "@/features/telemetry/lib/format";
import { cn } from "@/lib/utils";

const statusMeta: Record<SessionStatus, CompactStatusMeta> = {
  running: {
    label: "Running",
    icon: LoaderCircle,
    className: "text-blue-600",
    animate: true,
  },
  completed: {
    label: "Completed",
    icon: CircleCheck,
    className: "text-emerald-600",
  },
  interrupted: {
    label: "Interrupted",
    icon: CirclePause,
    className: "text-amber-600",
  },
  failed: { label: "Failed", icon: CircleAlert, className: "text-red-600" },
  cancelled: {
    label: "Cancelled",
    icon: CircleX,
    className: "text-muted-foreground",
  },
};

export function createSessionColumns({
  now,
  onCopy,
}: {
  now: number;
  onCopy: (value: string) => void;
}): DataTableColumn<Session, SessionSortKey>[] {
  return [
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      defaultWidth: 132,
      minWidth: 110,
      cellClassName: "px-4",
      render: (session) => <CompactStatus meta={statusMeta[session.status]} />,
    },
    {
      key: "activity",
      label: "Last activity",
      sortKey: "activity",
      defaultWidth: 118,
      minWidth: 100,
      cellClassName: "text-xs text-muted-foreground",
      cellTitle: (session) => new Date(session.lastActivityAt).toLocaleString(),
      render: (session) => formatRelativeTime(session.lastActivityAt, now),
    },
    {
      key: "session",
      label: "Session",
      defaultWidth: 155,
      minWidth: 120,
      render: (session) => (
        <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <span>{session.id.slice(0, 14)}…</span>
          <button
            type="button"
            aria-label="Copy session ID"
            onClick={(event) => {
              event.stopPropagation();
              onCopy(session.id);
            }}
            className="invisible rounded p-1 hover:bg-accent group-hover:visible"
          >
            <Clipboard className="size-3" />
          </button>
        </div>
      ),
    },
    {
      key: "workflow",
      label: "Workflow",
      defaultWidth: 170,
      minWidth: 130,
      render: (session) => (
        <div className="truncate text-xs font-medium">
          {session.workflow}
          <span className="ml-1 text-muted-foreground">{session.version}</span>
          {session.workflowCount > 1 && (
            <span className="ml-1 text-muted-foreground">
              +{session.workflowCount - 1}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "identity",
      label: "User / Tenant",
      defaultWidth: 160,
      minWidth: 120,
      render: (session) => (
        <div className="space-y-0.5 text-xs">
          <div className="truncate font-medium">{session.user ?? "—"}</div>
          <div className="truncate text-muted-foreground">
            {session.tenant ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "runs",
      label: "Runs",
      sortKey: "runs",
      defaultWidth: 145,
      minWidth: 118,
      cellClassName: "text-xs tabular-nums",
      render: (session) => (
        <div>
          <span className="font-medium">{session.runs}</span>
          <span className="ml-1 text-muted-foreground">
            {session.succeeded} ok
          </span>
          {session.failed > 0 && (
            <span className="ml-1 text-red-600">{session.failed} failed</span>
          )}
          {session.interrupted > 0 && (
            <span className="ml-1 text-amber-600">
              {session.interrupted} paused
            </span>
          )}
        </div>
      ),
    },
    {
      key: "checkpoint",
      label: "Checkpoint / Branch",
      defaultWidth: 154,
      minWidth: 125,
      cellClassName: "text-xs text-muted-foreground",
      render: (session) =>
        session.checkpoints === undefined && !session.hasFork ? (
          "—"
        ) : (
          <div className="flex items-center gap-2">
            {session.checkpoints !== undefined && (
              <span>
                {session.checkpoints} checkpoint
                {session.checkpoints === 1 ? "" : "s"}
              </span>
            )}
            {session.hasFork && (
              <GitFork
                className="size-3.5 text-foreground"
                aria-label="Has branch"
              />
            )}
          </div>
        ),
    },
    {
      key: "duration",
      label: "Duration",
      sortKey: "duration",
      defaultWidth: 108,
      minWidth: 86,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (session) =>
        session.duration === undefined ? "—" : formatElapsed(session.duration),
    },
    {
      key: "tokens",
      label: "Tokens",
      sortKey: "tokens",
      defaultWidth: 96,
      minWidth: 80,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (session) => formatOptionalNumber(session.tokens),
    },
    {
      key: "cost",
      label: "Cost",
      sortKey: "cost",
      defaultWidth: 100,
      minWidth: 80,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (session) => formatOptionalCost(session.cost),
    },
    {
      key: "result",
      label: "Latest result",
      defaultWidth: 330,
      minWidth: 200,
      render: (session) => (
        <p
          className={cn(
            "max-w-full truncate text-xs",
            session.latestError
              ? "text-red-700 dark:text-red-400"
              : "text-muted-foreground",
          )}
        >
          {session.pendingInterrupt && (
            <CirclePause className="mr-1 inline size-3 text-amber-600" />
          )}
          {session.latestError ??
            session.pendingInterrupt ??
            session.latestResult}
        </p>
      ),
    },
  ];
}
