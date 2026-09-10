/** Cancellation is control flow, represented with a standard Error and a stable code. */
export const createExecutionCancelledError = (): Error & {
  code: "EXECUTION_CANCELLED";
} =>
  Object.assign(new Error("Execution cancelled."), {
    name: "AbortError",
    code: "EXECUTION_CANCELLED" as const,
  });

export const isExecutionCancelled = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (("code" in error && error.code === "EXECUTION_CANCELLED") ||
    ("name" in error && error.name === "AbortError"));

export const throwIfExecutionAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw createExecutionCancelledError();
};

/** A local model/tool signal may restrict the root signal, never replace it. */
export const combineAbortSignals = (
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined => {
  const unique = [
    ...new Set(
      signals.filter((signal): signal is AbortSignal => signal !== undefined),
    ),
  ];
  return unique.length > 1 ? AbortSignal.any(unique) : unique[0];
};
