import { createHash, timingSafeEqual } from "node:crypto";
import { validatePromptValue, verifyPromptSnapshot } from "@kortyx/prompts";
import {
  createInMemoryEvalExecutionStore,
  type EvalExecutionStore,
} from "@kortyx/runtime";
import {
  EvalConfigurationError,
  EvalRemoteRunRequestSchema,
} from "./contracts";
import { getEvalSuiteRevision } from "./revision";
import { createEvalExecutionTransport } from "./route-executions";
import type {
  EvalJudgeIdentity,
  EvalRunOptions,
  EvalRunResult,
  EvalSuite,
} from "./types";

export type EvalRunner = {
  describe: () => {
    schemaVersion: 1;
    execution?: import("zod").infer<
      typeof import("./settings").EvalExecutionSettingsSchema
    >;
    suites: readonly EvalSuite[];
    studioJudging?: true;
    promptContracts?: {
      id: string;
      format: "system-user" | "chat";
      configSchema: Record<string, unknown>;
    }[];
    attemptScheduling?: true;
    judge?: EvalJudgeIdentity;
  };
  run: (args: EvalRunOptions) => Promise<EvalRunResult>;
};

/** Mount this Web Request handler in the consumer app. Keys never enter cases. */
export function createEvalRouteHandler({
  evals,
  serviceKey,
  maxCases = 100,
  maxActiveRuns = 1,
  maxActiveAttempts = 20,
  maxQueuedExecutions = 1000,
  executionStore = createInMemoryEvalExecutionStore(),
  onExecution,
}: {
  evals: EvalRunner;
  serviceKey: string;
  maxCases?: number;
  maxActiveRuns?: number;
  maxActiveAttempts?: number;
  maxQueuedExecutions?: number;
  executionStore?: EvalExecutionStore;
  onExecution?: (completion: Promise<void>) => void;
}) {
  if (serviceKey.length < 32)
    throw new EvalConfigurationError(
      "Eval service keys must have at least 32 characters.",
    );
  if (
    !Number.isSafeInteger(maxCases) ||
    maxCases < 1 ||
    !Number.isSafeInteger(maxActiveRuns) ||
    maxActiveRuns < 1 ||
    !Number.isSafeInteger(maxActiveAttempts) ||
    maxActiveAttempts < 1 ||
    !Number.isSafeInteger(maxQueuedExecutions) ||
    maxQueuedExecutions < 1 ||
    !Number.isSafeInteger(executionStore.heartbeatIntervalMs) ||
    executionStore.heartbeatIntervalMs < 1
  )
    throw new EvalConfigurationError(
      "Eval endpoint limits must be positive integers.",
    );
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const expected = digest(`Bearer ${serviceKey}`);
  const execution = createEvalExecutionTransport({
    evals,
    store: executionStore,
    scope: expected.toString("hex"),
    limits: { maxActiveRuns, maxActiveAttempts, maxQueuedExecutions },
    ...(onExecution ? { onExecution } : {}),
  });
  const handler = async (request: Request): Promise<Response> => {
    if (
      !timingSafeEqual(
        expected,
        digest(request.headers.get("authorization") ?? ""),
      )
    )
      return Response.json(
        { error: "Unauthorized eval request." },
        { status: 401 },
      );
    const observed = await execution.existing(request);
    if (observed) return observed;
    const manifest = evals.describe();
    if (request.method === "GET")
      return Response.json(manifest, {
        headers: {
          "cache-control": "no-store",
          ...(await execution.capabilityHeaders()),
        },
      });
    if (request.method !== "POST")
      return Response.json({ error: "Unsupported method." }, { status: 405 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({ error: "Expected JSON." }, { status: 415 });
    let body: ReturnType<typeof EvalRemoteRunRequestSchema.parse>;
    try {
      const text = await request.text();
      if (text.length > 1_048_576)
        return Response.json({ error: "Request too large." }, { status: 413 });
      body = EvalRemoteRunRequestSchema.parse(JSON.parse(text));
    } catch {
      return Response.json(
        { error: "Invalid eval run request." },
        { status: 400 },
      );
    }
    const suite = manifest.suites.find((item) => item.id === body.suiteId);
    if (body.promptSnapshot) {
      try {
        const snapshot = await verifyPromptSnapshot(body.promptSnapshot);
        if (snapshot.source !== "eval" || !manifest.promptContracts?.length)
          throw new Error("Unsupported prompt evaluation.");
        for (const contract of manifest.promptContracts) {
          const version = snapshot.versions[contract.id];
          if (!version || version.content.format !== contract.format)
            throw new Error("Prompt contract mismatch.");
          validatePromptValue(
            contract.configSchema,
            version.content.config,
            "Application configuration",
          );
        }
      } catch {
        return Response.json(
          { error: "Prompt snapshot does not match the application contract." },
          { status: 409 },
        );
      }
    }
    if (
      !suite ||
      body.caseIds?.some((id) => !suite.cases.some((item) => item.id === id)) ||
      (body.caseIds && new Set(body.caseIds).size !== body.caseIds.length)
    )
      return Response.json(
        { error: "Unknown suite or case selection." },
        { status: 400 },
      );
    if (getEvalSuiteRevision(suite) !== body.suiteRevision)
      return Response.json(
        { error: "Suite changed. Refresh before running." },
        { status: 409 },
      );
    if (
      (body.caseIds?.length ?? suite.cases.length) * body.repetitions >
      maxCases
    )
      return Response.json(
        { error: "Too many case repetitions." },
        { status: 400 },
      );
    if (body.grading === "studio" && !manifest.studioJudging)
      return Response.json(
        { error: "Consumer does not support Studio judging." },
        { status: 409 },
      );
    if (
      body.grading !== "studio" &&
      body.judge &&
      (!manifest.judge ||
        body.judge.id !== manifest.judge.id ||
        body.judge.version !== manifest.judge.version ||
        body.judge.location !== manifest.judge.location)
    )
      return Response.json(
        { error: "App judge changed. Refresh before running." },
        { status: 409 },
      );
    if (
      body.attempt &&
      (!manifest.attemptScheduling ||
        !suite.cases.some((item) => item.id === body.attempt?.caseId) ||
        (body.caseIds && !body.caseIds.includes(body.attempt.caseId)) ||
        body.attempt.repetition > body.repetitions)
    )
      return Response.json(
        { error: "Unsupported or invalid scheduled attempt." },
        { status: 409 },
      );
    for (const key of ["concurrency", "caseTimeoutMs"] as const) {
      const maximum = manifest.execution?.limits[key];
      const value = body[key] ?? manifest.execution?.defaults[key];
      if (maximum !== undefined && value !== undefined && value > maximum)
        return Response.json(
          { error: `${key} exceeds the application maximum of ${maximum}.` },
          { status: 400 },
        );
    }
    if (request.signal.aborted)
      return Response.json({ error: "Request cancelled." }, { status: 409 });
    return execution.submit(request, body);
  };
  return Object.assign(handler, {
    /** Stop admissions and finish accepted jobs; keep HTTP/store alive for observers. */
    drain: execution.drain,
    /** Explicitly abort local execution, then wait for cleanup. */
    close: execution.close,
  });
}
