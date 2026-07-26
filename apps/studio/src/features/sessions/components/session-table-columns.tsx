import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
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
import { CopyableCell } from "@/features/telemetry/components/copyable-cell";
import { TruncatedText } from "@/features/telemetry/components/truncated-text";
import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatDurationSeconds,
  formatRelativeTime,
} from "@/lib/format";
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
  incomplete: {
    label: "Incomplete",
    icon: CircleDashed,
    className: "text-orange-600",
  },
  failed: { label: "Failed", icon: CircleAlert, className: "text-red-600" },
  cancelled: {
    label: "Cancelled",
    icon: CircleX,
    className: "text-muted-foreground",
  },
};

const activeDurationSeconds = (session: Session, now: number) => {
  if (session.status !== "running" && session.status !== "interrupted") {
    return session.duration;
  }
  const lastActivityAt = Date.parse(session.lastActivityAt);
  if (!Number.isFinite(lastActivityAt)) return session.duration;
  return Math.max(session.duration ?? 0, (now - lastActivityAt) / 1000);
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
      cellClassName: "px-4",
      render: (session) => <CompactStatus meta={statusMeta[session.status]} />,
    },
    {
      key: "activity",
      label: "Last activity",
      sortKey: "activity",
      defaultWidth: 118,
      cellClassName: "text-xs text-muted-foreground",
      cellTitle: (session) => formatDateTime(session.lastActivityAt),
      render: (session) => (
        <TruncatedText>
          {formatRelativeTime(session.lastActivityAt, now)}
        </TruncatedText>
      ),
    },
    {
      key: "session",
      label: "Session",
      defaultWidth: 155,
      cellTitle: (session) => session.id,
      render: (session) => (
        <CopyableCell
          value={session.id}
          onCopy={onCopy}
          ariaLabel="Copy session ID"
        />
      ),
    },
    {
      key: "identity",
      label: "User / Tenant",
      defaultWidth: 160,
      render: (session) => (
        <div className="min-w-0 space-y-0.5 overflow-hidden text-xs">
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
      cellClassName: "text-xs tabular-nums",
      render: (session) => (
        <TruncatedText>
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
        </TruncatedText>
      ),
    },
    {
      key: "checkpoint",
      label: "Checkpoint / Branch",
      defaultWidth: 154,
      cellClassName: "text-xs text-muted-foreground",
      render: (session) =>
        session.checkpoints === undefined && !session.hasFork ? (
          "—"
        ) : (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground">
            {session.checkpoints !== undefined && (
              <span className="truncate">
                {session.checkpoints} checkpoint
                {session.checkpoints === 1 ? "" : "s"}
              </span>
            )}
            {session.hasFork && (
              <GitFork
                className="size-3.5 shrink-0 text-foreground"
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
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (session) =>
        formatDurationSeconds(activeDurationSeconds(session, now), {
          style: "full",
        }),
      render: (session) => {
        const duration = activeDurationSeconds(session, now);
        return <TruncatedText>{formatDurationSeconds(duration)}</TruncatedText>;
      },
    },
    {
      key: "tokens",
      label: "Tokens",
      sortKey: "tokens",
      defaultWidth: 96,
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (session) => formatCount(session.tokens, { compact: false }),
      render: (session) => (
        <TruncatedText>{formatCount(session.tokens)}</TruncatedText>
      ),
    },
    {
      key: "cost",
      label: "Cost",
      sortKey: "cost",
      defaultWidth: 100,
      cellClassName: "font-mono text-xs tabular-nums",
      cellTitle: (session) => formatCurrency(session.cost),
      render: (session) => (
        <TruncatedText>{formatCurrency(session.cost)}</TruncatedText>
      ),
    },
    {
      key: "result",
      label: "Latest result",
      defaultWidth: 330,
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
