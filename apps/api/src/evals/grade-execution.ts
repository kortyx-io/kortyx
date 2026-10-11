import type {
  EvalJudge,
  EvalProgress,
  EvalRunResult,
  EvalVerdict,
} from "@kortyx/agent/evals";
import { EvalVerdictSchema, getEvalGradeEvidence } from "@kortyx/agent/evals";

// Custom judges receive the abort signal, but the worker also stops waiting if
// their implementation ignores it. Late completion is consumed and discarded.
function awaitVerdict(
  run: () => Promise<EvalVerdict> | EvalVerdict,
  signal: AbortSignal,
): Promise<EvalVerdict> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return run();
      })
      .then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    if (signal.aborted) abort();
  });
}

/** Grade captured public evidence without executing any application code again. */
export async function gradeEvalExecution(
  execution: EvalRunResult,
  judge: EvalJudge,
  signal: AbortSignal,
  onProgress: (event: EvalProgress) => Promise<void>,
): Promise<EvalRunResult> {
  const started = Date.now();
  const result = structuredClone(execution);
  result.judge = { id: judge.id, version: judge.version, location: "studio" };
  for (const item of result.cases) {
    const caseStarted = Date.now();
    for (const step of item.steps) {
      if (step.status !== "ungraded") continue;
      signal.throwIfAborted();
      try {
        const deadline = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
        for (const [index, value] of (
          step.expectation.criteria ?? []
        ).entries()) {
          deadline.throwIfAborted();
          const criterion =
            typeof value === "string"
              ? { id: String(index), text: value }
              : value;
          step.judgeCalls = (step.judgeCalls ?? 0) + 1;
          const verdict = EvalVerdictSchema.parse(
            await awaitVerdict(
              () =>
                judge.grade({
                  criterion,
                  onUsage: (usage) => {
                    if (!deadline.aborted) {
                      step.judgeUsage ??= [];
                      step.judgeUsage.push(structuredClone(usage));
                    }
                  },
                  input: structuredClone(step.input),
                  ...getEvalGradeEvidence(
                    step,
                    item.steps.filter((prior) => prior.index < step.index),
                  ),
                  ...(step.reference !== undefined
                    ? { reference: structuredClone(step.reference) }
                    : {}),
                  signal: deadline,
                }),
              deadline,
            ),
          );
          deadline.throwIfAborted();
          step.criteria.push({ ...criterion, ...verdict });
        }
        step.status = step.criteria.some((criterion) => !criterion.passed)
          ? "failed"
          : "passed";
      } catch {
        signal.throwIfAborted();
        step.status = "error";
        step.reason = "Studio grading failed or returned an invalid verdict.";
        item.errors.push({
          phase: "grading",
          code: "EVAL_GRADING_FAILED",
          message: step.reason,
        });
      }
      await onProgress({
        type: "step-completed",
        caseId: item.caseId,
        repetition: item.repetition,
        step,
      });
    }
    if (
      item.errors.length ||
      item.steps.some((step) => step.status === "error")
    )
      item.status = "error";
    else if (item.status === "cancelled") item.status = "cancelled";
    else if (
      item.status === "failed" ||
      item.steps.some((step) => step.status === "failed")
    )
      item.status = "failed";
    else item.status = "passed";
    item.durationMs += Date.now() - caseStarted;
    await onProgress({ type: "case-completed", result: item });
  }
  result.counts = { passed: 0, failed: 0, error: 0, cancelled: 0 };
  for (const item of result.cases) {
    if (item.status === "ungraded")
      throw new Error("Incomplete Studio grading.");
    result.counts[item.status]++;
  }
  result.status =
    result.errors.length || result.counts.error
      ? "error"
      : result.counts.cancelled
        ? "cancelled"
        : result.counts.failed
          ? "failed"
          : "passed";
  result.durationMs += Date.now() - started;
  return result;
}
