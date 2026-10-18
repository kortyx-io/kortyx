export type EvaluationState =
  | "running"
  | "draining"
  | "drained"
  | "aborting"
  | "aborted"
  | "failed";

/** HTTP retirement and evaluation retirement have independent lifetimes. */
export function createApiLifecycle(options: {
  worker?: { drain(): Promise<void>; stop(): Promise<void> } | undefined;
  markNotReady(): void;
  drainHttp(): Promise<void>;
  closeResources(): Promise<void>;
  onEvaluationState?(state: EvaluationState): void;
}) {
  let state: EvaluationState = "running";
  let draining: Promise<void> | undefined;
  let terminating: Promise<void> | undefined;
  let aborting: Promise<void> | undefined;
  let http: Promise<{ error?: unknown }> | undefined;
  let resources: Promise<void> | undefined;
  const setState = (next: EvaluationState) => {
    state = next;
    try {
      options.onEvaluationState?.(next);
    } catch {
      // Optional diagnostics cannot change execution or retirement.
    }
  };
  const drainEvaluations = () => {
    if (aborting) return aborting;
    draining ??= (async () => {
      if (aborting) return;
      setState("draining");
      try {
        await options.worker?.drain();
        if (!aborting) setState("drained");
      } catch (error) {
        if (!aborting) setState("failed");
        throw error;
      }
    })();
    return draining;
  };
  const beginHttpDrain = () => {
    if (!http) {
      options.markNotReady();
      // Observe errors immediately, even if evaluations take hours to finish.
      http = Promise.resolve()
        .then(options.drainHttp)
        .then(
          () => ({}),
          (error: unknown) => ({ error }),
        );
    }
    return http;
  };
  const finish = async () => {
    const result = await beginHttpDrain();
    resources ??= options.closeResources();
    await resources;
    if ("error" in result) throw result.error;
  };
  return {
    evaluationState: () => state,
    // Preparation leaves HTTP available for submissions, progress and cancel.
    drainEvaluations,
    terminate() {
      if (aborting) return aborting;
      terminating ??= (async () => {
        beginHttpDrain();
        try {
          await drainEvaluations();
        } catch (error) {
          if (!aborting) throw error;
        }
        if (aborting) return aborting;
        // A rejected drain preserves dependencies and never reports success.
        await finish();
      })();
      return terminating;
    },
    abort() {
      aborting ??= (async () => {
        beginHttpDrain();
        setState("aborting");
        await options.worker?.stop();
        setState("aborted");
        await finish();
      })();
      return aborting;
    },
  };
}

/** Repeated signals stay handled; only SIGINT explicitly aborts active work. */
export function registerApiSignals(
  signals: {
    on(signal: "SIGTERM" | "SIGINT" | "SIGUSR2", handler: () => void): unknown;
  },
  lifecycle: Pick<
    ReturnType<typeof createApiLifecycle>,
    "terminate" | "abort" | "drainEvaluations"
  >,
  failed: () => void,
) {
  signals.on("SIGTERM", () => void lifecycle.terminate().catch(failed));
  signals.on("SIGINT", () => void lifecycle.abort().catch(failed));
  signals.on("SIGUSR2", () => void lifecycle.drainEvaluations().catch(failed));
}
