"use client";
import type { EvaluatorExecution } from "@kortyx/telemetry-contracts";
import { useId, useState } from "react";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
export function ExecutionResult({
  execution,
}: {
  execution: EvaluatorExecution;
}) {
  const evidenceId = useId();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  return (
    <section
      aria-label="Judge result"
      className="flex min-w-0 flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Judge result</h3>
        <output className="rounded-md bg-muted px-2 py-1 text-xs capitalize">
          {execution.status}
        </output>
      </div>
      <p className="text-xs text-muted-foreground">
        {execution.scoreGroup.name} · v{execution.scoreGroup.version} ·{" "}
        {execution.source === "preview"
          ? "Saved draft preview"
          : `Evaluator v${execution.evaluatorVersion}`}
      </p>
      {execution.error && (
        <p role="alert" className="text-sm text-destructive">
          {execution.error}
        </p>
      )}
      {execution.scores?.map((score) => (
        <div key={score.fieldId} className="flex flex-col gap-1 border-t pt-3">
          <p className="text-sm font-medium">
            {execution.scoreGroup.fields.find((f) => f.id === score.fieldId)
              ?.label ?? score.fieldId}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {score.status === "scored"
              ? String(score.value)
              : score.status.replaceAll("_", " ")}
          </p>
          {score.evidence.map((reference, index) => (
            <Button
              key={`${reference.eventId ?? reference.recordingId}-${index}`}
              variant="link"
              size="inline"
              className="justify-start whitespace-normal text-left"
              aria-controls={evidenceId}
              onClick={() => setEvidenceOpen(true)}
            >
              View supporting evidence
              {reference.path
                ? ` · ${reference.path.split("/").filter(Boolean).slice(-2).join(" / ")}`
                : ""}
            </Button>
          ))}
        </div>
      ))}
      {execution.usage && (
        <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
          <dt>Input tokens</dt>
          <dd>{execution.usage.inputTokens ?? "Unavailable"}</dd>
          <dt>Output tokens</dt>
          <dd>{execution.usage.outputTokens ?? "Unavailable"}</dd>
          <dt>
            Judge cost
            {execution.usage.costSource === "rate-card" ? " (estimate)" : ""}
          </dt>
          <dd>
            {execution.usage.costUsd === null
              ? "Unavailable"
              : `$${execution.usage.costUsd.toFixed(6)} USD`}
          </dd>
        </dl>
      )}
      <details
        id={evidenceId}
        open={evidenceOpen}
        onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
        className="text-xs"
      >
        <summary className="cursor-pointer">
          Rendered judge request and evidence
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3">
          {JSON.stringify(
            {
              messages: execution.renderedMessages,
              evidence: execution.evidence,
            },
            null,
            2,
          )}
        </pre>
      </details>
      {execution.target.type === "run" && (
        <Link
          className="text-sm underline"
          href={`/runs/${encodeURIComponent(execution.target.runId)}`}
        >
          Open recorded run
        </Link>
      )}
      {execution.target.type === "case" && (
        <Link
          className="text-sm underline"
          href={`/experiments/cases/${execution.target.evalRunId}/${encodeURIComponent(execution.target.caseId)}/1?repetition=${execution.target.repetition}`}
        >
          Open experiment case
        </Link>
      )}
    </section>
  );
}
