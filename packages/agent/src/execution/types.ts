import type {
  ExecutionLimitReached,
  ExecutionLimits,
  TokenUsage,
  WorkflowDefinition,
} from "@kortyx/core";
import { type FailureDescriptor, KortyxError } from "@kortyx/core/errors";
import type { PendingRequestRecord } from "@kortyx/runtime";
import type { z } from "zod";

export type ExecutableWorkflow = WorkflowDefinition & {
  inputSchema: z.ZodType;
  outputSchema: z.ZodType<Record<string, unknown>>;
};

/** Serializable identity of a waiting request. Treat tokens as private credentials. */
export type ResumeHandle = {
  token: string;
  requestId: string;
  sessionId: string;
  runId: string;
};

export type ResumeResponse =
  | { type: "text"; text: string }
  | { type: "select"; ids: string[] }
  | { type: "value"; value: unknown }
  | { type: "cancel" };

export type ExecutionInterrupt = {
  workflow: string;
  node: string;
  input: PendingRequestRecord["schema"] & {
    options: Array<{
      id: string;
      label: string;
      description?: string | undefined;
    }>;
  };
};

export type ExecutionInfo = {
  runId: string;
  sessionId: string;
  checkpointId?: string;
  usage?: TokenUsage;
};

export type ExecutionResult<T = Record<string, unknown>> = ExecutionInfo &
  (
    | { status: "completed"; data: T }
    | {
        status: "suspended";
        reason?: "limit_reached";
        limit?: ExecutionLimitReached;
        interrupt: ExecutionInterrupt;
        resume: ResumeHandle;
      }
    | { status: "cancelled"; reason: string }
    | {
        status: "failed";
        error: Pick<FailureDescriptor, "code" | "message"> &
          Partial<FailureDescriptor>;
      }
  );

export type ExecuteOptions<W extends ExecutableWorkflow> = {
  limits?: ExecutionLimits;
  abortSignal?: AbortSignal;
  workflow: W;
  input: z.input<W["inputSchema"]>;
  sessionId?: string;
  context?: Record<string, unknown>;
};
export type ResumeOptions<W extends ExecutableWorkflow> = {
  limits?: ExecutionLimits;
  abortSignal?: AbortSignal;
  workflow: W;
  resume: ResumeHandle;
  response: ResumeResponse;
};

/** The command was rejected before starting work or claiming an interrupt. */
export class ExecutionRequestError extends KortyxError {
  override name = "ExecutionRequestError";
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, {
      category: "request",
      retryable: false,
      safeMessage:
        "The execution request is invalid. Check the workflow contract and request fields.",
      cause,
    });
  }
}
