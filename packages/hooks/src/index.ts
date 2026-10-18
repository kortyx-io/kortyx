// release-test: 2026-01-22
/**
 * @kortyx/hooks
 *
 * Internal hook implementations resolved via async-local context.
 */

export {
  type CompleteResponseOptions,
  completeResponse,
} from "./complete-response";
export type { HookRuntimeContext } from "./context";
export { runWithHookContext } from "./context";
export type {
  InterruptContract,
  InterruptContractMap,
  InterruptHistoryEntry,
  OutputContract,
  OutputContractEntry,
  OutputContractMap,
  UseContractInterruptArgs,
  UseContractStructuredDataArgs,
  UseInterruptArgs,
  UseReasonArgs,
  UseReasonInterruptConfig,
  UseReasonInterruptsConfig,
  UseReasonOutputsConfig,
  UseReasonResult,
  UseReasonStep,
  UseReasonToolExecution,
  UseStructuredDataArgs,
} from "./hooks";
export {
  defineInterruptContract,
  defineOutputContract,
  useAbortSignal,
  useInterrupt,
  useNodeState,
  useReason,
  useRuntimeContext,
  useStructuredData,
  useWorkflowState,
} from "./hooks";
export { ParallelError, parallel } from "./parallel";
export type { UseReasonPromptArgs } from "./reason/prompt";
export { reportError } from "./report-error";
export type { UseToolArgs } from "./tool";
export { useTool } from "./tool";
export type {
  EnsureWorkflowTopologyRequest,
  EnsureWorkflowTopologyResponse,
  KortyxErrorDetails,
  KortyxTelemetryConfig,
  KortyxTelemetryContentCapture,
  KortyxTelemetryCorrelation,
  KortyxTelemetryEvent,
  KortyxTelemetryEventType,
  KortyxTelemetryPrompt,
  KortyxTelemetryReporter,
  KortyxTelemetryService,
  KortyxTraceAdapter,
  KortyxTraceErrorProjection,
  KortyxTraceMetadata,
  ReasonTraceAdapter,
  ReasonTraceAttributes,
  ReasonTraceSpan,
  ReasonTraceSpanEndArgs,
  ReasonTraceSpanStartArgs,
  ReportErrorOptions,
} from "./tracing";
export { usePrompt } from "./use-prompt";
export type { WorkflowCallOutcome, WorkflowCallService } from "./workflow";
export {
  createWorkflowHooks,
  useWorkflow,
  WorkflowCallError,
  workflowCallFingerprint,
} from "./workflow";
export { emitWorkflowCall } from "./workflow-telemetry";
