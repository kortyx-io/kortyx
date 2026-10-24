"use client";

import { useEvalRun } from "../hooks/use-eval-run";
import { savedJudgeInstructions } from "../lib/judge-instructions";
import type { EvalDetail } from "../schema";
import { EvalJudgeInstructionsReader } from "./eval-judge-instructions-reader";

export function EvalSavedJudgeInstructionsReader({
  run,
  selection,
  context,
  backHref,
}: {
  run: EvalDetail;
  selection?: { caseId: string; repetition: number };
  context: string;
  backHref: string;
}) {
  const current = useEvalRun(run.id, run, 0, selection);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {current.error ? (
        <p role="alert" className="shrink-0 px-4 py-2 text-xs text-destructive">
          {current.error}
        </p>
      ) : null}
      <EvalJudgeInstructionsReader
        {...savedJudgeInstructions(current.detail ?? run, selection)}
        context={context}
        historical
        backHref={backHref}
      />
    </div>
  );
}
