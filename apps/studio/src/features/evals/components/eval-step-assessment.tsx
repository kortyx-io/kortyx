"use client";

import type { EvalCriterionResult, EvalStepResult } from "@kortyx/agent/evals";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { EvalAutomaticChecks } from "./eval-automatic-checks";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalOutputRequirements } from "./eval-output-requirements";
import { EvalStatus } from "./eval-status";

export function EvalStepAssessment({
  step,
  scope,
}: {
  step: EvalStepResult;
  scope: string;
}) {
  const failed = ["failed", "error"].includes(step.status);
  const criteria: { id: string; text: string; result?: EvalCriterionResult }[] =
    step.criteria.map((result) => ({
      id: result.id,
      text: result.text,
      result,
    }));
  // Ungraded/older executions can retain expectations without recorded verdicts.
  for (const [index, expected] of (step.expectation.criteria ?? []).entries()) {
    const id = typeof expected === "string" ? String(index) : expected.id;
    if (!criteria.some((criterion) => criterion.id === id))
      criteria.push({
        id,
        text: typeof expected === "string" ? expected : expected.text,
      });
  }
  criteria.sort(
    (a, b) =>
      Number(a.result?.passed ?? true) - Number(b.result?.passed ?? true),
  );
  const observationType =
    step.observation.type === "interrupt"
      ? "Human input requested"
      : step.observation.type === "answer"
        ? "Agent answer"
        : step.observation.type;
  return (
    <section data-eval-assessment className="flex min-w-0 flex-col gap-3">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-md border-l-2 px-3 py-2.5",
          step.status === "passed"
            ? "border-success bg-success/5"
            : failed
              ? "border-destructive bg-destructive/5"
              : "border-info bg-info/5",
        )}
      >
        <h4 className="text-sm font-semibold">
          Step {step.index + 1} assessment
        </h4>
        <EvalStatus status={step.status} />
      </div>
      {step.reason ? (
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]",
            failed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {step.reason}
        </p>
      ) : null}
      {criteria
        .filter(({ result }) => result && result.reason !== step.reason)
        .map(({ id, result }) =>
          result ? (
            <div
              key={id}
              data-guide-focus="eval-criterion"
              className="flex items-start justify-between gap-3"
            >
              <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                {result.reason || "No assessment explanation was recorded."}
              </p>
              {criteria.length > 1 ? (
                <EvalStatus status={result.passed ? "passed" : "failed"} />
              ) : null}
            </div>
          ) : null,
        )}
      <EvalDisclosure
        scope={`${scope}-expectations`}
        label="Assessment details"
        defaultOpen={
          failed || Boolean(step.checks?.some((check) => !check.passed))
        }
      >
        <div
          data-assessment-details
          className="flex min-w-0 flex-col gap-4 rounded-lg border bg-muted/10 p-3"
        >
          {criteria.map(({ id, text, result }, index) => (
            <section
              key={id}
              aria-label={
                criteria.length === 1 ? "Criterion" : `Criterion ${index + 1}`
              }
              className="flex min-w-0 flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-xs font-medium text-muted-foreground">
                  Criterion{criteria.length > 1 ? ` ${index + 1}` : ""}
                </h5>
                {result ? (
                  <EvalStatus status={result.passed ? "passed" : "failed"} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Not assessed
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                {text}
              </p>
              <div className="flex min-w-0 flex-col gap-2">
                <h6 className="text-xs font-medium text-muted-foreground">
                  Evidence
                </h6>
                {result?.evidence.length ? (
                  result.evidence.map((quote, quoteIndex) => (
                    <blockquote
                      key={`${quoteIndex}:${quote}`}
                      className="whitespace-pre-wrap break-words border-l-2 border-info/30 pl-3 text-xs leading-relaxed [overflow-wrap:anywhere]"
                    >
                      {quote}
                    </blockquote>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {result
                      ? "No supporting excerpts were recorded."
                      : "No assessment evidence was recorded."}
                  </p>
                )}
              </div>
              {index < criteria.length - 1 ? <Separator /> : null}
            </section>
          ))}
          {criteria.length ? <Separator /> : null}
          <section
            aria-label="Automatic checks"
            className="flex min-w-0 flex-col gap-3"
          >
            <h5 className="text-xs font-medium text-muted-foreground">
              Automatic checks
            </h5>
            <div className="flex flex-col gap-1 text-xs">
              <p className="font-medium">Response type</p>
              <p className="text-muted-foreground">
                Expected:{" "}
                {step.expectation.type === "interrupt"
                  ? "Human input requested"
                  : "Agent answer"}{" "}
                · Recorded: {observationType}
              </p>
            </div>
            <EvalOutputRequirements outputs={step.expectation.outputs} />
            <EvalAutomaticChecks
              checks={step.expectation.checks}
              results={step.checks}
            />
          </section>
        </div>
      </EvalDisclosure>
    </section>
  );
}
