"use client";

import type { EvalIssue } from "@kortyx/agent/evals";
import { ArrowUpRight } from "lucide-react";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalPayloadViewer } from "./eval-payload-viewer";

export function EvalFailure({
  issue,
  environment,
  scope,
}: {
  issue: Pick<EvalIssue, "code" | "message" | "failure" | "diagnosticId"> & {
    phase?: string;
  };
  environment?: string;
  scope: string;
}) {
  return (
    <section className="min-w-0 space-y-2 rounded-lg border border-red-500/25 bg-red-500/5 p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words font-mono text-[11px] text-red-700 dark:text-red-400">
          {issue.phase ? `${issue.phase} · ` : ""}
          {issue.failure?.domainCode ?? issue.code}
        </p>
        {issue.diagnosticId && environment ? (
          <Button variant="outline" size="xs" asChild>
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
        {issue.message}
      </p>
      {!issue.diagnosticId ? (
        <p className="text-[10px] text-muted-foreground">
          No full diagnostic reference was recorded.
        </p>
      ) : null}
      {issue.failure ? (
        <EvalDisclosure scope={`${scope}-failure`} label="Safe failure details">
          <EvalPayloadViewer
            scope={`${scope}-failure-payload`}
            value={issue.failure}
          />
        </EvalDisclosure>
      ) : null}
    </section>
  );
}
