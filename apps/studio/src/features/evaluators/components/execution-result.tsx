"use client";
import type { EvaluatorExecution } from "@kortyx/telemetry-contracts";
export function ExecutionResult({
  execution,
}: {
  execution: EvaluatorExecution;
}) {
  return (
    <section
      aria-label="Judge result"
      className="flex min-w-0 flex-col gap-4 rounded-md border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium">Preview result</h2>
        <output className="text-xs capitalize text-muted-foreground">
          {execution.status}
        </output>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {execution.evaluatorVersion
          ? `Judge v${execution.evaluatorVersion}`
          : "Saved draft"}
      </p>
      {execution.error && (
        <p role="alert" className="text-xs text-destructive">
          {execution.error}
        </p>
      )}
      {execution.verdict && (
        <>
          <div>
            <p className="text-[11px] text-muted-foreground">Verdict</p>
            <p className="mt-1 text-sm font-medium">
              {execution.verdict.passed ? "Pass" : "Fail"}
            </p>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-6">
            {execution.verdict.reason}
          </p>
          {Boolean(execution.verdict.evidence.length) && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium">Supporting evidence</h3>
              {execution.verdict.evidence.map((excerpt, index) => (
                <blockquote
                  key={`${index}:${excerpt}`}
                  className="whitespace-pre-wrap border-l-2 pl-3 text-xs leading-5 text-muted-foreground"
                >
                  {excerpt}
                </blockquote>
              ))}
            </div>
          )}
        </>
      )}
      {execution.usage && (
        <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
          <dt className="text-muted-foreground">Input tokens</dt>
          <dd>{execution.usage.inputTokens ?? "Unavailable"}</dd>
          <dt className="text-muted-foreground">Output tokens</dt>
          <dd>{execution.usage.outputTokens ?? "Unavailable"}</dd>
          <dt className="text-muted-foreground">
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
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-xs">Rendered request</summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px]">
          {JSON.stringify(execution.renderedMessages, null, 2)}
        </pre>
      </details>
    </section>
  );
}
