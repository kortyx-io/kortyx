import type { EvalCheck, EvalCheckResult } from "@kortyx/agent/evals";
import { evalCheckLabel } from "../lib/check-label";
import { EvalStatus } from "./eval-status";

/** Flat recorded verdicts inside Assessment details; no nested disclosures. */
export function EvalAutomaticChecks({
  checks,
  results,
  mode = "result",
}: {
  checks?: readonly EvalCheck[];
  results?: readonly EvalCheckResult[];
  mode?: "definition" | "result";
}) {
  if (!checks?.length) return null;
  return (
    <ul data-guide-focus="eval-checks" className="flex min-w-0 flex-col gap-3">
      {checks.map((check, index) => {
        const result = results?.find((item) => item.index === index);
        return (
          <li
            key={`${index}:${check.type}`}
            className="flex min-w-0 flex-col gap-2 rounded-md bg-background/60 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">
                {evalCheckLabel(check)}
              </p>
              {result ? (
                <EvalStatus status={result.passed ? "passed" : "failed"} />
              ) : mode === "result" ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Not assessed
                </span>
              ) : null}
            </div>
            {result?.reason ? (
              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {result.reason}
              </p>
            ) : null}
            {check.type === "tool-input-equals" ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Expected input</p>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs [overflow-wrap:anywhere]">
                  {JSON.stringify(check.input, null, 2)}
                </pre>
              </div>
            ) : null}
            {result?.evidence.length ? (
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs text-muted-foreground">Evidence</p>
                {result.evidence.map((text, evidenceIndex) => (
                  <blockquote
                    key={`${evidenceIndex}:${text}`}
                    className="whitespace-pre-wrap break-words border-l-2 border-info/30 pl-3 text-xs leading-relaxed [overflow-wrap:anywhere]"
                  >
                    {text}
                  </blockquote>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
