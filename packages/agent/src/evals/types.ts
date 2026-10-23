import type { SerializedFailureDescriptor } from "@kortyx/core/errors";
import type { ProviderModelRef } from "@kortyx/providers";
import type { z } from "zod";
import type { Agent } from "../chat/create-agent";
import type { ResumeResponse } from "../execution/types";
import type { ChatMessage } from "../types/chat-message";
import type { EvalJudgeUsageSchema } from "./contracts";
import type { EVAL_EVIDENCE_EVENT_TYPES } from "./evidence-policy";

export type EvalJson =
  | null
  | boolean
  | number
  | string
  | readonly EvalJson[]
  | { readonly [key: string]: EvalJson };
export type EvalHandlerRef = { using: string; params?: EvalJson };
export type EvalCriterion = string | { id: string; text: string };
export type EvalCheck =
  | { type: "text-equals"; value: string; ignoreCase?: boolean }
  | { type: "text-contains"; value: string }
  | { type: "text-matches"; pattern: string; flags?: string }
  | { type: "tool-called"; tool: string }
  | { type: "tool-input-equals"; tool: string; input: EvalJson }
  | {
      type: "output-equals";
      schemaId: string;
      schemaVersion?: string;
      path: readonly (string | number)[];
      value: EvalJson;
    };
