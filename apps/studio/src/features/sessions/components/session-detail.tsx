import type {
  StudioDetailEvent,
  StudioRun,
  StudioRunStatus,
  StudioSessionDetailResponse,
} from "@kortyx/telemetry-contracts";
import {
  CheckCircle2,
  CircleAlert,
  CirclePause,
  GitFork,
  History,
} from "lucide-react";
import { DetailLink } from "@/components/detail/detail-link";
import {
  DetailHeader,
  KeyValue,
  Metric,
  StatusPill,
} from "@/components/detail/detail-primitives";
import { DetailTabs } from "@/components/detail/detail-tabs";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatDurationMs,
} from "@/lib/format";

export function SessionDetail({
  detail,
}: {
  detail: StudioSessionDetailResponse;
}) {
  const { session } = detail;
  const statusLabel =
    session.status === "interrupted" && session.interruptStatus === "pending"
      ? "waiting for input"
      : session.status === "interrupted" &&
          session.interruptStatus === "expired"
        ? "input expired"
        : session.status;
  const chronologicalRuns = [...detail.runs].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow="Session"
        title={session.id}
        status={
          <StatusPill tone={statusTone(session.status)}>
            {statusLabel}
          </StatusPill>
        }
        description={
          <span>
            {session.activeWorkflowId ?? "Unknown workflow"}{" "}
            {session.activeVersion ?? "unversioned"} · {session.environment} ·
            last active {formatDateTime(session.lastActivityAt)}
          </span>
        }
        metrics={
          <>
            <Metric
              label="Runs"
              value={formatCount(session.runs, { compact: false })}
            />
            <Metric
              label="Duration"
              value={formatDurationMs(session.durationMs, {
                fallback: "Active",
              })}
              title={formatDurationMs(session.durationMs, {
                fallback: "Active",
                style: "full",
              })}
            />
            <Metric
              label="Tokens"
              value={formatCount(session.tokens, { fallback: "Not captured" })}
              title={formatCount(session.tokens, {
                compact: false,
                fallback: "Not captured",
              })}
            />
            <Metric
              label="Cost"
              value={formatCurrency(session.cost, {
                currency: session.currency,
                fallback: "Unknown",
              })}
            />
          </>
        }
        alert={
          session.pendingInterruptId ? (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {session.interruptStatus === "expired"
                ? "Human input request expired."
                : "Waiting for human input."}{" "}
              <DetailLink
                className="font-medium underline"
                href={`/interrupts/${session.pendingInterruptId}`}
              >
                Open interrupt
              </DetailLink>
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1">
        <DetailTabs
          queryKey="sessionTab"
          tabs={[
            {
              id: "activity",
              label: "Activity",
              content: (
                <SessionActivity
                  runs={chronologicalRuns}
                  events={detail.events}
                />
              ),
            },
            {
              id: "runs",
              label: `Runs ${detail.runs.length}`,
              content: <SessionRuns runs={chronologicalRuns} />,
            },
            {
              id: "state",
              label: `State ${session.checkpoints}`,
              content: <SessionState events={detail.events} />,
            },
            {
              id: "metadata",
              label: "Metadata",
              content: <SessionMetadata detail={detail} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

function SessionActivity({
  runs,
  events,
}: {
  runs: StudioRun[];
  events: StudioDetailEvent[];
}) {
  if (runs.length === 0)
    return <Empty label="No runs were captured for this session." />;
  return (
    <div className="@container space-y-0 p-4 @lg:p-6">
      {runs.map((run, index) => {
        const runEvents = events.filter((event) => event.runId === run.id);
        const lifecycle = runEvents.filter(
          (event) =>
            event.type.startsWith("session.") ||
            event.type.startsWith("interrupt."),
        );
        return (
          <div key={run.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < runs.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] border-l" />
            )}
            <span className="z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
              {run.status === "failed" ? (
                <CircleAlert className="size-4 text-red-600" />
              ) : run.status === "interrupted" ? (
                <CirclePause className="size-4 text-amber-600" />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-600" />
              )}
            </span>
            <div className="min-w-0 flex-1 rounded-lg border bg-muted/15 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <DetailLink
                    href={`/runs/${run.id}`}
                    className="font-mono text-xs font-semibold hover:underline"
                  >
                    {run.id}
                  </DetailLink>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.workflowId} · {formatDateTime(run.startedAt)}
                  </p>
                </div>
                <StatusPill tone={statusTone(run.status)}>
                  {run.status}
                </StatusPill>
              </div>
              <p className="mt-3 text-sm">
                {run.result ?? "No result captured"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
                <span>
                  {formatDurationMs(run.durationMs, { fallback: "Active" })}
                </span>
                <span>{formatCount(run.tokens, { fallback: "—" })} tokens</span>
                <span>
                  {formatCurrency(run.cost, {
                    currency: run.currency,
                    fallback: "Unknown",
                  })}
                </span>
              </div>
              {lifecycle.length > 0 && (
                <div className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                  {lifecycle.map((event) => (
                    <p key={event.id}>
                      {event.type} · {formatDateTime(event.occurredAt)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SessionRuns({ runs }: { runs: StudioRun[] }) {
  return (
    <div className="@container">
      <div className="divide-y">
        {runs.map((run) => (
          <DetailLink
            key={run.id}
            href={`/runs/${run.id}`}
            className="grid min-w-0 gap-2 px-4 py-4 hover:bg-muted/40 @2xl:grid-cols-[minmax(0,1fr)_auto_auto] @2xl:items-center @2xl:px-6"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-medium">{run.id}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {run.workflowId} · {run.path.join(" → ") || "No path captured"}
              </p>
            </div>
            <span
              className="font-mono text-xs text-muted-foreground"
              title={formatDurationMs(run.durationMs, {
                fallback: "Active",
                style: "full",
              })}
            >
              {formatDurationMs(run.durationMs, { fallback: "Active" })}
            </span>
            <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
          </DetailLink>
        ))}
      </div>
    </div>
  );
}

function SessionState({ events }: { events: StudioDetailEvent[] }) {
  const stateEvents = events.filter((event) =>
    event.type.startsWith("session."),
  );
  if (stateEvents.length === 0)
    return (
      <Empty label="No checkpoint, fork, or rollback events were captured." />
    );
  return (
    <div className="@container">
      <div className="divide-y">
        {stateEvents.map((event) => (
          <div key={event.id} className="flex gap-3 px-4 py-4 @lg:px-6">
            {event.type === "session.forked" ? (
              <GitFork className="mt-0.5 size-4 text-muted-foreground" />
            ) : (
              <History className="mt-0.5 size-4 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{event.type}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {formatDateTime(event.occurredAt)}
              </p>
              <div className="mt-3">
                <PayloadViewer value={event.payload} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionMetadata({ detail }: { detail: StudioSessionDetailResponse }) {
  const { session } = detail;
  return (
    <div className="@container">
      <div
        data-responsive-surface="session-metadata"
        className="grid min-w-0 gap-6 p-4 @2xl:p-6 @4xl:grid-cols-2 @4xl:gap-8"
      >
        <section className="min-w-0">
          <h3 className="text-sm font-semibold">Identity</h3>
          <dl className="mt-3 divide-y">
            <KeyValue label="User">{session.userId ?? "Not captured"}</KeyValue>
            <KeyValue label="Tenant">
              {session.tenantId ?? "Not captured"}
            </KeyValue>
            <KeyValue label="Environment">{session.environment}</KeyValue>
            <KeyValue label="Tags">
              {session.tags.join(", ") || "None"}
            </KeyValue>
          </dl>
        </section>
        <section className="min-w-0">
          <h3 className="text-sm font-semibold">Instrumentation</h3>
          <dl className="mt-3 divide-y">
            <KeyValue label="Workflows">
              {session.workflowIds.join(", ") || "Unknown"}
            </KeyValue>
            <KeyValue label="Providers">
              {session.providers.join(", ") || "Unknown"}
            </KeyValue>
            <KeyValue label="Models">
              {session.models.join(", ") || "Unknown"}
            </KeyValue>
            <KeyValue label="Updated">
              <span className="font-mono">
                {formatDateTime(detail.updatedAt)}
              </span>
            </KeyValue>
          </dl>
        </section>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">{label}</div>
  );
}

function statusTone(
  status: StudioRunStatus,
): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "interrupted" || status === "incomplete") return "warning";
  if (status === "running") return "info";
  return "neutral";
}
