"use client";

import type {
  StudioRunDetailResponse,
  StudioRunStatus,
} from "@kortyx/telemetry-contracts";
import { DetailLink } from "@/components/detail/detail-link";
import {
  DetailHeader,
  KeyValue,
  Metric,
  StatusPill,
} from "@/components/detail/detail-primitives";
import { DetailTabs } from "@/components/detail/detail-tabs";
import { RunEvents } from "@/features/runs/components/run-events";
import { RunOverview } from "@/features/runs/components/run-overview";
import {
  isControlFlowInterrupt,
  RunTrace,
} from "@/features/runs/components/run-trace";

export function RunDetail({ detail }: { detail: StudioRunDetailResponse }) {
  const { run, events } = detail;
  const failure =
    run.status === "failed"
      ? [...events]
          .reverse()
          .find(
            (event) =>
              event.type === "span.failed" && !isControlFlowInterrupt(event),
          )
      : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow="Run"
        title={run.id}
        status={
          <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
        }
        description={
          <span>
            {run.workflowId} {run.declaredVersion ?? "unversioned"} ·{" "}
            {run.environment}
            {detail.session && (
              <>
                {" "}
                ·{" "}
                <DetailLink
                  className="hover:underline"
                  href={`/sessions/${detail.session.id}`}
                >
                  Session {shortId(detail.session.id)}
                </DetailLink>
              </>
            )}
          </span>
        }
        metrics={
          <>
            <Metric label="Duration" value={formatDuration(run.durationMs)} />
            <Metric
              label="Tokens"
              value={run.tokens?.toLocaleString() ?? "Not captured"}
            />
            <Metric label="Cost" value={formatCost(run.cost, run.currency)} />
            <Metric label="Events" value={events.length} />
          </>
        }
        alert={
          failure ? (
            <div className="rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <span className="font-medium">Latest error: </span>
              {errorText(failure.payload)}
            </div>
          ) : run.status === "interrupted" ? (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Waiting for input
              {run.interruptNodeId ? ` at ${run.interruptNodeId}` : ""}.
              {detail.interrupts[0] && (
                <>
                  {" "}
                  <DetailLink
                    className="font-medium underline"
                    href={`/interrupts/${detail.interrupts[0].id}`}
                  >
                    Open interrupt
                  </DetailLink>
                </>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1">
        <DetailTabs
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: <RunOverview detail={detail} />,
            },
            {
              id: "trace",
              label: "Trace",
              content: (
                <RunTrace
                  events={events}
                  startedAt={run.startedAt}
                  focusFailure={run.status === "failed"}
                />
              ),
            },
            {
              id: "summary",
              label: "Summary",
              content: <RunSummary detail={detail} />,
            },
            {
              id: "events",
              label: `Events ${events.length}`,
              content: <RunEvents events={events} startedAt={run.startedAt} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

function RunSummary({ detail }: { detail: StudioRunDetailResponse }) {
  const { run } = detail;
  return (
    <div className="@container">
      <div className="grid min-w-0 gap-6 p-4 @2xl:p-6 @4xl:grid-cols-2 @4xl:gap-8">
        <section className="min-w-0">
          <h3 className="text-sm font-semibold">Execution</h3>
          <dl className="mt-3 divide-y">
            <KeyValue label="Started">
              <span className="font-mono">
                {new Date(run.startedAt).toLocaleString()}
              </span>
            </KeyValue>
            <KeyValue label="Ended">
              <span className="font-mono">
                {run.endedAt
                  ? new Date(run.endedAt).toLocaleString()
                  : "Still active"}
              </span>
            </KeyValue>
            <KeyValue label="Path">
              {run.path.length ? run.path.join(" → ") : "Not captured"}
            </KeyValue>
            <KeyValue label="Result">{run.result ?? "Not captured"}</KeyValue>
          </dl>
        </section>
        <section className="min-w-0">
          <h3 className="text-sm font-semibold">Context</h3>
          <dl className="mt-3 divide-y">
            <KeyValue label="User">{run.userId ?? "Not captured"}</KeyValue>
            <KeyValue label="Tenant">{run.tenantId ?? "Not captured"}</KeyValue>
            <KeyValue label="Provider / model">
              {run.provider ?? "Unknown"} / {run.models.join(", ") || "Unknown"}
            </KeyValue>
            <KeyValue label="Pricing">
              {run.pricingStatus}
              {run.pricingSource ? ` · ${run.pricingSource}` : ""}
            </KeyValue>
          </dl>
        </section>
      </div>
    </div>
  );
}

function errorText(payload: Record<string, unknown>) {
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  )
    return payload.error.message;
  return "The run reported a failure. Inspect the trace for details.";
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
function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}
