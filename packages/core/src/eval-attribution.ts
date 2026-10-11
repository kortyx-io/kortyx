import { AsyncLocalStorage } from "node:async_hooks";

/** Internal, process-local attribution. Never changes runtime session identity. */
export type EvalRuntimeExecution = { sessionId: string; runId: string };
type Attribution = {
  attemptId: string;
  onExecution: (execution: EvalRuntimeExecution) => void;
};
const attribution = new AsyncLocalStorage<Attribution | undefined>();
export const withEvalAttribution = <T>(
  scope: Attribution | undefined,
  run: () => T,
): T => attribution.run(scope, run);
export const getEvalAttemptId = (): string | undefined =>
  attribution.getStore()?.attemptId;
export const associateEvalExecution = (
  execution: EvalRuntimeExecution,
): void => {
  attribution.getStore()?.onExecution(execution);
};
