import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ResumeResponse } from "../execution/types";
import type { ChatMessage } from "../types/chat-message";
import {
  EvalConfigurationError,
  EvalObservationSchema,
  EvalResumeResponseSchema,
  EvalVerdictSchema,
  parseEvalSuite,
} from "./contracts";
import { getEvalSuiteRevision } from "./revision";
import { executeEvalChat } from "./stream";
import type {
  CreateEvalsOptions,
  EvalCase,
  EvalCaseResult,
  EvalCommand,
  EvalContext,
  EvalExecution,
  EvalHandlerRef,
  EvalIssue,
  EvalJson,
  EvalPhase,
  EvalProgress,
  EvalRunOptions,
  EvalRunResult,
  EvalStatus,
  EvalStepResult,
  EvalSuite,
} from "./types";

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
const phases: Record<EvalPhase, string> = {
  params: "Case parameters failed validation.",
  setup: "Case setup failed.",
  execute: "Agent execution failed or returned an invalid observation.",
  responder:
    "Interrupt response failed or was incompatible with the waiting contract.",
  reference: "Reference resolution failed or returned non-JSON data.",
  grading: "Grading failed or returned an invalid verdict.",
  cleanup: "Case cleanup failed.",
  reporting: "Progress reporting failed.",
};
const failure = (phase: EvalPhase, code = "EVAL_HOOK_FAILED"): EvalIssue => ({
  phase,
  code,
  message: phases[phase],
});
const statusFor = (
  counts: Record<EvalStatus, number>,
  errors: readonly EvalIssue[],
): EvalStatus =>
  errors.length || counts.error
    ? "error"
    : counts.cancelled
      ? "cancelled"
      : counts.failed
        ? "failed"
        : "passed";

/** Run serializable conversations against the same agent used by the application. */
export function createEvals<
  Params = EvalJson | undefined,
  Prepared = undefined,
