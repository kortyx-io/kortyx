import type { EvalGradingRequest, EvalStepResult } from "@kortyx/agent/evals";
import type { EvalDetail } from "../schema";
import { isActive } from "./presentation";

export type RecordedJudgeRequest = {
  key: string;
  caseId: string;
  repetition: number;
  stepIndex: number;
  criterionId: string;
  criterion: string;
  request: EvalGradingRequest;
};

/** Only persisted execution evidence establishes what a historical judge saw. */
export function savedJudgeInstructions(
  run: EvalDetail,
  selection?: { caseId: string; repetition: number },
) {
  const judge = run.result?.judge;
  const hasSnapshot = Boolean(judge?.prompt || judge?.instructions);
  const requests = new Map<string, RecordedJudgeRequest>();
  const collect = (
    caseId: string,
    repetition: number,
    step: EvalStepResult,
  ) => {
    if (
      selection &&
      (selection.caseId !== caseId || selection.repetition !== repetition)
    )
      return;
    for (const criterion of step.criteria) {
      if (!criterion.request) continue;
      const key = JSON.stringify([
        caseId,
        repetition,
        step.index,
        criterion.id,
      ]);
      requests.set(key, {
        key,
        caseId,
        repetition,
        stepIndex: step.index,
        criterionId: criterion.id,
        criterion: criterion.text,
        request: criterion.request,
      });
    }
  };
  if (!hasSnapshot) {
    for (const { event } of run.events) {
      if (event.type === "step-completed")
        collect(event.caseId, event.repetition, event.step);
      else if (event.type === "case-completed")
        for (const step of event.result.steps)
          collect(event.result.caseId, event.result.repetition, step);
    }
    // Final results take precedence over earlier progress copies of the same call.
    for (const item of run.result?.cases ?? [])
      for (const step of item.steps)
        collect(item.caseId, item.repetition, step);
  }
  return {
    judge: judge ?? undefined,
    recordedRequests: [...requests.values()],
    snapshotPending: !hasSnapshot && isActive(run.status),
  };
}

export function judgeInstructionsDescription(historical: boolean) {
  return historical
    ? "Saved instructions for assessing each step’s criterion against selected evidence. Assessment details → Grading request shows the recorded messages when available."
    : "Reusable instructions for assessing each step’s criterion against selected evidence. Highlighted variables are filled for each grading call. The judge model can be changed when launching a run.";
}
