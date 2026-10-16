"use client";

import type { EvalIssue } from "@kortyx/agent/evals";
import { ErrorDetails } from "@/features/diagnostics/error-details";
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
  return (
    <section className="min-w-0 space-y-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3">
      <p className="font-mono text-[11px] text-red-700 dark:text-red-400">
        {issue.phase ? `${issue.phase} · ` : ""}
        {issue.failure?.domainCode ?? issue.code}
      </p>
      <ErrorDetails
        message={issue.message}
        exception={issue.exception}
        diagnosticId={issue.diagnosticId}
        environment={environment}
      />
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
