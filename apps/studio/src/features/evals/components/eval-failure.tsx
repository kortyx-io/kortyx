"use client";

import type { EvalIssue } from "@kortyx/agent/evals";
import { DiagnosticContentSchema } from "@kortyx/telemetry-contracts";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { studioFetch } from "@/lib/studio-fetch";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalPayloadViewer } from "./eval-payload-viewer";

export function EvalFailure({
  issue,
  environment,
  scope,
}: {
  issue: Pick<
    EvalIssue,
    "code" | "message" | "failure" | "diagnosticId" | "details" | "exception"
  > & {
    phase?: string;
  };
  environment?: string;
  scope: string;
}) {
  const [recorded, setRecorded] = useState(issue.exception);
  const [diagnosticError, setDiagnosticError] = useState("");
  useEffect(() => {
    setRecorded(issue.exception);
    setDiagnosticError("");
    if (!issue.diagnosticId || !environment) return;
    const controller = new AbortController();
    void studioFetch(
      `/api/studio/diagnostics/${encodeURIComponent(issue.diagnosticId)}?env=${encodeURIComponent(environment)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `Full error details could not be loaded (HTTP ${response.status}).`,
          );
        const content = DiagnosticContentSchema.parse(await response.json());
        if (!controller.signal.aborted) setRecorded(content);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDiagnosticError(String(error));
      });
    return () => controller.abort();
  }, [issue.exception, issue.diagnosticId, environment]);
  const exception = recorded ?? issue.exception;
  return (
    <section className="min-w-0 space-y-2 rounded-lg border border-red-500/25 bg-red-500/5 p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words font-mono text-[11px] text-red-700 dark:text-red-400">
          {issue.phase ? `${issue.phase} · ` : ""}
          {issue.failure?.domainCode ?? issue.code}
        </p>
        {issue.diagnosticId && environment ? (
          <Button variant="secondary" size="xs" asChild>
            <Link
              prefetch={false}
              href={`/diagnostics/${encodeURIComponent(issue.diagnosticId)}?env=${encodeURIComponent(environment)}`}
            >
              View diagnostic <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
      <p
        role="alert"
        className="whitespace-pre-wrap text-xs leading-5 text-red-700 [overflow-wrap:anywhere] dark:text-red-400"
      >
        {typeof exception?.data.message === "string"
          ? exception.data.message
          : issue.message}
      </p>
      {issue.details && (
        <p className="text-xs text-muted-foreground">
          {issue.details.timeoutMs !== undefined
            ? `Configured timeout: ${issue.details.timeoutMs / 1000} seconds. `
            : ""}
          {issue.details.httpStatus !== undefined
            ? `HTTP ${issue.details.httpStatus}.`
            : ""}
        </p>
      )}
      {exception && (
        <div className="space-y-3">
          <p className="text-xs font-medium">
            {typeof exception.data.type === "string"
              ? exception.data.type
              : "Error"}
          </p>
          {typeof exception.data.stack === "string" && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-[11px] [overflow-wrap:anywhere]">
              {exception.data.stack}
            </pre>
          )}
          {exception.data.cause !== undefined && (
            <div>
              <p className="mb-1 text-xs font-medium">Caused by</p>
              <EvalPayloadViewer
                scope={`${scope}-cause`}
                value={exception.data.cause}
              />
            </div>
          )}
          <EvalPayloadViewer
            scope={`${scope}-original-error`}
            value={exception.data}
          />
          {exception.capture.status !== "complete" && (
            <p className="text-xs text-muted-foreground">
              Error capture is {exception.capture.status}.{" "}
              {exception.capture.omissions
                .map((item) => `${item.path}: ${item.reason}`)
                .join("; ")}
            </p>
          )}
        </div>
      )}
      {diagnosticError && (
        <p className="text-xs text-muted-foreground">{diagnosticError}</p>
      )}
      {!issue.diagnosticId && !exception ? (
        <p className="text-[10px] text-muted-foreground">
          No full diagnostic reference was recorded.
        </p>
      ) : null}
      {issue.failure ? (
        <EvalDisclosure scope={`${scope}-failure`} label="Failure details">
          <EvalPayloadViewer
            scope={`${scope}-failure-payload`}
            value={issue.failure}
          />
        </EvalDisclosure>
      ) : null}
    </section>
  );
}
