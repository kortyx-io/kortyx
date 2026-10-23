export const DEFAULT_EVAL_GRADING_TIMEOUT_MS = 60_000;

/** Own data properties keep timeout diagnostics readable without invoking getters. */
export class EvalGradingTimeoutError extends Error {
  readonly code = "EVAL_GRADING_TIMEOUT";
  constructor(readonly timeoutMs: number) {
    super(
      `Grading exceeded its configured ${timeoutMs / 1000}-second time limit.`,
    );
    this.name = "EvalGradingTimeoutError";
  }
}

/** Enforce the whole step's budget even when a custom judge ignores cancellation. */
export async function withEvalGradingTimeout<T>(
  run: (signal: AbortSignal) => T | Promise<T>,
  parent: AbortSignal,
  timeoutMs = DEFAULT_EVAL_GRADING_TIMEOUT_MS,
): Promise<T> {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  )
    throw new RangeError(
      "gradingTimeoutMs must be a positive integer within the supported timer range.",
    );
  parent.throwIfAborted();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new EvalGradingTimeoutError(timeoutMs)),
    timeoutMs,
  );
  const signal = AbortSignal.any([parent, controller.signal]);
  let abort: () => void = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve()
        .then(() => {
          signal.throwIfAborted();
          return run(signal);
        })
        .then((value) => {
          if (signal.aborted) reject(signal.reason);
          else resolve(value);
        }, reject);
      if (signal.aborted) abort();
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
