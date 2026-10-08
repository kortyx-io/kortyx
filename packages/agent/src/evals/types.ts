import type { ProviderModelRef } from "@kortyx/providers";
import type { z } from "zod";
import type { Agent } from "../chat/create-agent";
import type { ResumeResponse } from "../execution/types";
import type { ChatMessage } from "../types/chat-message";
import type { EvalJudgeUsageSchema } from "./contracts";

export type EvalJson =
  | null
  | boolean
  | number
  | string
  | readonly EvalJson[]
  | { readonly [key: string]: EvalJson };
export type EvalHandlerRef = { using: string; params?: EvalJson };
export type EvalCriterion = string | { id: string; text: string };
export type EvalOutputExpectation = {
  schemaId: string;
  schemaVersion?: string;
};
export type EvalExpectation = {
  type: "answer" | "interrupt";
  schemaId?: string;
  schemaVersion?: string;
  /** Required completed structured output contracts in this step; other outputs are allowed. */
  outputs?: readonly EvalOutputExpectation[];
  criteria?: readonly EvalCriterion[];
  reference?: EvalJson;
};
export type EvalStep = (
  | { message: string; resume?: never }
  | { resume: ResumeResponse | EvalHandlerRef; message?: never }
) & { expect: EvalExpectation };
export type EvalCase<Params = EvalJson> = {
  id: string;
  name?: string;
  params?: Params;
  workflowId?: string;
  steps: readonly EvalStep[];
};
export type EvalSuite<Params = EvalJson> = {
  id: string;
  name?: string;
  cases: readonly EvalCase<Params>[];
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
/** Public output and emitted execution evidence; private runtime state is excluded. */
export type EvalObservation = {
  promptUsage?: import("@kortyx/prompts").PromptUsageReceipt[];
  type: "answer" | "interrupt" | "error" | "cancelled";
  text: string;
  structured: readonly EvalJson[];
  /** Ordered public stream events. Adjacent text deltas from the same source are joined. */
  events?: readonly EvalJson[];
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
/** Execution can finish before Studio has evaluated its semantic criteria. */
export type EvalExecutionStatus = EvalStatus | "ungraded";
export type EvalJudgeIdentity = {
  id: string;
  version: string;
  location?: "app" | "studio" | undefined;
};
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
export type EvalJudgeUsage = z.infer<typeof EvalJudgeUsageSchema>;
export type EvalStepResult = {
  judgeCalls?: number;
  judgeUsage?: EvalJudgeUsage[];
  index: number;
  input: { message: string } | { resume: ResumeResponse };
  expectation: EvalExpectation;
  observation: EvalObservation;
  reference?: EvalJson;
  status: EvalExecutionStatus;
  reason?: string;
  criteria: EvalCriterionResult[];
};
export type EvalCaseResult = {
  caseId: string;
  repetition: number;
  sessionId: string;
  status: EvalExecutionStatus;
  durationMs: number;
  steps: EvalStepResult[];
  errors: EvalIssue[];
};
export type EvalRunResult = {
  id: string;
  suiteId: string;
  suiteRevision: string;
  suite: EvalSuite;
  judge?: EvalJudgeIdentity;
  startedAt: string;
  durationMs: number;
  status: EvalExecutionStatus;
  counts: Record<EvalStatus, number> & { ungraded?: number };
  cases: EvalCaseResult[];
  errors: EvalIssue[];
};
export type EvalGradeInput = {
  /** Trusted provider billing evidence, independent of the generated verdict. */
  onUsage?: (usage: EvalJudgeUsage) => void;
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
  location?: "app" | "studio";
  grade: (input: EvalGradeInput) => Promise<EvalVerdict> | EvalVerdict;
};
export type EvalJudgeOptions = {
  model: ProviderModelRef;
  id?: string;
  version?: string;
};
export type StudioEvalJudgeOptions = {
  /** Studio API origin, not the browser Studio URL. */
  url: string;
  apiKey: string;
  environment: string;
  allowInsecureHttp?: boolean;
  /** Optional deadline for initial judge discovery. */
  signal?: AbortSignal;
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
  agent: Pick<Agent, "streamChat" | "describePromptContracts">;
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
      type: "run-started";
      caseIds: string[];
      repetitions: number;
      concurrency: number;
    }
  | {
      type: "case-progress";
      caseId: string;
      repetition: number;
      phase: EvalPhase;
      stepIndex?: number;
    }
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
  promptSnapshot?: import("@kortyx/prompts").PromptSnapshot;
  /** Studio captures execution without invoking the code judge. Local runs default to app. */
  grading?: "app" | "studio";
  /** Selected identity pinned by the Studio server when enqueuing a run. */
  judgeIdentity?: EvalJudgeIdentity;
  suiteId: string;
  caseIds?: readonly string[];
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (event: EvalProgress) => void | Promise<void>;
  /** Include live run totals and case phases; off for legacy progress consumers. */
  includeActivity?: boolean;
};
