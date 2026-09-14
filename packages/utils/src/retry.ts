import { isControlFlowError } from "@kortyx/core/errors";
export type RetryOptions = {
  abortSignal?: AbortSignal;
  /** Total attempts including the first try. Must be >= 1. */
  retries: number;
  /** Delay between attempts in ms or a function of the current attempt (1-based). */
  delayMs?: number | ((attempt: number) => number);
  /** Optional predicate to decide whether to retry based on the error. Defaults to always retry until attempts exhausted. */
  retryOn?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  /** Optional callback on retry to log/emit metrics, etc. */
  onRetry?: (error: unknown, attempt: number) => void | Promise<void>;
};

const toError = (err: unknown) =>
  err instanceof Error ? err : new Error(String(err));

/**
 * Runs an async function with retry semantics.
 * The function receives the 1-based attempt number on each call.
 */
export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const total = Math.max(1, Math.floor(options.retries));
  const retryOn = options.retryOn ?? (async () => true);
  let attempt = 1;

  while (true) {
    options.abortSignal?.throwIfAborted();
    try {
      return await fn(attempt);
    } catch (err) {
      options.abortSignal?.throwIfAborted();
      if (isControlFlowError(err)) throw err;
      const error = toError(err);
      const hasNext = attempt < total;
      const shouldRetry = hasNext && (await retryOn(error, attempt));

      if (!shouldRetry) throw error;

      // Notify caller we're retrying
      await options.onRetry?.(error, attempt);

      // Wait before next attempt (fixed or function-based)
      const delay =
        typeof options.delayMs === "function"
          ? options.delayMs(attempt)
          : (options.delayMs ?? 0);
      await new Promise<void>((resolve, reject) => {
        const signal = options.abortSignal;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const aborted = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(
          () => {
            signal?.removeEventListener("abort", aborted);
            resolve();
          },
          Math.max(0, delay),
        );
        signal?.addEventListener("abort", aborted, { once: true });
      });
      attempt++;
    }
  }
}

// Convenience helpers
export const fixedDelay = (ms: number) => (_attempt: number) => Math.max(0, ms);
export const exponentialBackoff =
  (baseMs = 100, factor = 2, maxMs = 2000) =>
  (attempt: number) =>
    Math.min(maxMs, Math.floor(baseMs * factor ** Math.max(0, attempt - 1)));
