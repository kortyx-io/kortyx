import type { GraphState } from "@kortyx/core";
import { throwIfExecutionAborted } from "@kortyx/core";
import type { CompleteResponseOptions } from "@kortyx/hooks";

/** Request cancellation is detachable; execution cancellation remains live. */
export function createResponseLifecycle(args: {
  enabled: boolean;
  restored: boolean;
  requestSignal?: AbortSignal | undefined;
  executionSignal?: AbortSignal | undefined;
  onClosed: () => void;
  finalize: (
    options: CompleteResponseOptions,
    state: GraphState,
  ) => Promise<void>;
}): {
  readonly closed: boolean;
  signal: AbortSignal;
  disconnect(): void;
  dispose(): void;
  complete(options: CompleteResponseOptions, state: GraphState): Promise<void>;
} {
  const controller = new AbortController();
  let closed = args.restored;
  let completing: Promise<void> | undefined;
  const abort = () => controller.abort();
  const detachRequest = () =>
    args.requestSignal?.removeEventListener("abort", abort);
  if (!closed) {
    args.requestSignal?.addEventListener("abort", abort, { once: true });
    if (args.requestSignal?.aborted) abort();
  }
  args.executionSignal?.addEventListener("abort", abort, { once: true });
  if (args.executionSignal?.aborted) abort();
  return {
    get closed() {
      return closed;
    },
    signal: controller.signal,
    disconnect() {
      if (!closed) abort();
    },
    dispose() {
      detachRequest();
      args.executionSignal?.removeEventListener("abort", abort);
    },
    complete(
      options: CompleteResponseOptions,
      state: GraphState,
    ): Promise<void> {
      if (!args.enabled || closed) return Promise.resolve();
      completing ??= (async () => {
        throwIfExecutionAborted(controller.signal);
        await args.finalize(options, state);
        throwIfExecutionAborted(controller.signal);
        closed = true;
        detachRequest();
        args.onClosed();
      })();
      return completing;
    },
  };
}
