import { randomUUID } from "node:crypto";
import { withEvalAttribution } from "@kortyx/core/eval-attribution";
import { classifyUsageError, scale } from "@kortyx/usage-telemetry";
import { z } from "zod";
import type { ResumeResponse } from "../execution/types";
import type { ChatMessage } from "../types/chat-message";
import { usage } from "../usage";
import { evaluateChecks } from "./checks";
import {
  EvalConfigurationError,
  EvalObservationSchema,
  EvalResumeResponseSchema,
  EvalVerdictSchema,
  parseEvalSuite,
} from "./contracts";
import { judgeIdentity, suiteJudge } from "./define-suite";
import { createEvalIssue } from "./errors";
import {
  createEvalJudgeEvidence,
  getEvalGradeEvidence,
  validateEvidenceFilters,
} from "./evidence";
import { EvalEvidencePolicySchema } from "./evidence-policy";
import {
  DEFAULT_EVAL_GRADING_TIMEOUT_MS,
  withEvalGradingTimeout,
} from "./grading-timeout";
import { validateJudgePrompt } from "./judge-prompt";
import type { EvalGradingRequest } from "./judge-prompt-contracts";
import { sameJudgePrompt } from "./judge-prompt-contracts";
import { missingOutputReason } from "./output-expectations";
import { getEvalSuiteRevision } from "./revision";
import { executeEvalChat } from "./stream";
import type {
  CreateEvalsOptions,
  EvalCase,
  EvalCaseResult,
  EvalCommand,
  EvalContext,
  EvalEvidencePolicy,
  EvalExecution,
  EvalExecutionStatus,
  EvalHandlerRef,
  EvalInterrupt,
  EvalIssue,
  EvalJson,
  EvalPhase,
  EvalProgress,
  EvalRunOptions,
  EvalRunResult,
  EvalRuntimeExecution,
  EvalStepResult,
  EvalSuite,
} from "./types";

let legacyJudgeWarningEmitted = false;
function warnLegacyJudge(): void {
  if (legacyJudgeWarningEmitted) return;
  legacyJudgeWarningEmitted = true;
  process.emitWarning(
    "createEvals({ judge }) is deprecated and will be removed in the next major version. Import the judge into defineSuite({ judge }) instead. See docs/internal/next-major-removals.md.",
    {
      code: "KORTYX_EVAL_APPLICATION_JUDGE_DEPRECATED",
      type: "DeprecationWarning",
    },
  );
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const positive = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new EvalConfigurationError(
      `${label} must be a positive safe integer.`,
    );
  return value;
};
const handlerRef = (value: unknown): value is EvalHandlerRef =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as { using?: unknown }).using === "string" &&
  Object.keys(value).every((key) => key === "using" || key === "params");
const statusFor = (
  counts: EvalRunResult["counts"],
  errors: readonly EvalIssue[],
): EvalExecutionStatus =>
  errors.length || counts.error
    ? "error"
    : counts.cancelled
      ? "cancelled"
      : counts.failed
        ? "failed"
        : counts.ungraded
          ? "ungraded"
          : "passed";

/** Run serializable conversations against the same agent used by the application. */
export function createEvals<
  Params = EvalJson | undefined,
  Prepared = undefined,
