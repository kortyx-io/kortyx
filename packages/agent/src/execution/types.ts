import type { TokenUsage, WorkflowDefinition } from "@kortyx/core";
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
        interrupt: ExecutionInterrupt;
        resume: ResumeHandle;
      }
    | { status: "cancelled"; reason: string }
    | { status: "failed"; error: { code: string; message: string } }
  );

export type ExecuteOptions<W extends ExecutableWorkflow> = {
  workflow: W;
  input: z.input<W["inputSchema"]>;
  sessionId?: string;
  context?: Record<string, unknown>;
};
export type ResumeOptions<W extends ExecutableWorkflow> = {
  workflow: W;
  resume: ResumeHandle;
  response: ResumeResponse;
};

/** The command was rejected before starting work or claiming an interrupt. */
export class ExecutionRequestError extends Error {
  override name = "ExecutionRequestError";
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
