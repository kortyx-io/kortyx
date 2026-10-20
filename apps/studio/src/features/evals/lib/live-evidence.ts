import type { StudioEvalLiveDetail } from "@kortyx/agent/evals";
import type { EvalDetail } from "../schema";
import { isActive } from "./presentation";

type LiveState = Omit<StudioEvalLiveDetail, "suite" | "request">;
export function needsEvalEvidence(
  detail: EvalDetail,
  state: LiveState,
  selection?: { caseId: string; repetition: number },
) {
  if (selection)
    return (
      state.cases.find(
        (c) =>
          c.caseId === selection.caseId &&
          c.repetition === selection.repetition,
      )?.evidenceVersion !== detail.caseVersion
    );
  return isActive(detail.status) && !isActive(state.status);
}
export function mergeEvalLiveState(
  detail: EvalDetail,
  state: LiveState,
): EvalDetail {
  const { cases, errors: _, version: __, ...metadata } = state;
  return {
    ...detail,
    ...metadata,
    caseCosts: Object.fromEntries(
      cases.flatMap((c) =>
        c.costs ? [[`${c.caseId}:${c.repetition}`, c.costs]] : [],
      ),
    ),
  };
}
