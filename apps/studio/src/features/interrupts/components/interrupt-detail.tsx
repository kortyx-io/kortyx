import type {
  StudioInterruptDetailResponse,
  StudioInterruptStatus,
} from "@kortyx/telemetry-contracts";
import { CheckCircle2, CircleAlert, CirclePause, Clock3 } from "lucide-react";
import Link from "next/link";
import {
  DetailHeader,
  KeyValue,
  Metric,
  StatusPill,
} from "@/components/detail/detail-primitives";
import { DetailTabs } from "@/components/detail/detail-tabs";
import { PayloadViewer } from "@/components/detail/payload-viewer";

export function InterruptDetail({
  detail,
}: {
  detail: StudioInterruptDetailResponse;
}) {
  const { interrupt } = detail;
  const ageMs =
    Date.parse(interrupt.resolvedAt ?? detail.updatedAt) -
    Date.parse(interrupt.createdAt);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow="Interrupt"
        title={interrupt.id}
        status={
          <StatusPill tone={statusTone(interrupt.status)}>
            {interrupt.status}
          </StatusPill>
        }
        description={
          <span>
            {interrupt.workflowId}
            {interrupt.nodeId ? ` / ${interrupt.nodeId}` : ""} ·{" "}
            {interrupt.environment}
            {" · "}
            <Link className="hover:underline" href={`/runs/${interrupt.runId}`}>
              Run
            </Link>
            {interrupt.sessionId && (
              <>
                {" "}
                ·{" "}
                <Link
                  className="hover:underline"
                  href={`/sessions/${interrupt.sessionId}`}
                >
                  Session
                </Link>
              </>
            )}
          </span>
        }
        metrics={
          <>
            <Metric label="Type" value={interrupt.type} />
            <Metric label="Age" value={formatDuration(ageMs)} />
            <Metric label="Options" value={interrupt.optionCount ?? "—"} />
            <Metric label="Events" value={detail.events.length} />
          </>
        }
        alert={
          interrupt.resumeError ? (
            <div className="rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <span className="font-medium">Resume failed: </span>
              {interrupt.resumeError}
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1">
        <DetailTabs
          tabs={[
            {
              id: "decision",
              label: "Decision",
              content: <Decision detail={detail} />,
            },
            {
              id: "timeline",
              label: "Timeline",
              content: <InterruptTimeline detail={detail} />,
            },
            {
              id: "payload",
              label: "Payload",
              content: <InterruptPayload detail={detail} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

function Decision({ detail }: { detail: StudioInterruptDetailResponse }) {
  const { interrupt } = detail;
  return (
    <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Decision requested
        </p>
        <div className="mt-3 rounded-lg border bg-muted/15 p-5">
          <p className="text-base font-medium leading-relaxed">
            {interrupt.question ?? "Content was not captured"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill>{interrupt.type}</StatusPill>
            {interrupt.optionCount !== null && (
              <StatusPill>{interrupt.optionCount} options</StatusPill>
            )}
          </div>
        </div>
        <div className="mt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Response
          </p>
          <div className="mt-3 rounded-lg border p-4">
            {interrupt.status === "pending" ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <CirclePause className="size-4" />
                Awaiting response — Studio is read-only in this release.
              </div>
            ) : (
              <>
                <p className="text-sm">
                  {interrupt.response ?? "No response content captured"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {interrupt.resolvedBy
                    ? `Resolved by ${interrupt.resolvedBy}`
                    : "Resolver not captured"}
                  {interrupt.resolvedAt
                    ? ` · ${new Date(interrupt.resolvedAt).toLocaleString()}`
                    : ""}
                </p>
              </>
            )}
          </div>
        </div>
      </section>
      <aside>
        <h3 className="text-sm font-semibold">Execution context</h3>
        <dl className="mt-3 divide-y">
          <KeyValue label="Workflow">{interrupt.workflowId}</KeyValue>
          <KeyValue label="Node">{interrupt.nodeId ?? "Not captured"}</KeyValue>
          <KeyValue label="User">{interrupt.userId ?? "Not captured"}</KeyValue>
          <KeyValue label="Tenant">
            {interrupt.tenantId ?? "Not captured"}
          </KeyValue>
          <KeyValue label="Expires">
            {interrupt.expiresAt
              ? new Date(interrupt.expiresAt).toLocaleString()
              : "No expiry"}
          </KeyValue>
          <KeyValue label="Resume outcome">
            {interrupt.resumeOutcome ?? "Not attempted"}
          </KeyValue>
        </dl>
      </aside>
    </div>
  );
}

function InterruptTimeline({
  detail,
}: {
  detail: StudioInterruptDetailResponse;
}) {
  if (detail.events.length === 0)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No interrupt lifecycle events captured.
      </div>
    );
  return (
    <div className="p-5 md:p-6">
      {detail.events.map((event, index) => {
        const Icon =
          event.type === "interrupt.created"
            ? CirclePause
            : event.type === "interrupt.resolved"
              ? CheckCircle2
              : event.type === "interrupt.expired"
                ? Clock3
                : CircleAlert;
        return (
          <div key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < detail.events.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] border-l" />
            )}
            <span className="z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
              <Icon className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-xs font-medium">{event.type}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {new Date(event.occurredAt).toLocaleString()}
              </p>
              <div className="mt-3">
                <PayloadViewer value={event.payload} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InterruptPayload({
  detail,
}: {
  detail: StudioInterruptDetailResponse;
}) {
  return (
    <div className="space-y-5 p-5 md:p-6">
      <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
        Resume capability tokens are masked by the Studio API.
      </div>
      {detail.events.map((event) => (
        <section key={event.id}>
          <div className="mb-2 flex justify-between gap-3 text-xs">
            <h3 className="font-medium">{event.type}</h3>
            <time className="font-mono text-[10px] text-muted-foreground">
              {event.occurredAt}
            </time>
          </div>
          <PayloadViewer value={event.payload} />
        </section>
      ))}
    </div>
  );
}

function statusTone(
  status: StudioInterruptStatus,
): "success" | "danger" | "warning" | "neutral" {
  if (status === "resolved") return "success";
  if (status === "failed") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

function formatDuration(value: number) {
  const seconds = Math.max(0, Math.round(value / 1_000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
}