>(options: CreateEvalsOptions<Params, Prepared>) {
  const suites = options.suites.map((suite) => freeze(parseEvalSuite(suite)));
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
        if (step.expect.criteria?.length && !options.judge)
          throw new EvalConfigurationError(
            "Cases with criteria require a configured judge.",
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
    cleanupTimeoutMs: positive(
      options.defaults?.cleanupTimeoutMs ?? 10_000,
      "cleanupTimeoutMs",
    ),
  };

  return {
    listSuites(): EvalSuite[] {
      return clone(suites);
    },
    describe() {
      return {
        schemaVersion: 1 as const,
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
        ...(options.judge
          ? { judge: { id: options.judge.id, version: options.judge.version } }
          : {}),
      };
    },
    async run(args: EvalRunOptions): Promise<EvalRunResult> {
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
      const selected = suite.cases.filter(
        (item) => !args.caseIds || args.caseIds.includes(item.id),
      );
      if (!Number.isSafeInteger(selected.length * repetitions))
        throw new EvalConfigurationError("Too many case repetitions.");
      const start = Date.now();
      const result: EvalRunResult = {
        id: randomUUID(),
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        suite: clone(suite),
        ...(options.judge
          ? { judge: { id: options.judge.id, version: options.judge.version } }
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
          await args.onProgress(clone(event));
        } catch {
          reporting = false;
          result.errors.push(failure("reporting"));
        }
      };
      const attempt = async (
        item: EvalCase,
        repetition: number,
      ): Promise<EvalCaseResult> => {
        const started = Date.now();
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, defaults.caseTimeoutMs);
        const signal = args.signal
          ? AbortSignal.any([args.signal, controller.signal])
          : controller.signal;
        const attemptResult: EvalCaseResult = {
          caseId: item.id,
          repetition,
          sessionId: `eval-${randomUUID()}`,
          status: "passed",
          durationMs: 0,
          steps: [],
          errors: [],
        };
        let phase: EvalPhase = "params";
        let context: EvalContext<Params, Prepared> | undefined;
        let continuation: unknown;
        let setupCompleted = false;
        let activeStep: EvalStepResult | undefined;
        let activeStepReported = false;
        const history: ChatMessage[] = [];
        const call = async (
          command: EvalCommand,
          activeSignal: AbortSignal,
        ): Promise<EvalExecution> => {
          if (!context) throw new Error("Setup is incomplete.");
          const run = (overrides?: {
            context?: Record<string, unknown>;
            messages?: ChatMessage[];
          }) =>
            executeEvalChat({
              agent: options.agent,
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
                ...context,
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
            caseId: item.id,
            repetition,
            sessionId: attemptResult.sessionId,
          });
          signal.throwIfAborted();
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
          phase = "setup";
          const prepared = options.setup
            ? await options.setup(base)
            : (undefined as Prepared);
          context = { ...base, prepared };
          setupCompleted = true;
          signal.throwIfAborted();
          for (const [index, step] of item.steps.entries()) {
            activeStep = undefined;
            activeStepReported = false;
            signal.throwIfAborted();
            let command: EvalCommand;
            if (step.message !== undefined)
              command = { type: "message", message: step.message };
            else {
              phase = "responder";
              const interrupt =
                attemptResult.steps.at(-1)?.observation.interrupt;
              if (!interrupt || continuation === undefined)
                throw new Error("No waiting interrupt.");
              let response = step.resume;
              if (handlerRef(response)) {
                const responder = responders[response.using];
                if (!responder) throw new Error("Missing responder.");
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
            phase = "execute";
            const { observation } = await call(command, signal);
            const input =
              command.type === "message"
                ? { message: command.message }
                : {
                    resume:
                      command.type === "resume"
                        ? command.response
                        : ({ type: "cancel" } as const),
                  };
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
            if (observation.type === "error") throw new Error("Agent failed.");
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
              phase = "reference";
              const reference = step.expect.reference;
              if (reference !== undefined) {
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
              phase = "grading";
              for (const [criterionIndex, value] of (
                step.expect.criteria ?? []
              ).entries()) {
                signal.throwIfAborted();
                const criterion =
                  typeof value === "string"
                    ? { id: String(criterionIndex), text: value }
                    : value;
                const verdict = EvalVerdictSchema.parse(
                  await options.judge?.grade({
                    criterion,
                    input: clone(input),
                    observation: clone(observation),
                    conversation: clone(attemptResult.steps.slice(0, -1)),
                    signal,
                    ...(evaluated.reference !== undefined
                      ? { reference: clone(evaluated.reference) }
                      : {}),
                  }),
                );
                signal.throwIfAborted();
                evaluated.criteria.push({ ...criterion, ...verdict });
                if (!verdict.passed) evaluated.status = "failed";
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
                    : JSON.stringify(
                        command.type === "resume" ? command.response : {},
                      ),
              },
              { role: "assistant", content: observation.text },
            );
          }
        } catch {
          if (signal.aborted) {
            attemptResult.status = timedOut ? "error" : "cancelled";
            if (timedOut)
              attemptResult.errors.push({
                phase,
                code: "EVAL_TIMEOUT",
                message: "Case exceeded its configured time limit.",
              });
          } else {
            attemptResult.status = "error";
            attemptResult.errors.push(failure(phase));
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
          if (setupCompleted && context) {
            const cleanup = new AbortController();
            const cleanupTimer = setTimeout(
              () => cleanup.abort(),
              defaults.cleanupTimeoutMs,
            );
            try {
              if (continuation !== undefined) {
                try {
                  const cancelled = await call(
                    { type: "cancel" },
                    cleanup.signal,
                  );
                  if (
                    cancelled.observation.type === "error" ||
                    cancelled.continuation !== undefined
                  )
                    attemptResult.errors.push(
                      failure("cleanup", "EVAL_INTERRUPT_CLEANUP_FAILED"),
                    );
                  cleanup.signal.throwIfAborted();
                } catch {
                  attemptResult.errors.push(
                    failure("cleanup", "EVAL_INTERRUPT_CLEANUP_FAILED"),
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
              } catch {
                attemptResult.errors.push(failure("cleanup"));
              }
            } finally {
              clearTimeout(cleanupTimer);
            }
            if (attemptResult.errors.some((error) => error.phase === "cleanup"))
              attemptResult.status = "error";
          }
          attemptResult.durationMs = Date.now() - started;
        }
        await emit({ type: "case-completed", result: attemptResult });
        return attemptResult;
      };
      const total = selected.length * repetitions;
      const completed = new Array<EvalCaseResult>(total);
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(concurrency, total) }, async () => {
          while (cursor < total) {
            const index = cursor++;
            const item = selected[Math.floor(index / repetitions)];
            if (!item)
              throw new EvalConfigurationError("Invalid case selection.");
            completed[index] = await attempt(item, (index % repetitions) + 1);
          }
        }),
      );
      result.cases = completed;
      for (const item of completed) result.counts[item.status]++;
      result.status = statusFor(result.counts, result.errors);
      result.durationMs = Date.now() - start;
      return result;
    },
  };
}
