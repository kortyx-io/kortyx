import type { ProviderModelRef } from "@kortyx/providers";
import type { z } from "zod";
import type { Agent } from "../chat/create-agent";
import type { ResumeResponse } from "../execution/types";
import type { ChatMessage } from "../types/chat-message";

export type EvalJson =
  | null
  | boolean
  | number
  | string
  | readonly EvalJson[]
  | { readonly [key: string]: EvalJson };
export type EvalHandlerRef = { using: string; params?: EvalJson };
export type EvalCriterion = string | { id: string; text: string };
export type EvalExpectation = {
  type: "answer" | "interrupt";
  schemaId?: string;
  schemaVersion?: string;
  criteria?: readonly EvalCriterion[];
  reference?: EvalJson;
};
export type EvalStep = (
  | { message: string; resume?: never }
  | { resume: ResumeResponse | EvalHandlerRef; message?: never }
) & { expect: EvalExpectation };
export type EvalCase = {
  id: string;
  name?: string;
  params?: EvalJson;
  workflowId?: string;
  steps: readonly EvalStep[];
};
export type EvalSuite = {
  id: string;
  name?: string;
  cases: readonly EvalCase[];
};
export type EvalInterrupt = {
  requestId: string;
  kind: "text" | "choice" | "multi-choice" | "custom";
  question?: string;
  schemaId?: string;
  schemaVersion?: string;
  options: readonly { id: string; label: string; description?: string }[];
  request?: EvalJson;
};
/** Only caller-visible data. Private setup state and continuation handles are excluded. */
export type EvalObservation = {
  type: "answer" | "interrupt" | "error" | "cancelled";
  text: string;
  structured: readonly EvalJson[];
  interrupt?: EvalInterrupt;
  runId?: string;
  checkpointId?: string;
};
export type EvalCommand =
  | { type: "message"; message: string }
  | { type: "resume"; response: ResumeResponse }
  | { type: "cancel" };
/** continuation is process-private and is never copied to results or progress events. */
export type EvalExecution = {
  observation: EvalObservation;
  continuation?: unknown;
};
export type EvalStatus = "passed" | "failed" | "error" | "cancelled";
export type EvalPhase =
  | "params"
  | "setup"
  | "execute"
  | "responder"
  | "reference"
  | "grading"
  | "cleanup"
  | "reporting";
export type EvalIssue = { phase: EvalPhase; code: string; message: string };
export type EvalVerdict = {
  passed: boolean;
  reason: string;
  evidence: readonly string[];
};
export type EvalCriterionResult = EvalVerdict & { id: string; text: string };
export type EvalStepResult = {
  index: number;
  input: { message: string } | { resume: ResumeResponse };
  expectation: EvalExpectation;
  observation: EvalObservation;
  reference?: EvalJson;
  status: EvalStatus;
  reason?: string;
  criteria: EvalCriterionResult[];
};
export type EvalCaseResult = {
  caseId: string;
  repetition: number;
  sessionId: string;
  status: EvalStatus;
  durationMs: number;
  steps: EvalStepResult[];
  errors: EvalIssue[];
};
export type EvalRunResult = {
  id: string;
  suiteId: string;
  suiteRevision: string;
  suite: EvalSuite;
  judge?: { id: string; version: string };
  startedAt: string;
  durationMs: number;
  status: EvalStatus;
  counts: Record<EvalStatus, number>;
  cases: EvalCaseResult[];
  errors: EvalIssue[];
};
export type EvalGradeInput = {
  criterion: { id: string; text: string };
  input: EvalStepResult["input"];
  observation: EvalObservation;
  reference?: EvalJson;
  conversation: readonly EvalStepResult[];
  signal: AbortSignal;
};
export type EvalJudge = {
  id: string;
  version: string;
  grade: (input: EvalGradeInput) => Promise<EvalVerdict> | EvalVerdict;
};
export type EvalJudgeOptions = {
  model: ProviderModelRef;
  id?: string;
  version?: string;
};
export type EvalSetupContext<Params> = {
  suiteId: string;
  case: EvalCase;
  repetition: number;
  sessionId: string;
  params: Params;
  signal: AbortSignal;
};
export type EvalContext<Params, Prepared> = EvalSetupContext<Params> & {
  prepared: Prepared;
};
export type EvalResponder<Params, Prepared> =
  | ((
      input: EvalContext<Params, Prepared> & {
        interrupt: EvalInterrupt;
        args?: EvalJson;
      },
    ) => ResumeResponse | Promise<ResumeResponse>)
  | {
      schemaId: string;
      schemaVersion?: string;
      respond: (
        input: EvalContext<Params, Prepared> & {
          interrupt: EvalInterrupt;
          args?: EvalJson;
        },
      ) => ResumeResponse | Promise<ResumeResponse>;
    };
export type EvalDefaults = {
  repetitions?: number;
  concurrency?: number;
  caseTimeoutMs?: number;
  cleanupTimeoutMs?: number;
};
export type CreateEvalsOptions<
  Params = EvalJson | undefined,
  Prepared = undefined,
> = {
  agent: Pick<Agent, "streamChat">;
  suites: readonly EvalSuite[];
  paramsSchema?: z.ZodType<Params>;
  setup?: (input: EvalSetupContext<Params>) => Prepared | Promise<Prepared>;
  execute?: (
    input: EvalContext<Params, NoInfer<Prepared>> & {
      command: EvalCommand;
      continuation?: unknown;
      history: readonly ChatMessage[];
      run: (options?: {
        context?: Record<string, unknown>;
        messages?: ChatMessage[];
      }) => Promise<EvalExecution>;
    },
  ) => EvalExecution | Promise<EvalExecution>;
  teardown?: (
    input: EvalContext<Params, NoInfer<Prepared>> & { result: EvalCaseResult },
  ) => void | Promise<void>;
  responders?: Record<string, EvalResponder<Params, NoInfer<Prepared>>>;
  references?: Record<
    string,
    (
      input: EvalContext<Params, NoInfer<Prepared>> & {
        observation: EvalObservation;
        args?: EvalJson;
      },
    ) => EvalJson | Promise<EvalJson>
  >;
  judge?: EvalJudge;
  defaults?: EvalDefaults;
};
export type EvalProgress =
  | {
      type: "case-started";
      caseId: string;
      repetition: number;
      sessionId: string;
    }
  | {
      type: "step-completed";
      caseId: string;
      repetition: number;
      step: EvalStepResult;
    }
  | { type: "case-completed"; result: EvalCaseResult };
export type EvalRunOptions = {
  suiteId: string;
  caseIds?: readonly string[];
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (event: EvalProgress) => void | Promise<void>;
};