export type EvalCheckResult = EvalVerdict & { index: number; check: EvalCheck };
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
  checks?: readonly EvalCheck[];
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
/** Serializable selection; custom predicates are registered on createEvals. */
export type EvalEvidencePolicy = {
  history?: boolean;
  events?: false | readonly EvalEvidenceEventType[] | EvalHandlerRef;
  outputs?: false | readonly EvalOutputSelector[] | EvalHandlerRef;
};
export type EvalEvidenceEventType = (typeof EVAL_EVIDENCE_EVENT_TYPES)[number];
/** Sanitized public event. structured-data events have kind=final. */
export type EvalEvidenceEvent = {
  readonly type: EvalEvidenceEventType;
  readonly [key: string]: EvalJson;
};
/** Match every supplied field; dataType or schemaId is required at runtime. */
export type EvalOutputSelector = {
  readonly dataType?: string;
  readonly schemaId?: string;
  readonly schemaVersion?: string;
};
export type EvalEvidenceFilters = {
  events?: Record<
    string,
    (event: EvalEvidenceEvent, params?: EvalJson) => boolean
  >;
  outputs?: Record<string, (output: EvalJson, params?: EvalJson) => boolean>;
};
export type EvalJudgeEvidence = {
  version: "compact-v1";
  history: boolean;
  observation: EvalObservation;
};
export type EvalSuite<Params = EvalJson> = {
  id: string;
  name?: string;
  cases: readonly EvalCase<Params>[];
  evidence?: EvalEvidencePolicy;
  /** Portable binding. defineSuite retains its executable judge privately. */
  judge?: EvalJudgeIdentity;
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
  /** Safe terminal failure; raw exception evidence belongs in the private diagnostic. */
  failure?: SerializedFailureDescriptor;
  diagnosticId?: string;
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
  prompt?: import("./judge-prompt-contracts").EvalJudgePrompt | undefined;
  promptTemplates?: true | undefined;
  model?: { provider: string; id: string } | undefined;
  /** Exact static judge instructions, excluding per-case inputs and credentials. Optional for older/custom judges. */
  instructions?: string | undefined;
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
  | "verification"
  | "cleanup"
  | "reporting";
export type EvalIssue = {
  /** Original exception, including stack, causes and response details; only credentials are redacted. */
  exception?: import("@kortyx/telemetry-contracts").DiagnosticContent;
  phase: EvalPhase;
  code: string;
  message: string;
  failure?: SerializedFailureDescriptor;
  diagnosticId?: string;
  details?: { timeoutMs?: number; httpStatus?: number };
};
export type EvalVerdict = {
  passed: boolean;
  reason: string;
  evidence: readonly string[];
};
export type EvalCriterionResult = EvalVerdict & {
  id: string;
  text: string;
  request?: import("./judge-prompt-contracts").EvalGradingRequest;
};
export type EvalJudgeUsage = z.infer<typeof EvalJudgeUsageSchema>;
export type EvalStepResult = {
  /** Exact compact observation selected by the app; full observation remains unchanged. */
  evidence?: EvalJudgeEvidence;
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
  checks?: EvalCheckResult[];
};
export type EvalRuntimeExecution = { sessionId: string; runId: string };
export type EvalCaseResult = {
  verification?: EvalVerdict;
  phaseDurationsMs?: Partial<Record<EvalPhase, number>>;
  /** SDK-owned identity and execution associations for automatic cost attribution. */
  attemptId?: string;
  runtimeExecutions?: EvalRuntimeExecution[];
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
  /** The configured per-step budget, propagated to remote judges. */
  gradingTimeoutMs?: number;
  prompt?: import("./judge-prompt-contracts").EvalJudgePrompt | undefined;
  onRequest?: (
    request: import("./judge-prompt-contracts").EvalGradingRequest,
  ) => void;
  /** Trusted provider billing evidence, independent of the generated verdict. */
  onUsage?: (usage: EvalJudgeUsage) => void;
  criterion: { id: string; text: string };
  input: EvalStepResult["input"];
  observation: EvalObservation;
  reference?: EvalJson;
  conversation: readonly EvalStepResult[];
  signal: AbortSignal;
};
export type EvalJudge = EvalJudgeIdentity & {
  /** Safe-to-persist static instructions actually used by this judge. Do not include secrets or per-case data. */
  instructions?: string | undefined;
  id: string;
  version: string;
  location?: "app" | "studio";
  grade: (input: EvalGradeInput) => Promise<EvalVerdict> | EvalVerdict;
};
export type EvalJudgeOptions = {
  prompt?: import("./judge-prompt-contracts").EvalJudgePrompt | undefined;
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
  evidence?: EvalEvidencePolicy;
  repetitions?: number;
  concurrency?: number;
  caseTimeoutMs?: number;
  /** Time budget shared by all LLM criteria within one step. */
  gradingTimeoutMs?: number;
  /** Params/setup admission allowance, independent of the execution deadline. */
  setupTimeoutMs?: number;
  verificationTimeoutMs?: number;
  cleanupTimeoutMs?: number;
};
export type CreateEvalsOptions<
  Params = EvalJson | undefined,
  Prepared = undefined,
> = {
  agent: Pick<Agent, "streamChat" | "describePromptContracts" | "reportError">;
  /** Optional reporter for custom agents; defaults to the real agent's telemetry. */
  reportError?: Agent["reportError"];
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
  /** Assert postconditions before teardown. False is Failed; thrown infrastructure faults are Error. */
  verify?: (
    input: EvalContext<Params, NoInfer<Prepared>> & { result: EvalCaseResult },
  ) => EvalVerdict | Promise<EvalVerdict>;
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
  /** @deprecated Assign the judge in defineSuite. Removed in the next major version. */
  judge?: EvalJudge;
  evidenceFilters?: EvalEvidenceFilters;
  defaults?: EvalDefaults;
  /** Application-enforced ceilings for local and remote runs. */
  limits?: {
    concurrency?: number;
    caseTimeoutMs?: number;
    gradingTimeoutMs?: number;
  };
};
export type EvalProgress =
  | {
      type: "case-dispatch";
      caseId: string;
      repetition: number;
      status: "queued" | "retrying" | "reconnecting";
      retryAt?: string;
      httpStatus?: number;
      executionId?: string;
      generation?: string;
    }
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
      type: "case-runtime-associated";
      caseId: string;
      repetition: number;
      attemptId: string;
      execution: EvalRuntimeExecution;
    }
  | {
      type: "case-started";
      attemptId?: string;
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
  caseTimeoutMs?: number;
  /** Time budget shared by all LLM criteria within one step. */
  gradingTimeoutMs?: number;
  promptSnapshot?: import("@kortyx/prompts").PromptSnapshot;
  /** Studio captures execution without invoking the code judge. Local runs default to app. */
  grading?: "app" | "studio";
  /** Selected identity pinned by the Studio server when enqueuing a run. */
  judgeIdentity?: EvalJudgeIdentity;
  suiteId: string;
  /** Execute one scheduled attempt, preserving its original repetition identity. */
  attempt?: { caseId: string; repetition: number };
  caseIds?: readonly string[];
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (event: EvalProgress) => void | Promise<void>;
  /** Include live run totals and case phases; off for legacy progress consumers. */
  includeActivity?: boolean;
};
