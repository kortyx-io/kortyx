"use client";

import type { DiagnosticResponse } from "@kortyx/telemetry-contracts";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import Link from "@/components/scoped-link";

export function DiagnosticDetails({
  diagnostic,
}: {
  diagnostic: DiagnosticResponse;
}) {
  const { manifest, content, state } = diagnostic;
  const downloadable = state === "available" && content !== null;
  const query = new URLSearchParams({ env: manifest.environment });
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Error diagnostic</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {manifest.summary.type} · {manifest.environment} ·{" "}
            {manifest.handled
              ? "Reported as handled"
              : "Observed during failure"}
          </p>
        </div>
        {downloadable && (
          <a
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            href={`/api/studio/diagnostics/${manifest.diagnosticId}?${query}`}
            download
          >
            Download diagnostic
          </a>
        )}
      </div>
      <div aria-live="polite" className="rounded-md border p-4 text-sm">
        <p>
          Delivery: <strong>{state}</strong>. Capture:{" "}
          <strong>{content?.capture.status ?? manifest.captureStatus}</strong>.
        </p>
        {state !== "available" && (
          <p className="mt-2">
            {state === "expired"
              ? "Diagnostic retention has expired."
              : `Received ${diagnostic.receivedParts} of ${manifest.partCount} parts. The complete diagnostic is not available.`}
          </p>
        )}
        {content?.capture.status === "partial" && (
          <p className="mt-2">
            Some data could not be captured. Each omission below identifies its
            location and reason.
          </p>
        )}
        {!!content?.capture.redactions.length && (
          <p className="mt-2">
            Credentials were redacted in {content.capture.redactions.length}{" "}
            locations.
          </p>
        )}
      </div>
      <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-4 text-sm">
        {manifest.summary.message}
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Captured</dt>
          <dd>{manifest.occurredAt}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Retained until</dt>
          <dd>{diagnostic.expiresAt}</dd>
        </div>
        {Object.entries(manifest.correlation).map(([key, value]) => (
          <div key={key}>
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="break-all">
              {key === "runId" && value ? (
                <Link
                  className="text-primary hover:underline"
                  href={`/runs/${encodeURIComponent(value)}?env=${encodeURIComponent(manifest.environment)}`}
                >
                  {value}
                </Link>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {content && (
        <>
          <section>
            <h2 className="mb-2 font-semibold">
              Exception and provider details
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Expand causes, aggregate members, and custom fields. $ref points
              to a shared or circular object in this diagnostic.
            </p>
            <PayloadViewer value={content.data} defaultClean={false} />
          </section>
          {!!content.capture.omissions.length && (
            <section>
              <h2 className="mb-2 font-semibold">Omitted data</h2>
              <PayloadViewer
                value={content.capture.omissions}
                defaultClean={false}
              />
            </section>
          )}
          {!!content.capture.redactions.length && (
            <section>
              <h2 className="mb-2 font-semibold">Credential redactions</h2>
              <PayloadViewer
                value={content.capture.redactions}
                defaultClean={false}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
