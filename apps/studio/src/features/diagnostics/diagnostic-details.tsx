"use client";

import type { DiagnosticResponse } from "@kortyx/telemetry-contracts";
import { ArrowUpRight, CircleAlert, Download, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import {
  DetailHeader,
  Metric,
  StatusPill,
} from "@/components/detail/detail-primitives";
import { DetailTabs } from "@/components/detail/detail-tabs";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

const correlationLabels: Record<string, string> = {
  runId: "Run",
  workflowId: "Workflow",
  nodeId: "Node",
  sessionId: "Session",
  invocationId: "Invocation",
  parentInvocationId: "Parent invocation",
  branchId: "Branch",
  toolCallId: "Tool call",
  attemptId: "Attempt",
  workflowRevisionId: "Workflow revision",
  traceId: "Trace",
  spanId: "Span",
  parentSpanId: "Parent span",
};

export function DiagnosticDetails({
  diagnostic,
}: {
  diagnostic: DiagnosticResponse;
}) {
  const { manifest, content, state } = diagnostic;
  const downloadable = state === "available" && content !== null;
  const captureStatus = content?.capture.status ?? manifest.captureStatus;
  const redactions = content?.capture.redactions ?? [];
  const omissions = content?.capture.omissions ?? [];
  const query = new URLSearchParams({ env: manifest.environment });
  const bytes = diagnostic.contentByteLength ?? manifest.byteLength;
  const runHref = manifest.correlation.runId
    ? `/runs/${encodeURIComponent(manifest.correlation.runId)}?env=${encodeURIComponent(manifest.environment)}&tab=events`
    : null;

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-col">
      <DetailHeader
        eyebrow="Error diagnostic"
        title={manifest.summary.type}
        description={
          <span className="[overflow-wrap:anywhere]">
            {manifest.summary.message}
          </span>
        }
        status={
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusPill tone={downloadable ? "success" : "warning"}>
              {state === "available" ? "Available" : state}
            </StatusPill>
            {downloadable && (
              <Button variant="outline" size="xs" asChild>
                <a
                  href={`/api/studio/diagnostics/${manifest.diagnosticId}?${query}`}
                  download
                >
                  <Download />
                  Download diagnostic
                </a>
              </Button>
            )}
          </div>
        }
        metrics={
          <>
            <Metric label="Capture" value={captureStatus} />
            <Metric label="Size" value={`${(bytes / 1024).toFixed(1)} KiB`} />
            <Metric
              label="Redactions"
              value={content ? redactions.length : "—"}
            />
            <Metric
              label="Omissions"
              value={content ? omissions.length : "—"}
            />
          </>
        }
      />
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] @4xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-h-0 min-w-0">
          <DetailTabs
            tabs={[
              {
                id: "exception",
                label: "Exception",
                content: content ? (
                  <section
                    aria-label="Exception and provider details"
                    className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4 @lg:p-6"
                  >
                    <div className="shrink-0">
                      <h3 className="text-xs font-semibold">
                        Exception and provider details
                      </h3>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                        Inspect causes, aggregate members, and provider fields.
                        Long values are previewed in Pretty; JSON and download
                        contain the full captured values.
                      </p>
                    </div>
                    <PayloadViewer
                      value={content.data}
                      defaultClean={false}
                      stringPreviewLength={240}
                      className="flex min-h-0 flex-1 flex-col [&_[data-payload-content]]:min-h-0 [&_[data-payload-content]]:max-h-none [&_[data-payload-content]]:flex-1 [&_[data-responsive-surface]]:shrink-0"
                    />
                  </section>
                ) : (
                  <div className="flex h-full items-center justify-center p-6">
                    <div className="max-w-sm text-center">
                      <CircleAlert className="mx-auto mb-3 size-6 text-muted-foreground" />
                      <h3 className="text-sm font-medium">
                        Full diagnostic unavailable
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {state === "expired"
                          ? "The retention period for this diagnostic has expired."
                          : `Received ${diagnostic.receivedParts} of ${manifest.partCount} parts. The diagnostic cannot be reconstructed yet.`}
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                id: "capture",
                label: "Capture details",
                content: (
                  <div className="space-y-5 p-4 @lg:p-6">
                    <section
                      aria-live="polite"
                      className="rounded-lg border p-4"
                    >
                      <h3 className="text-xs font-semibold">
                        Capture integrity
                      </h3>
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ContextField label="Delivery" value={state} />
                        <ContextField label="Capture" value={captureStatus} />
                        <ContextField
                          label="Received parts"
                          value={`${diagnostic.receivedParts} of ${manifest.partCount}`}
                        />
                        <ContextField
                          label="Size"
                          value={`${bytes.toLocaleString("en-US")} bytes`}
                        />
                      </dl>
                      {state !== "available" && (
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {state === "expired"
                            ? "Diagnostic retention has expired."
                            : "Delivery is not complete. The complete diagnostic is not available."}
                        </p>
                      )}
                      {captureStatus !== "complete" && (
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          Some data could not be captured. Omissions identify
                          the affected locations and reasons.
                        </p>
                      )}
                    </section>
                    <CaptureNotes
                      title="Omitted data"
                      empty="No diagnostic data was omitted during capture."
                      notes={omissions}
                    />
                    <CaptureNotes
                      title="Credential redactions"
                      empty="No credentials were detected during capture."
                      notes={redactions}
                    />
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      $ref identifies a shared or circular object elsewhere in
                      this diagnostic.
                    </p>
                  </div>
                ),
              },
              {
                id: "context",
                label: "Context",
                content: (
                  <DiagnosticContext
                    diagnostic={diagnostic}
                    runHref={runHref}
                  />
                ),
              },
            ]}
          />
        </div>
        <aside
          aria-label="Diagnostic context"
          className="hidden min-h-0 min-w-0 overflow-auto border-l bg-muted/10 @4xl:block"
        >
          <DiagnosticContext diagnostic={diagnostic} runHref={runHref} />
        </aside>
      </div>
    </div>
  );
}