>(options: CreateEvalsOptions<Params, Prepared>) {
  if (options.judge) warnLegacyJudge();
  const defaultEvidence = EvalEvidencePolicySchema.parse(
    options.defaults?.evidence ?? {},
  ) as EvalEvidencePolicy;
  const evidenceFilters = {
    events: { ...options.evidenceFilters?.events },
    outputs: { ...options.evidenceFilters?.outputs },
  };
  validateEvidenceFilters(defaultEvidence, evidenceFilters);
  const appJudges = new Map(
    options.suites.map((suite) => [
      suite.id,
      suiteJudge(suite) ?? options.judge,
    ]),
  );
  const suites = options.suites.map((suite) => {
    const parsed = parseEvalSuite(suite);
    if (parsed.judge?.prompt) validateJudgePrompt(parsed.judge.prompt);
    const bound = appJudges.get(suite.id);
    if (bound?.prompt && !bound.promptTemplates)
      throw new EvalConfigurationError(
        "The suite judge does not support prompt templates.",
      );
    if (bound && (!bound.id.trim() || !bound.version.trim()))
      throw new EvalConfigurationError("A judge needs an ID and version.");
    const evidence = { ...defaultEvidence, ...parsed.evidence };
    validateEvidenceFilters(evidence, evidenceFilters);
    return freeze(
      parseEvalSuite({
        ...parsed,
        ...(Object.keys(evidence).length ? { evidence } : {}),
      }),
    );
  });
  if (
    !suites.length ||
    new Set(suites.map((suite) => suite.id)).size !== suites.length
  )
    throw new EvalConfigurationError(
      "At least one suite is required, with unique suite IDs.",
    );
  const responders = { ...options.responders };
  const references = { ...options.references };
  const registered = (registry: object, name: string) =>
    Object.hasOwn(registry, name);
  for (const suite of suites)
    for (const item of suite.cases)
      for (const step of item.steps) {
        if (
          handlerRef(step.resume) &&
          !registered(responders, step.resume.using)
        )
          throw new EvalConfigurationError(
            `Unknown responder: ${step.resume.using}`,
          );
        if (
          handlerRef(step.expect.reference) &&
          !registered(references, step.expect.reference.using)
        )
          throw new EvalConfigurationError(
            `Unknown reference: ${step.expect.reference.using}`,
          );
      }
  if (
    options.judge &&
    (!options.judge.id.trim() || !options.judge.version.trim())
  )
    throw new EvalConfigurationError("A judge needs an ID and version.");
  const defaults = {
    repetitions: positive(options.defaults?.repetitions ?? 1, "repetitions"),
    concurrency: positive(options.defaults?.concurrency ?? 1, "concurrency"),
    caseTimeoutMs: positive(
      options.defaults?.caseTimeoutMs ?? 60_000,
      "caseTimeoutMs",
    ),
    gradingTimeoutMs: positive(
      options.defaults?.gradingTimeoutMs ?? DEFAULT_EVAL_GRADING_TIMEOUT_MS,
      "gradingTimeoutMs",
    ),
    setupTimeoutMs: positive(
      options.defaults?.setupTimeoutMs ??
        options.defaults?.caseTimeoutMs ??
        60_000,
      "setupTimeoutMs",
    ),
    verificationTimeoutMs: positive(
      options.defaults?.verificationTimeoutMs ??
        options.defaults?.caseTimeoutMs ??
        60_000,
      "verificationTimeoutMs",
    ),
    cleanupTimeoutMs: positive(
      options.defaults?.cleanupTimeoutMs ?? 10_000,
      "cleanupTimeoutMs",
    ),
  };

  const reportError =
    options.reportError ?? options.agent.reportError?.bind(options.agent);
  const issueFor = (
    phase: EvalPhase,
    error: unknown,
    correlation?: Parameters<NonNullable<typeof reportError>>[1],
    code?: string,
  ) =>
    createEvalIssue(phase, error, {
      reportError,
      correlation,
      ...(code ? { code } : {}),
    });
  for (const key of [
    "concurrency",
    "caseTimeoutMs",
    "gradingTimeoutMs",
  ] as const) {
    const max = options.limits?.[key];
    if (max !== undefined && defaults[key] > positive(max, `limits.${key}`))
      throw new EvalConfigurationError(
        `${key} default exceeds its application limit.`,
      );
  }
  if (defaults.gradingTimeoutMs > 2_147_483_647)
    throw new EvalConfigurationError(
      "gradingTimeoutMs exceeds the supported timer range.",
    );
  return {
    listSuites(): EvalSuite[] {
      return clone(suites);
    },
    describe() {
      return {
        execution: {
          defaults: {
            ...(options.defaults?.repetitions !== undefined
              ? { repetitions: options.defaults.repetitions }
              : {}),
            ...(options.defaults?.concurrency !== undefined
              ? { concurrency: options.defaults.concurrency }
              : {}),
            ...(options.defaults?.gradingTimeoutMs !== undefined
              ? { gradingTimeoutMs: options.defaults.gradingTimeoutMs }
              : {}),
            ...(options.defaults?.caseTimeoutMs !== undefined
              ? { caseTimeoutMs: options.defaults.caseTimeoutMs }
              : {}),
          },
          limits: options.limits ?? {},
          overrides: [
            "repetitions",
            "concurrency",
            "caseTimeoutMs",
            "gradingTimeoutMs",
          ] as (
            | "repetitions"
            | "concurrency"
            | "caseTimeoutMs"
            | "gradingTimeoutMs"
          )[],
        },
        schemaVersion: 1 as const,
        studioJudging: true as const,
        ...(options.agent.describePromptContracts
          ? { promptContracts: options.agent.describePromptContracts() }
          : {}),
        attemptScheduling: true as const,
        suites: clone(suites),
        responders: Object.entries(responders).map(([name, value]) => ({
          name,
          ...(typeof value === "function"
            ? {}
            : {
                schemaId: value.schemaId,
                ...(value.schemaVersion
                  ? { schemaVersion: value.schemaVersion }
                  : {}),
              }),
        })),
        references: Object.keys(references),
        ...(options.paramsSchema
          ? {
              paramsSchema: z.toJSONSchema(options.paramsSchema, {
                io: "input",
              }),
            }
          : {}),
        ...(options.judge ? { judge: judgeIdentity(options.judge) } : {}),
      };
    },
    async run(args: EvalRunOptions): Promise<EvalRunResult> {
      let usagePhase = "configuration";
      const evalUsage = usage.start("sdk.eval", {
        case_timeout_override: args.caseTimeoutMs !== undefined,
        settings_override:
          args.caseTimeoutMs !== undefined ||
          args.concurrency !== undefined ||
          args.repetitions !== undefined,
      });
      try {
        const suite = suites.find((value) => value.id === args.suiteId);
        if (!suite)
          throw new EvalConfigurationError(`Unknown suite: ${args.suiteId}`);
        if (
          args.caseIds &&
          (!args.caseIds.length ||
            new Set(args.caseIds).size !== args.caseIds.length ||
            args.caseIds.some(
              (id) => !suite.cases.some((item) => item.id === id),
            ))
        )
          throw new EvalConfigurationError("Select unique existing case IDs.");
        const repetitions = positive(
          args.repetitions ?? defaults.repetitions,
          "repetitions",
        );
        const concurrency = positive(
          args.concurrency ?? defaults.concurrency,
          "concurrency",
        );
        const caseTimeoutMs = positive(
          args.caseTimeoutMs ?? defaults.caseTimeoutMs,
          "caseTimeoutMs",
        );
        const gradingTimeoutMs = positive(
          args.gradingTimeoutMs ?? defaults.gradingTimeoutMs,
          "gradingTimeoutMs",
        );
        if (gradingTimeoutMs > 2_147_483_647)
          throw new EvalConfigurationError(
            "gradingTimeoutMs exceeds the supported timer range.",
          );
        if (caseTimeoutMs > 2_147_483_647)
          throw new EvalConfigurationError(
            "caseTimeoutMs exceeds the supported timer range.",
          );
        for (const [key, value] of [
          ["concurrency", concurrency],
          ["caseTimeoutMs", caseTimeoutMs],
          ["gradingTimeoutMs", gradingTimeoutMs],
        ] as const) {
          const max = options.limits?.[key];
          if (max !== undefined && value > max)
            throw new EvalConfigurationError(
              `${key} exceeds the application maximum of ${max}.`,
            );
        }
        const selected = suite.cases.filter(
          (item) => !args.caseIds || args.caseIds.includes(item.id),
        );
        if (!Number.isSafeInteger(selected.length * repetitions))
          throw new EvalConfigurationError("Too many case repetitions.");
        if (
          args.attempt &&
          (!selected.some((item) => item.id === args.attempt?.caseId) ||
            !Number.isSafeInteger(args.attempt.repetition) ||
            args.attempt.repetition < 1 ||
            args.attempt.repetition > repetitions)
        )
          throw new EvalConfigurationError("Invalid scheduled attempt.");
        const studioGrading = args.grading === "studio";
        const appJudge = appJudges.get(suite.id);
        if (
          suite.judge &&
          !studioGrading &&
          (!appJudge ||
            suite.judge.id !== appJudge.id ||
            suite.judge.version !== appJudge.version ||
            !sameJudgePrompt(suite.judge.prompt, appJudge.prompt))
        )
          throw new EvalConfigurationError(
            "The suite's App judge is not bound. Use defineSuite({ judge }) to bind it.",
          );
        if (
          !studioGrading &&
          !appJudge &&
          selected.some((item) =>
            item.steps.some((step) => step.expect.criteria?.length),
          )
        )
          throw new EvalConfigurationError(
            "Local runs with criteria require a judge. Run from Studio or provide a code judge.",
          );
        const selectedJudge = studioGrading ? args.judgeIdentity : appJudge;
        if (
          !studioGrading &&
          args.judgeIdentity &&
          (!appJudge ||
            args.judgeIdentity.id !== appJudge.id ||
            args.judgeIdentity.version !== appJudge.version ||
            args.judgeIdentity.location !== appJudge.location ||
            !sameJudgePrompt(args.judgeIdentity.prompt, appJudge.prompt))
        )
          throw new EvalConfigurationError(
            "App judge changed. Refresh before running.",
          );
        usagePhase = "execution";
        const start = Date.now();
        const result: EvalRunResult = {
          id: randomUUID(),
          suiteId: suite.id,
          suiteRevision: getEvalSuiteRevision(suite),
          suite: clone(suite),
          ...(selectedJudge
            ? {
                judge: {
                  ...judgeIdentity(selectedJudge),
                  ...(studioGrading && suite.judge?.prompt
                    ? { prompt: suite.judge.prompt }
                    : {}),
                },
              }
            : {}),
          startedAt: new Date(start).toISOString(),
          durationMs: 0,
          status: "passed",
          counts: { passed: 0, failed: 0, error: 0, cancelled: 0 },
          cases: [],
          errors: [],
        };
        let reporting = true;
        const emit = async (event: EvalProgress) => {
          if (!args.onProgress || !reporting) return;
          try {
            await withEvalAttribution(undefined, () =>
              args.onProgress?.(clone(event)),
            );
          } catch (error) {
            reporting = false;
            result.errors.push(issueFor("reporting", error));
          }
        };
        const attempt = async (
          item: EvalCase,
          repetition: number,
        ): Promise<EvalCaseResult> => {
          const started = Date.now();
          const controller = new AbortController();
          let timedOut = false;
          let timer: ReturnType<typeof setTimeout>;
          const deadline = (milliseconds: number) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, milliseconds);
          };
          deadline(defaults.setupTimeoutMs);
          const signal = args.signal
            ? AbortSignal.any([args.signal, controller.signal])
            : controller.signal;
          let originalExecutionError: unknown;
          const attemptId = randomUUID();
          const runtimeExecutions: EvalRuntimeExecution[] = [];
          const attemptResult: EvalCaseResult = {
            caseId: item.id,
            repetition,
            attemptId,
            runtimeExecutions,
            sessionId: `eval-${randomUUID()}`,
            status: "passed",
            durationMs: 0,
            steps: [],
            errors: [],
            phaseDurationsMs: {},
          };
          let associationProgress = Promise.resolve();
          let acceptingExecutions = true;
          const executeAttempt = async () => {
            let phase: EvalPhase = "params";
            let phaseStarted = Date.now();
            const recordPhase = () => {
              const now = Date.now();
              const durations = attemptResult.phaseDurationsMs!;
              durations[phase] = (durations[phase] ?? 0) + now - phaseStarted;
              phaseStarted = now;
            };
            const phaseIssue = (error: unknown, code?: string) =>
              issueFor(
                phase,
                error,
                {
                  correlation: {
                    sessionId: attemptResult.sessionId,
                    attemptId,
                  },
                },
                code,
              );
            let stepIndex: number | undefined;
            const reportPhase = async (next: EvalPhase) => {
              recordPhase();
              phase = next;
              if (args.includeActivity)
                await emit({
                  type: "case-progress",
                  caseId: item.id,
                  repetition,
                  phase,
                  ...(stepIndex !== undefined ? { stepIndex } : {}),
                });
            };
            let context: EvalContext<Params, Prepared> | undefined;
            let continuation: unknown;
            let activeStep: EvalStepResult | undefined;
            let activeStepReported = false;
            const history: ChatMessage[] = [];
            const call = async (
              readyContext: EvalContext<Params, Prepared>,
              command: EvalCommand,
              activeSignal: AbortSignal,
            ): Promise<EvalExecution> => {
              const run = (overrides?: {
                context?: Record<string, unknown>;
                messages?: ChatMessage[];
              }) =>
                executeEvalChat({
                  agent: options.agent,
                  ...(args.promptSnapshot
                    ? { promptSnapshot: args.promptSnapshot }
                    : {}),
                  command,
                  continuation,
                  history: clone(history),
                  sessionId: attemptResult.sessionId,
                  clientTurnId: randomUUID(),
                  signal: activeSignal,
                  ...(item.workflowId ? { workflowId: item.workflowId } : {}),
                  ...overrides,
                });
              const execution = options.execute
                ? await options.execute({
                    ...readyContext,
                    signal: activeSignal,
                    command,
                    continuation,
                    history: clone(history),
                    run,
                  })
                : await run();
              continuation = execution.continuation;
              const observation = EvalObservationSchema.parse(
                execution.observation,
              ) as EvalExecution["observation"];
              if (
                observation.type === "interrupt" &&
                execution.continuation === undefined
              )
                throw new Error(
                  "A waiting interrupt requires a private continuation.",
                );
              return {
                observation,
                ...(continuation !== undefined ? { continuation } : {}),
              };
            };
            try {
              await emit({
                type: "case-started",
                attemptId,
                caseId: item.id,
                repetition,
                sessionId: attemptResult.sessionId,
              });
              signal.throwIfAborted();
              await reportPhase("params");
              const params = options.paramsSchema
                ? await options.paramsSchema.parseAsync(item.params)
                : (item.params as Params);
              const base = {
                suiteId: suite.id,
                case: item,
                repetition,
                sessionId: attemptResult.sessionId,
                params,
                signal,
              };
              await reportPhase("setup");
              const prepared = options.setup
                ? await options.setup(base)
                : (undefined as Prepared);
              context = { ...base, prepared };
              signal.throwIfAborted();
              deadline(caseTimeoutMs);
              for (const [index, step] of item.steps.entries()) {
                stepIndex = index;
                activeStep = undefined;
                activeStepReported = false;
                signal.throwIfAborted();
                let command: Exclude<EvalCommand, { type: "cancel" }>;
                if (step.message !== undefined)
                  command = { type: "message", message: step.message };
                else {
                  await reportPhase("responder");
                  // Suite ordering and the previous successful observation guarantee
                  // a waiting interrupt; call() already validates its continuation.
                  const interrupt = attemptResult.steps.at(-1)?.observation
                    .interrupt as EvalInterrupt;
                  let response = step.resume;
                  if (handlerRef(response)) {
                    // Handler names were validated against this private registry.
                    const responder = responders[response.using]!;
                    if (
                      typeof responder !== "function" &&
                      (responder.schemaId !== interrupt.schemaId ||
                        (responder.schemaVersion &&
                          responder.schemaVersion !== interrupt.schemaVersion))
                    )
                      throw new Error("Incompatible responder.");
                    response = await (typeof responder === "function"
                      ? responder
                      : responder.respond)({
                      ...context,
                      interrupt: clone(interrupt),
                      ...(response.params !== undefined
                        ? { args: response.params }
                        : {}),
                    });
                  }
                  command = {
                    type: "resume",
                    // z.json() is inferred as optional under the package's relaxed
                    // declaration build. Runtime validation still requires value.
                    response: EvalResumeResponseSchema.parse(
                      response,
                    ) as ResumeResponse,
                  };
                }
                signal.throwIfAborted();
                await reportPhase("execute");
                originalExecutionError = undefined;
                const { observation } = await call(context, command, signal);
                const input =
                  command.type === "message"
                    ? { message: command.message }
                    : { resume: command.response };
                const evaluated: EvalStepResult = {
                  index,
                  input,
                  expectation: clone(step.expect),
                  observation,
                  status: "passed",
                  criteria: [],
                };
                attemptResult.steps.push(evaluated);
                activeStep = evaluated;
                signal.throwIfAborted();
                if (observation.type === "error") {
                  const issue = createEvalIssue(
                    "execute",
                    originalExecutionError ??
                      observation.failure ??
                      observation.text,
                    {
                      ...(observation.diagnosticId
                        ? { diagnosticId: observation.diagnosticId }
                        : {}),
                    },
                  );
                  attemptResult.errors.push(issue);
                  attemptResult.status = evaluated.status = "error";
                  evaluated.reason = issue.message;
                  await emit({
                    type: "step-completed",
                    caseId: item.id,
                    repetition,
                    step: evaluated,
                  });
                  activeStepReported = true;
                  break;
                }
                if (observation.type === "cancelled") {
                  evaluated.status = "cancelled";
                  attemptResult.status = "cancelled";
                  await emit({
                    type: "step-completed",
                    caseId: item.id,
                    repetition,
                    step: evaluated,
                  });
                  activeStepReported = true;
                  break;
                }
                if (
                  observation.type !== step.expect.type ||
                  (step.expect.schemaId &&
                    step.expect.schemaId !== observation.interrupt?.schemaId) ||
                  (step.expect.schemaVersion &&
                    step.expect.schemaVersion !==
                      observation.interrupt?.schemaVersion)
                ) {
                  evaluated.status = "failed";
                  evaluated.reason =
                    "The observed interaction did not match the expected answer or interrupt contract.";
                } else {
                  if (step.expect.checks?.length)
                    evaluated.checks = evaluateChecks(
                      step.expect.checks,
                      observation,
                    );
                  const outputReason = missingOutputReason(
                    step.expect.outputs,
                    observation,
                  );
                  const failedReason =
                    outputReason ??
                    evaluated.checks?.find((check) => !check.passed)?.reason;
                  if (failedReason) {
                    evaluated.status = "failed";
                    evaluated.reason = failedReason;
                  } else {
                    const reference = step.expect.reference;
                    if (reference !== undefined) {
                      await reportPhase("reference");
                      evaluated.reference = handlerRef(reference)
                        ? z.json().parse(
                            await references[reference.using]?.({
                              ...context,
                              observation: clone(observation),
                              ...(reference.params !== undefined
                                ? { args: reference.params }
                                : {}),
                            }),
                          )
                        : clone(reference);
                    }
                    await reportPhase("grading");
                    evaluated.evidence = createEvalJudgeEvidence(
                      observation,
                      suite.evidence,
                      evidenceFilters,
                    );
                    if (studioGrading && step.expect.criteria?.length) {
                      evaluated.status = "ungraded";
                      attemptResult.status = "ungraded";
                    }
                    if (!studioGrading && step.expect.criteria?.length)
                      await withEvalGradingTimeout(
                        async (gradingSignal) => {
                          for (const [criterionIndex, value] of (
                            step.expect.criteria ?? []
                          ).entries()) {
                            gradingSignal.throwIfAborted();
                            const criterion =
                              typeof value === "string"
                                ? { id: String(criterionIndex), text: value }
                                : value;
                            evaluated.judgeCalls =
                              (evaluated.judgeCalls ?? 0) + 1;
                            let request: EvalGradingRequest | undefined;
                            const verdict = EvalVerdictSchema.parse(
                              await withEvalAttribution(undefined, () =>
                                appJudge!.grade({
                                  ...(suite.judge?.prompt
                                    ? { prompt: suite.judge.prompt }
                                    : {}),
                                  onRequest: (value) => {
                                    request = clone(value);
                                  },
                                  criterion,
                                  onUsage: (usage) => {
                                    if (!gradingSignal.aborted) {
                                      evaluated.judgeUsage ??= [];
                                      evaluated.judgeUsage.push(clone(usage));
                                    }
                                  },
                                  input: clone(input),
                                  ...getEvalGradeEvidence(
                                    evaluated,
                                    attemptResult.steps.slice(0, -1),
                                  ),
                                  signal: gradingSignal,
                                  gradingTimeoutMs,
                                  ...(evaluated.reference !== undefined
                                    ? { reference: clone(evaluated.reference) }
                                    : {}),
                                }),
                              ),
                            );
                            gradingSignal.throwIfAborted();
                            evaluated.criteria.push({
                              ...criterion,
                              ...verdict,
                              ...(request ? { request } : {}),
                            });
                            if (!verdict.passed) evaluated.status = "failed";
                          }
                        },
                        signal,
                        gradingTimeoutMs,
                      );
                  }
                }
                await emit({
                  type: "step-completed",
                  caseId: item.id,
                  repetition,
                  step: evaluated,
                });
                activeStepReported = true;
                if (evaluated.status === "failed") {
                  attemptResult.status = "failed";
                  break;
                }
                history.push(
                  {
                    role: "user",
                    content:
                      command.type === "message"
                        ? command.message
                        : JSON.stringify(command.response),
                  },
                  { role: "assistant", content: observation.text },
                );
              }
              if (
                options.verify &&
                attemptResult.status !== "cancelled" &&
                attemptResult.status !== "error"
              ) {
                stepIndex = undefined;
                deadline(defaults.verificationTimeoutMs);
                await reportPhase("verification");
                const verification = EvalVerdictSchema.parse(
                  await options.verify({
                    ...context,
                    result: clone(attemptResult),
                  }),
                );
                signal.throwIfAborted();
                attemptResult.verification = verification;
                if (!verification.passed) attemptResult.status = "failed";
              }
            } catch (error) {
              if (signal.aborted) {
                attemptResult.status = timedOut ? "error" : "cancelled";
                if (timedOut)
                  attemptResult.errors.push({
                    ...phaseIssue(error),
                    details: {
                      timeoutMs:
                        phase === "params" || phase === "setup"
                          ? defaults.setupTimeoutMs
                          : phase === "verification"
                            ? defaults.verificationTimeoutMs
                            : caseTimeoutMs,
                    },
                    code:
                      phase === "params" || phase === "setup"
                        ? "EVAL_SETUP_TIMEOUT"
                        : phase === "verification"
                          ? "EVAL_VERIFICATION_TIMEOUT"
                          : "EVAL_TIMEOUT",
                    message:
                      phase === "params" || phase === "setup"
                        ? "Case setup exceeded its configured time limit."
                        : phase === "verification"
                          ? "Case verification exceeded its configured time limit."
                          : "Case execution exceeded its configured time limit.",
                  });
              } else {
                attemptResult.status = "error";
                attemptResult.errors.push(phaseIssue(error));
              }
              if (activeStep && !activeStepReported) {
                activeStep.status = attemptResult.status;
                activeStep.reason =
                  attemptResult.errors.at(-1)?.message ?? "Case was cancelled.";
                await emit({
                  type: "step-completed",
                  caseId: item.id,
                  repetition,
                  step: activeStep,
                });
              }
            } finally {
              clearTimeout(timer);
              if (context) {
                await reportPhase("cleanup");
                const cleanup = new AbortController();
                const cleanupTimer = setTimeout(
                  () => cleanup.abort(),
                  defaults.cleanupTimeoutMs,
                );
                try {
                  if (continuation !== undefined) {
                    try {
                      const cancelled = await call(
                        context,
                        { type: "cancel" },
                        cleanup.signal,
                      );
                      if (
                        cancelled.observation.type === "error" ||
                        cancelled.continuation !== undefined
                      )
                        attemptResult.errors.push(
                          createEvalIssue(
                            "cleanup",
                            cancelled.observation.failure,
                            {
                              code: "EVAL_INTERRUPT_CLEANUP_FAILED",
                              ...(cancelled.observation.diagnosticId
                                ? {
                                    diagnosticId:
                                      cancelled.observation.diagnosticId,
                                  }
                                : {}),
                            },
                          ),
                        );
                      cleanup.signal.throwIfAborted();
                    } catch (error) {
                      attemptResult.errors.push(
                        phaseIssue(error, "EVAL_INTERRUPT_CLEANUP_FAILED"),
                      );
                    }
                  }
                  try {
                    await options.teardown?.({
                      ...context,
                      signal: cleanup.signal,
                      result: clone(attemptResult),
                    });
                    cleanup.signal.throwIfAborted();
                  } catch (error) {
                    attemptResult.errors.push(phaseIssue(error));
                  }
                } finally {
                  clearTimeout(cleanupTimer);
                }
                if (
                  attemptResult.errors.some(
                    (error) => error.phase === "cleanup",
                  )
                )
                  attemptResult.status = "error";
              }
              recordPhase();
              attemptResult.durationMs = Date.now() - started;
            }
            acceptingExecutions = false;
            await associationProgress;
            await emit({ type: "case-completed", result: attemptResult });
            return attemptResult;
          };
          return withEvalAttribution(
            {
              attemptId,
              onError: (error) => {
                originalExecutionError = error;
              },
              onExecution: (execution) => {
                if (
                  !acceptingExecutions ||
                  runtimeExecutions.some(
                    (entry) =>
                      entry.runId === execution.runId &&
                      entry.sessionId === execution.sessionId,
                  )
                )
                  return;
                runtimeExecutions.push(execution);
                associationProgress = associationProgress.then(() =>
                  emit({
                    type: "case-runtime-associated",
                    caseId: item.id,
                    repetition,
                    attemptId,
                    execution,
                  }),
                );
              },
            },
            executeAttempt,
          );
        };
        const total = args.attempt ? 1 : selected.length * repetitions;
        if (args.includeActivity)
          await emit({
            type: "run-started",
            caseIds: selected.map((item) => item.id),
            repetitions,
            concurrency,
          });
        const completed = new Array<EvalCaseResult>(total);
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(concurrency, total) }, async () => {
            while (cursor < total) {
              const index = cursor++;
              // Positive repetitions and cursor < total guarantee this index.
              const item = args.attempt
                ? selected.find((item) => item.id === args.attempt?.caseId)!
                : selected[Math.floor(index / repetitions)]!;
              completed[index] = await attempt(
                item,
                args.attempt?.repetition ?? (index % repetitions) + 1,
              );
            }
          }),
        );
        result.cases = completed;
        for (const item of completed)
          result.counts[item.status] = (result.counts[item.status] ?? 0) + 1;
        result.status = statusFor(result.counts, result.errors);
        result.durationMs = Date.now() - start;
        const failedIssue =
          result.errors[0] ??
          result.cases.find((item) => item.errors.length)?.errors[0];
        evalUsage.end(
          result.status === "passed"
            ? "success"
            : result.status === "failed"
              ? "quality_failed"
              : result.status === "error"
                ? "failed"
                : result.status,
          {
            scale: scale(selected.length * repetitions),
            deterministic_checks: selected.some((item) =>
              item.steps.some((step) => Boolean(step.expect.checks?.length)),
            ),
            phase: usagePhase,
            ...(result.status === "error"
              ? {
                  ...classifyUsageError(failedIssue).properties,
                  eval_phase: failedIssue?.phase,
                }
              : {}),
          },
        );
        return result;
      } catch (error) {
        evalUsage.fail(error, { phase: usagePhase });
        throw error;
      }
    },
  };
}
