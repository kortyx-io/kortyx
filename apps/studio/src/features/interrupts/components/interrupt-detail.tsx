import type {
  StudioInterruptDetailResponse,
  StudioInterruptStatus,
} from "@kortyx/telemetry-contracts";
import { CheckCircle2, CircleAlert, CirclePause, Clock3 } from "lucide-react";
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
  interruptInteractionLabel,
  interruptStatusLabel,
  interruptTimingPresentation,
  interruptTypeLabel,
} from "@/features/interrupts/lib/interrupt-presentation";
import { formatCount, formatDateTime } from "@/lib/format";

export function InterruptDetail({
  detail,
}: {
  detail: StudioInterruptDetailResponse;
}) {
  const { interrupt } = detail;
  const timing = interruptTimingPresentation(interrupt, Date.now());
  const interactionLabel = interruptInteractionLabel(interrupt);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow="Interrupt"
        title={interrupt.id}
        status={
          <StatusPill tone={statusTone(interrupt.status)}>
            {interruptStatusLabel(interrupt.status)}
          </StatusPill>
        }
        description={
          <span>
            {interrupt.workflowId}
            {interrupt.nodeId ? ` / ${interrupt.nodeId}` : ""} ·{" "}
            {interrupt.environment}
            {" · "}
            <DetailLink
              className="hover:underline"
              href={`/runs/${interrupt.runId}`}
            >
              Run
            </DetailLink>
            {interrupt.sessionId && (
              <>
                {" "}
                ·{" "}
                <DetailLink
                  className="hover:underline"
                  href={`/sessions/${interrupt.sessionId}`}
                >
                  Session
                </DetailLink>
              </>
            )}
          </span>
        }
        metrics={
          <>
            <Metric
              label="Interaction"
              value={interactionLabel}
              title={`${interactionLabel} · ${interruptTypeLabel(interrupt.type)}`}
            />
            <Metric label="Timing" value={timing.label} title={timing.title} />
            <Metric label="Type" value={interruptTypeLabel(interrupt.type)} />
            <Metric
              label="Events"
              value={formatCount(detail.events.length, { compact: false })}
            />
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
          queryKey="interruptTab"
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
  const interactionLabel = interruptInteractionLabel(interrupt);
  return (
    <div className="@container">
      <div
        data-responsive-surface="interrupt-decision"
        className="grid min-w-0 gap-6 p-4 @2xl:p-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]"
      >
        <section className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Decision requested
          </p>
          <div className="mt-3 rounded-lg border bg-muted/15 p-5">
            <p className="text-base font-medium leading-relaxed">
              {interrupt.question ?? "Request content was not captured"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill>{interactionLabel}</StatusPill>
              <StatusPill>{interruptTypeLabel(interrupt.type)}</StatusPill>
              {interrupt.schemaId && (
                <StatusPill>
                  {interrupt.schemaId}
                  {interrupt.schemaVersion
                    ? ` v${interrupt.schemaVersion}`
                    : ""}
                </StatusPill>
              )}
            </div>
            <InterruptRequestDetails detail={detail} />
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
              ) : interrupt.responseCaptured ? (
                <>
                  <p className="text-sm">
                    {interrupt.response ?? "An empty response was submitted"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {interrupt.resolvedBy
                      ? `Resolved by ${interrupt.resolvedBy}`
                      : "Resolver not captured"}
                    {interrupt.resolvedAt
                      ? ` · ${formatDateTime(interrupt.resolvedAt)}`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {responseUnavailableLabel(interrupt.status)}
                </p>
              )}
            </div>
          </div>
        </section>
        <aside className="min-w-0">
          <h3 className="text-sm font-semibold">Execution context</h3>
          <dl className="mt-3 divide-y">
            <KeyValue label="Workflow">{interrupt.workflowId}</KeyValue>
            <KeyValue label="Node">
              {interrupt.nodeId ?? "Not captured"}
            </KeyValue>
            <KeyValue label="Interaction">{interactionLabel}</KeyValue>
            <KeyValue label="Schema">
              {interrupt.schemaId
                ? `${interrupt.schemaId}${interrupt.schemaVersion ? ` v${interrupt.schemaVersion}` : ""}`
                : "Not declared"}
            </KeyValue>
            <KeyValue label="User">
              {interrupt.userId ?? "Not captured"}
            </KeyValue>
            <KeyValue label="Tenant">
              {interrupt.tenantId ?? "Not captured"}
            </KeyValue>
            <KeyValue label="Expires">
              {interrupt.expiresAt
                ? formatDateTime(interrupt.expiresAt)
                : "No expiry"}
            </KeyValue>
            <KeyValue label="Resolved">
              {interrupt.resolvedAt
                ? formatDateTime(interrupt.resolvedAt)
                : "Not resolved"}
            </KeyValue>
            <KeyValue label="Resolver">
              {interrupt.resolvedBy ?? "Not captured"}
            </KeyValue>
            <KeyValue label="Resume outcome">
              {interrupt.resumeOutcome ?? "Not attempted"}
            </KeyValue>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function InterruptRequestDetails({
  detail,
}: {
  detail: StudioInterruptDetailResponse;
}) {
  const { interrupt } = detail;
  if (interrupt.interactionMode === "dynamic-picker") {
    return (
      <p className="mt-4 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs leading-relaxed text-blue-700 dark:text-blue-400">
        Options are resolved by the client
        {interrupt.schemaId ? ` using ${interrupt.schemaId}` : ""}. No static
        option list was sent with this interrupt.
      </p>
    );
  }
  if (interrupt.interactionMode === "freeform") {
    return (
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        The client requested a free-form text response.
      </p>
    );
  }
  if (interrupt.interactionMode !== "static-options") {
    return (
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        The SDK did not capture enough structural metadata to identify where the
        choices came from.
      </p>
    );
  }
  if (interrupt.options === null) {
    return (
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {formatCount(interrupt.optionCount, {
          compact: false,
          fallback: "Static",
        })}{" "}
        {interrupt.optionCount === 1 ? "option was" : "options were"} available;
        labels were not captured by the telemetry content policy.
      </p>
    );
  }
  return (
    <ul className="mt-4 grid min-w-0 gap-2">
      {interrupt.options.map((option) => (
        <li
          key={option.id}
          className="min-w-0 rounded-md border bg-background/60 px-3 py-2"
        >
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-sm font-medium">
              {option.label}
            </span>
            <code className="max-w-[45%] truncate text-[10px] text-muted-foreground">
              {option.id}
            </code>
          </div>
          {option.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {option.description}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

const responseUnavailableLabel = (status: StudioInterruptStatus): string => {
  if (status === "cancelled")
    return "Cancelled before a response was received.";
  if (status === "expired") return "Expired before a response was received.";
  if (status === "failed") {
    return "The response content was not captured; the resume attempt failed.";
  }
  return "Response content was not captured by the telemetry policy.";
};

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
    <div className="@container p-4 @lg:p-6">
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
                {formatDateTime(event.occurredAt)}
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
    <div className="@container space-y-5 p-4 @lg:p-6">
      <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
        Resume capability tokens are masked by the Studio API.
      </div>
      {detail.events.map((event) => (
        <section key={event.id}>
          <div className="mb-2 flex min-w-0 flex-wrap justify-between gap-2 text-xs">
            <h3 className="min-w-0 break-words font-medium">{event.type}</h3>
            <time
              className="break-words font-mono text-[10px] text-muted-foreground"
              dateTime={event.occurredAt}
            >
              {formatDateTime(event.occurredAt)}
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
