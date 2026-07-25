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

export function SessionDetail({
  detail,
}: {
  detail: StudioSessionDetailResponse;
}) {
  const { session } = detail;
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
            {session.status}
          </StatusPill>
        }
        description={
          <span>
            {session.activeWorkflowId ?? "Unknown workflow"}{" "}
            {session.activeVersion ?? "unversioned"} · {session.environment} ·
            last active {new Date(session.lastActivityAt).toLocaleString()}
          </span>
        }
        metrics={
          <>
            <Metric label="Runs" value={session.runs} />
            <Metric
              label="Duration"
              value={formatDuration(session.durationMs)}
            />
            <Metric
              label="Tokens"
              value={session.tokens?.toLocaleString() ?? "Not captured"}
            />
            <Metric
              label="Cost"
              value={formatCost(session.cost, session.currency)}
            />
          </>
        }
        alert={
          session.pendingInterruptId ? (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Waiting for human input.{" "}
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
    <div className="space-y-0 p-5 md:p-6">
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
                    {run.workflowId} ·{" "}
                    {new Date(run.startedAt).toLocaleString()}
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
                <span>{formatDuration(run.durationMs)}</span>
                <span>{run.tokens?.toLocaleString() ?? "—"} tokens</span>
                <span>{formatCost(run.cost, run.currency)}</span>
              </div>
              {lifecycle.length > 0 && (
                <div className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                  {lifecycle.map((event) => (
                    <p key={event.id}>
                      {event.type} ·{" "}
                      {new Date(event.occurredAt).toLocaleTimeString()}
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
    <div className="divide-y">
      {runs.map((run) => (
        <DetailLink
          key={run.id}
          href={`/runs/${run.id}`}
          className="grid gap-2 px-5 py-4 hover:bg-muted/40 md:grid-cols-[1fr_auto_auto] md:items-center md:px-6"
        >
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-medium">{run.id}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {run.workflowId} · {run.path.join(" → ") || "No path captured"}
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {formatDuration(run.durationMs)}
          </span>
          <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
        </DetailLink>
      ))}
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
    <div className="divide-y">
      {stateEvents.map((event) => (
        <div key={event.id} className="flex gap-3 px-5 py-4 md:px-6">
          {event.type === "session.forked" ? (
            <GitFork className="mt-0.5 size-4 text-muted-foreground" />
          ) : (
            <History className="mt-0.5 size-4 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{event.type}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {event.occurredAt}
            </p>
            <div className="mt-3">
              <PayloadViewer value={event.payload} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionMetadata({ detail }: { detail: StudioSessionDetailResponse }) {
  const { session } = detail;
  return (
    <div className="grid gap-8 p-5 md:p-6 lg:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold">Identity</h3>
        <dl className="mt-3 divide-y">
          <KeyValue label="User">{session.userId ?? "Not captured"}</KeyValue>
          <KeyValue label="Tenant">
            {session.tenantId ?? "Not captured"}
          </KeyValue>
          <KeyValue label="Environment">{session.environment}</KeyValue>
          <KeyValue label="Tags">{session.tags.join(", ") || "None"}</KeyValue>
        </dl>
      </section>
      <section>
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
            <span className="font-mono">{detail.updatedAt}</span>
          </KeyValue>
        </dl>
      </section>
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
  if (status === "interrupted") return "warning";
  if (status === "running") return "info";
  return "neutral";
}

function formatDuration(value: number | null) {
  if (value === null) return "Active";
  if (value < 1_000) return `${Math.round(value)}ms`;
  if (value < 60_000)
    return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1_000)}s`;
}

function formatCost(value: number | null, currency: string | null) {
  return value === null
    ? "Unknown"
    : `${currency ?? "USD"} ${value.toFixed(value < 0.01 ? 4 : 2)}`;
}
