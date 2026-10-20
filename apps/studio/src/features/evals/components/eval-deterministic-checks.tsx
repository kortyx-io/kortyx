import type { EvalCheck, EvalCheckResult } from "@kortyx/agent/evals";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { studioHelp } from "@/lib/studio-help";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalPayloadViewer } from "./eval-payload-viewer";
import { EvalStatus } from "./eval-status";

function label(check: EvalCheck): string {
  switch (check.type) {
    case "text-equals":
      return `Answer equals ${JSON.stringify(check.value)}${check.ignoreCase ? " (ignoring case)" : ""}`;
    case "text-contains":
      return `Answer contains ${JSON.stringify(check.value)}`;
    case "text-matches":
      return `Answer matches /${check.pattern}/${check.flags ?? ""}`;
    case "tool-called":
      return `Observed tool call: ${check.tool}`;
    case "tool-input-equals":
      return `Observed tool input equals the expected value: ${check.tool}`;
    case "output-equals":
      return `${check.schemaId}${check.schemaVersion ? ` v${check.schemaVersion}` : ""}: data${check.path.map((part) => `[${JSON.stringify(part)}]`).join("")} equals ${JSON.stringify(check.value)}`;
  }
}

export function EvalDeterministicChecks({
  checks,
  results,
  scope,
}: {
  checks?: readonly EvalCheck[];
  results?: readonly EvalCheckResult[];
  scope: string;
}) {
  if (!checks?.length) return null;
  return (
    <section
      data-guide-focus="eval-checks"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-center gap-1">
        <p className="text-xs font-medium text-muted-foreground">
          Deterministic checks
        </p>
        <HelpCircle help={studioHelp.evalChecks} />
      </div>
      {checks.map((check, index) => {
        const result = results?.find((item) => item.index === index);
        return (
          <div
            key={`${scope}:${index}:${check.type}`}
            className="flex min-w-0 flex-col gap-2 border-t pt-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-words text-sm [overflow-wrap:anywhere]">
                {label(check)}
              </p>
              {results ? (
                result ? (
                  <EvalStatus status={result.passed ? "passed" : "failed"} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Not assessed
                  </span>
                )
              ) : null}
            </div>
            {result ? (
              <p className="text-xs text-muted-foreground">{result.reason}</p>
            ) : null}
            <EvalDisclosure
              scope={`${scope}-check-${index}`}
              label="Check definition and evidence"
            >
              <EvalPayloadViewer
                scope={`${scope}-check-${index}-payload`}
                value={{
                  check,
                  ...(result ? { evidence: result.evidence } : {}),
                }}
              />
            </EvalDisclosure>
          </div>
        );
      })}
    </section>
  );
}
