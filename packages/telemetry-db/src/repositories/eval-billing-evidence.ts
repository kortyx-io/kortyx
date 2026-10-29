import type { EvalCaseResult } from "@kortyx/agent/evals";

type Identity = {
  attemptId?: string | undefined;
  sessionId?: string | undefined;
  runtimeExecutions?: EvalCaseResult["runtimeExecutions"] | undefined;
};

/** Terminal error records can omit associations already recorded in progress.
 * Never transfer them to a different attempt, even when it reuses a session. */
export function mergeEvalRuntimeExecutions(previous: Identity, next: Identity) {
  const sameAttempt = sameEvalBillingAttempt(previous, next);
  return [
    ...new Map(
      [
        ...(sameAttempt ? (previous.runtimeExecutions ?? []) : []),
        ...(next.runtimeExecutions ?? []),
      ].map((execution) => [
        JSON.stringify([execution.sessionId, execution.runId]),
        execution,
      ]),
    ).values(),
  ];
}

export function sameEvalBillingAttempt(previous: Identity, next: Identity) {
  return next.attemptId
    ? next.attemptId === previous.attemptId
    : !previous.attemptId &&
        Boolean(next.sessionId) &&
        next.sessionId === previous.sessionId;
}

/** Step billing snapshots are cumulative. Keep the fullest recorded usage,
 * without adding overlapping progress/final snapshots as separate charges. */
export function mergeEvalBillingSteps<
  T extends {
    index: number;
    judgeCalls?: number | undefined;
    judgeUsage?: EvalCaseResult["steps"][number]["judgeUsage"] | undefined;
  },
>(previous: T[], next: T[]): T[] {
  const steps = new Map(previous.map((step) => [step.index, step]));
  for (const step of next) {
    const prior = steps.get(step.index);
    const judgeCalls =
      prior?.judgeCalls === undefined && step.judgeCalls === undefined
        ? undefined
        : Math.max(prior?.judgeCalls ?? 0, step.judgeCalls ?? 0);
    const judgeUsage =
      (prior?.judgeUsage?.length ?? 0) > (step.judgeUsage?.length ?? 0)
        ? prior?.judgeUsage
        : step.judgeUsage;
    steps.set(
      step.index,
      prior
        ? {
            ...step,
            ...(judgeCalls !== undefined ? { judgeCalls } : {}),
            ...(judgeUsage !== undefined ? { judgeUsage } : {}),
          }
        : step,
    );
  }
  return [...steps.values()];
}
