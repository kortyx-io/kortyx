import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Clipboard,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import type { DataTableColumn } from "@/components/data-table";
import type {
  Interrupt,
  InterruptSortKey,
  InterruptStatus,
} from "@/features/interrupts/schema";
import {
  CompactStatus,
  type CompactStatusMeta,
} from "@/features/telemetry/components/compact-status";
import {
  formatElapsed,
  formatRelativeTime,
} from "@/features/telemetry/lib/format";
import { cn } from "@/lib/utils";

const statusMeta: Record<InterruptStatus, CompactStatusMeta> = {
  pending: {
    label: "Pending",
    icon: LoaderCircle,
    className: "text-amber-600",
    animate: true,
  },
  resolved: {
    label: "Resolved",
    icon: CircleCheck,
    className: "text-emerald-600",
  },
  expired: {
    label: "Expired",
    icon: Clock3,
    className: "text-muted-foreground",
  },
  failed: { label: "Failed", icon: CircleAlert, className: "text-red-600" },
  cancelled: {
    label: "Cancelled",
    icon: CircleX,
    className: "text-muted-foreground",
  },
};

export function createInterruptColumns({
  now,
  onCopy,
}: {
  now: number;
  onCopy: (value: string) => void;
}): DataTableColumn<Interrupt, InterruptSortKey>[] {
  return [
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      defaultWidth: 130,
      minWidth: 108,
      cellClassName: "px-4",
      render: (interrupt) => (
        <CompactStatus meta={statusMeta[interrupt.status]} />
      ),
    },
    {
      key: "created",
      label: "Created",
      sortKey: "created",
      defaultWidth: 104,
      minWidth: 90,
      cellClassName: "text-xs text-muted-foreground",
      cellTitle: (interrupt) => new Date(interrupt.createdAt).toLocaleString(),
      render: (interrupt) => formatRelativeTime(interrupt.createdAt, now),
    },
    {
      key: "age",
      label: "Age / Resolved in",
      sortKey: "age",
      defaultWidth: 130,
      minWidth: 112,
      cellClassName: "font-mono text-xs tabular-nums",
      render: (interrupt) => {
        const seconds = Math.max(
          0,
          Math.floor(
            ((interrupt.resolvedAt ? Date.parse(interrupt.resolvedAt) : now) -
              Date.parse(interrupt.createdAt)) /
              1000,
          ),
        );
        return interrupt.status === "pending" ? (
          <span>
            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-amber-500" />
            {formatElapsed(seconds)}
          </span>
        ) : (
          formatElapsed(seconds)
        );
      },
    },
    {
      key: "request",
      label: "Request",
      defaultWidth: 280,
      minWidth: 180,
      render: (interrupt) => (
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {interrupt.type}
            </span>
            {interrupt.optionCount && (
              <span className="text-[10px] text-muted-foreground">
                {interrupt.optionCount} options
              </span>
            )}
          </div>
          <p className="truncate text-xs">{interrupt.question}</p>
        </div>
      ),
    },
    {
      key: "workflow",
      label: "Workflow / Node",
      defaultWidth: 170,
      minWidth: 130,
      render: (interrupt) => (
        <div className="space-y-0.5 text-xs">
          <div className="truncate font-medium">{interrupt.workflow}</div>
          <div className="truncate text-muted-foreground">{interrupt.node}</div>
        </div>
      ),
    },
    {
      key: "session",
      label: "Session",
      defaultWidth: 150,
      minWidth: 120,
      render: (interrupt) => (
        <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <span>{interrupt.session.slice(0, 14)}…</span>
          <button
            type="button"
            aria-label="Copy session ID"
            onClick={(event) => {
              event.stopPropagation();
              onCopy(interrupt.session);
            }}
            className="invisible rounded p-1 hover:bg-accent group-hover:visible"
          >
            <Clipboard className="size-3" />
          </button>
        </div>
      ),
    },
    {
      key: "identity",
      label: "User / Tenant",
      defaultWidth: 150,
      minWidth: 120,
      render: (interrupt) => (
        <div className="space-y-0.5 text-xs">
          <div className="truncate font-medium">{interrupt.user ?? "—"}</div>
          <div className="truncate text-muted-foreground">
            {interrupt.tenant ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "response",
      label: "Response",
      defaultWidth: 210,
      minWidth: 150,
      render: (interrupt) => (
        <p
          className={cn(
            "truncate text-xs",
            interrupt.status === "pending" ? "text-muted-foreground" : "",
          )}
        >
          {interrupt.status === "pending"
            ? "Awaiting response"
            : (interrupt.response ?? "—")}
        </p>
      ),
    },
    {
      key: "outcome",
      label: "Resume outcome",
      defaultWidth: 190,
      minWidth: 145,
      render: (interrupt) => (
        <div
          className={cn(
            "text-xs",
            interrupt.resumeError
              ? "text-red-700 dark:text-red-400"
              : "text-muted-foreground",
          )}
        >
          <p className="truncate">{interrupt.resumeOutcome ?? "—"}</p>
          {interrupt.resumeError && (
            <p className="truncate text-[11px]">{interrupt.resumeError}</p>
          )}
        </div>
      ),
    },
    {
      key: "run",
      label: "Run",
      defaultWidth: 145,
      minWidth: 110,
      render: (interrupt) => (
        <a
          href={`/runs/${interrupt.runId}`}
          onClick={(event) => event.stopPropagation()}
          className="block truncate font-mono text-xs text-muted-foreground hover:underline"
        >
          {interrupt.runId}
        </a>
      ),
    },
  ];
}
