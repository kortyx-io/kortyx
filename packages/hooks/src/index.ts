// release-test: 2026-01-22
/**
 * @kortyx/hooks
 *
 * Internal hook implementations resolved via async-local context.
 */

export type { HookRuntimeContext } from "./context";
export { runWithHookContext } from "./context";
export type { UseReasonArgs, UseReasonResult } from "./hooks";
export {
  useAiInterrupt,
  useAiMemory,
  useEmit,
  useNodeState,
  useReason,
  useStructuredData,
  useWorkflowState,
} from "./hooks";
export type {
  RunReasonEngineArgs,
  RunReasonEngineResult,
} from "./reason-engine";
export { runReasonEngine } from "./reason-engine";
