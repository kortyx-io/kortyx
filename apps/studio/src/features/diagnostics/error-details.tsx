"use client";

import {
  type DiagnosticContent,
  DiagnosticContentSchema,
} from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import Link from "@/components/scoped-link";
import { studioFetch } from "@/lib/studio-fetch";

/** Shared by workflow errors, eval errors, and direct diagnostic investigation. */
export function ErrorDetails({
  message,
  exception,
  diagnosticId,
  environment,
}: {
  message: string;
  exception?: DiagnosticContent;
  diagnosticId?: string;
  environment?: string;
}) {
  const [recorded, setRecorded] = useState(exception);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(Boolean(diagnosticId && environment));
  useEffect(() => {
    setRecorded(exception);
    setLoadError("");
    setLoading(Boolean(diagnosticId && environment));
    if (!diagnosticId || !environment) return;
    const controller = new AbortController();
    void studioFetch(
      `/api/studio/diagnostics/${encodeURIComponent(diagnosticId)}?env=${encodeURIComponent(environment)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `Full error details could not be loaded (HTTP ${response.status}).`,
          );
        const content = DiagnosticContentSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setRecorded(content);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(String(error));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [exception, diagnosticId, environment]);
  const data = recorded?.data;
  return (
    <div className="min-w-0 space-y-4">
      <div>
        {typeof data?.type === "string" && (
          <p className="mb-1 font-mono text-xs text-muted-foreground">
            {data.type}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
          {typeof data?.message === "string" ? data.message : message}
        </p>
      </div>
      {typeof data?.stack === "string" && (
        <section>
          <h3 className="mb-2 text-xs font-semibold">Stack trace</h3>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-[11px] [overflow-wrap:anywhere]">
            {data.stack}
          </pre>
        </section>
      )}
      {data?.cause !== undefined && (
        <section>
          <h3 className="mb-2 text-xs font-semibold">Caused by</h3>
          <PayloadViewer value={data.cause} defaultClean={false} />
        </section>
      )}
      {data && (
        <section>
          <h3 className="mb-2 text-xs font-semibold">Captured error</h3>
          <PayloadViewer value={data} defaultClean={false} />
        </section>
      )}
      {recorded && recorded.capture.status !== "complete" && (
        <p className="text-xs text-muted-foreground">
          Error capture is {recorded.capture.status}.{" "}
          {recorded.capture.omissions
            .map((item) => `${item.path}: ${item.reason}`)
            .join("; ")}
        </p>
      )}
      {loading && !data && (
        <output className="block text-xs text-muted-foreground">
          Loading original error details…
        </output>
      )}
      {loadError && (
        <p role="alert" className="text-xs text-destructive">
          {loadError}
        </p>
      )}
      {diagnosticId && environment && (
        <Link
          className="text-xs text-primary hover:underline"
          href={`/diagnostics/${encodeURIComponent(diagnosticId)}?env=${encodeURIComponent(environment)}`}
        >
          Open diagnostic and execution context
        </Link>
      )}
      {!data && !diagnosticId && (
        <p className="text-xs text-muted-foreground">
          No full diagnostic was recorded for this error.
        </p>
      )}
    </div>
  );
}