function DiagnosticContext({
  diagnostic,
  runHref,
}: {
  diagnostic: DiagnosticResponse;
  runHref: string | null;
}) {
  const { manifest } = diagnostic;
  return (
    <div className="space-y-6 p-4">
      <section>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">Execution context</h3>
          {runHref && (
            <Button variant="ghost" size="xs" asChild>
              <Link href={runHref}>
                View run <ArrowUpRight />
              </Link>
            </Button>
          )}
        </div>
        <dl className="space-y-3">
          {Object.entries(manifest.correlation).map(([key, value]) => (
            <ContextField
              key={key}
              label={correlationLabels[key] ?? key}
              value={
                key === "runId" && runHref ? (
                  <Link className="hover:underline" href={runHref}>
                    {value}
                  </Link>
                ) : (
                  value
                )
              }
              mono
            />
          ))}
        </dl>
      </section>
      <section className="border-t pt-4">
        <h3 className="mb-4 text-xs font-semibold">Diagnostic record</h3>
        <dl className="space-y-3">
          <ContextField label="Environment" value={manifest.environment} />
          <ContextField label="Service" value={manifest.service.name} />
          {manifest.service.deploymentRef && (
            <ContextField
              label="Deployment"
              value={manifest.service.deploymentRef}
              mono
            />
          )}
          <ContextField
            label="Captured"
            value={formatDateTime(manifest.occurredAt)}
          />
          <ContextField
            label="Retained until"
            value={formatDateTime(diagnostic.expiresAt)}
          />
          <ContextField
            label="Handling"
            value={
              manifest.handled
                ? "Reported as handled"
                : "Observed during failure"
            }
          />
          <ContextField
            label="Diagnostic ID"
            value={manifest.diagnosticId}
            mono
          />
        </dl>
      </section>
      <div className="flex items-start gap-2 border-t pt-4 text-[11px] leading-4 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        <p>Credential redaction is applied to the captured diagnostic.</p>
      </div>
    </div>
  );
}

function ContextField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-xs leading-4 [overflow-wrap:anywhere] ${mono ? "font-mono text-[11px]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function CaptureNotes({
  title,
  notes,
  empty,
}: {
  title: string;
  notes: unknown[];
  empty: string;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold">{title}</h3>
      {notes.length ? (
        <PayloadViewer value={notes} defaultClean={false} />
      ) : (
        <p className="rounded-lg border bg-muted/10 p-3 text-xs text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}
