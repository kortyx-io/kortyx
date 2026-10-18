import { randomUUID } from "node:crypto";
import { DomainError, serializeFailure } from "@kortyx/core/errors";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "../src/chat/create-agent";
import {
  type CreateEvalsOptions,
  createEvalIssue,
  createEvals,
  EvalRunResultSchema,
} from "../src/evals/index";

const suite = {
  id: "repro",
  cases: [
    {
      id: "card",
      steps: [{ message: "Confirm", expect: { type: "answer" as const } }],
    },
  ],
};
const observation = { type: "answer" as const, text: "Done", structured: [] };
const agent = {
  streamChat: async () => {
    throw new Error("Unused custom executor");
  },
};
const base = {
  agent,
  suites: [suite],
  setup: () => ({}),
  execute: () => ({ observation }),
};
afterEach(() => vi.useRealTimers());

describe("eval safe failures and private diagnostics", () => {
  it("preserves the consumer reproduction's execute and cleanup domain failures", async () => {
    const original = Object.assign(
      new DomainError(
        "REVIEW_CARD_COUNT",
        "Expected exactly one pending review card",
        { details: { expected: 1, found: 2 } },
      ),
      { password: "PRIVATE_CREDENTIAL", responseBody: "PRIVATE_BODY" },
    );
    const reportError = vi.fn(() => randomUUID());
    const result = await createEvals({
      ...base,
      reportError,
      execute: () => {
        throw original;
      },
      teardown: () => {
        throw new DomainError(
          "POSTCONDITION_FAILED",
          "Required save absent; fixture reset completed",
        );
      },
    }).run({ suiteId: "repro" });
    expect(result.cases[0]?.errors).toMatchObject([
      {
        phase: "execute",
        code: "DOMAIN_ERROR",
        message: "Expected exactly one pending review card",
        failure: {
          domainCode: "REVIEW_CARD_COUNT",
          details: { expected: 1, found: 2 },
        },
        diagnosticId: expect.any(String),
      },
      {
        phase: "cleanup",
        code: "DOMAIN_ERROR",
        failure: { domainCode: "POSTCONDITION_FAILED" },
      },
    ]);
    expect(reportError).toHaveBeenCalledWith(original, {
      correlation: {
        sessionId: result.cases[0]?.sessionId,
        attemptId: result.cases[0]?.attemptId,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CREDENTIAL/);
    expect(EvalRunResultSchema.parse(result)).toEqual(result);
    expect(
      Object.getPrototypeOf(
        EvalRunResultSchema.parse(result).cases[0]?.errors[0]?.failure?.details,
      ),
    ).toBe(Object.prototype);
  });
  it.each([
    "setup",
    "execute",
    "verification",
    "cleanup",
    "grading",
  ] as const)("retains safe %s failures without allowing exporter failures to change the outcome", async (phase) => {
    const error = new DomainError(
      "FIXTURE_UNAVAILABLE",
      "The test fixture is unavailable",
    );
    const fail = () => {
      throw error;
    };
    const options: CreateEvalsOptions<undefined, {}> = {
      ...base,
      reportError: fail,
      ...(phase === "setup" ? { setup: fail } : {}),
      ...(phase === "execute" ? { execute: fail } : {}),
      ...(phase === "verification" ? { verify: fail } : {}),
      ...(phase === "cleanup" ? { teardown: fail } : {}),
      ...(phase === "grading"
        ? {
            suites: [
              {
                ...suite,
                cases: [
                  {
                    ...suite.cases[0]!,
                    steps: [
                      {
                        message: "Confirm",
                        expect: { type: "answer", criteria: ["saved"] },
                      },
                    ],
                  },
                ],
              },
            ],
            judge: { id: "judge", version: "1", grade: fail },
          }
        : {}),
    };
    const result = await createEvals(options).run({ suiteId: "repro" });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors[0]).toMatchObject({
      phase,
      failure: { domainCode: "FIXTURE_UNAVAILABLE" },
    });
    expect(result.cases[0]?.errors[0]?.diagnosticId).toBeUndefined();
  });
  it("uses the configured agent's native error reporter", async () => {
    const diagnosticId = randomUUID();
    const native = vi.fn(() => diagnosticId);
    const real = createAgent({
      workflows: [],
      frameworkAdapter: createInMemoryFrameworkAdapter(),
      telemetry: { trace: { startSpan: () => undefined, reportError: native } },
    });
    const result = await createEvals({
      ...base,
      agent: real,
      execute: () => {
        throw new Error("PRIVATE_EXCEPTION");
      },
    }).run({ suiteId: "repro" });
    expect(result.cases[0]?.errors[0]?.diagnosticId).toBe(diagnosticId);
    expect(result.cases[0]?.errors[0]?.message).toBe("PRIVATE_EXCEPTION");
    expect(result.cases[0]?.errors[0]?.exception?.data.stack).toContain(
      "PRIVATE_EXCEPTION",
    );
    expect(native).toHaveBeenCalledTimes(1);
    const broken = createAgent({
      workflows: [],
      frameworkAdapter: createInMemoryFrameworkAdapter(),
      telemetry: {
        trace: {
          startSpan: () => undefined,
          reportError: () => {
            throw new Error("exporter");
          },
        },
      },
    });
    expect(broken.reportError?.(new Error("original"))).toBeUndefined();
  });
  it("reuses supplied diagnostic references and rejects malformed IDs", () => {
    const diagnosticId = randomUUID();
    const reportError = vi.fn();
    const failure = new DomainError("SAFE", "Safe failure").failure;
    expect(
      createEvalIssue("execute", failure, { diagnosticId, reportError }),
    ).toMatchObject({ diagnosticId, failure });
    expect(reportError).not.toHaveBeenCalled();
    expect(
      createEvalIssue(
        "execute",
        Object.assign(new Error("private"), { diagnosticId: "invalid" }),
      ).diagnosticId,
    ).toBeUndefined();
    expect(createEvalIssue("execute", undefined).code).toBe("EVAL_HOOK_FAILED");
  });
  it("retains terminal and handled-tool stream descriptors without copying private chunk fields", async () => {
    const diagnosticId = randomUUID();
    const failure = serializeFailure(
      new DomainError("OUTPUT_CONTRACT", "The required output is absent"),
    );
    const chunks = [
      {
        type: "trace",
        traceId: "trace",
        spanId: "span",
        runId: "run",
        rootSpanName: "kortyx.run",
      },
      {
        type: "tool-call-error",
        tool: "save",
        toolCallId: "save-1",
        message: failure.message,
        failure,
        diagnosticId,
        responseBody: "PRIVATE_BODY",
      },
      {
        type: "error",
        message: failure.message,
        failure,
        diagnosticId,
        stack: "PRIVATE_STACK",
      },
      { type: "done" },
    ] as StreamChunk[];
    const streaming = {
      streamChat: async () =>
        (async function* () {
          yield* chunks;
        })(),
    };
    const result = await createEvals({ agent: streaming, suites: [suite] }).run(
      { suiteId: "repro" },
    );
    const actual = result.cases[0]?.steps[0]?.observation;
    expect(actual).toMatchObject({
      type: "error",
      runId: "run",
      failure,
      diagnosticId,
    });
    expect(actual?.events).toContainEqual({
      type: "tool-call-error",
      tool: "save",
      toolCallId: "save-1",
      message: failure.message,
      failure,
      diagnosticId,
    });
    expect(result.cases[0]?.errors[0]).toMatchObject({ failure, diagnosticId });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_BODY|PRIVATE_STACK/);
  });
});

describe("postconditions and independent phase budgets", () => {
  it("records a failed verification separately from successful fixture reset", async () => {
    const teardown = vi.fn();
    const result = await createEvals({
      ...base,
      verify: () => ({
        passed: false,
        reason: "Required approved save is absent",
        evidence: ["No record was created"],
      }),
      teardown,
    }).run({ suiteId: "repro" });
    expect(result.status).toBe("failed");
    expect(result.cases[0]).toMatchObject({
      status: "failed",
      verification: {
        passed: false,
        reason: "Required approved save is absent",
      },
      errors: [],
    });
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(result.cases[0]?.steps[0]?.status).toBe("passed");
    expect(EvalRunResultSchema.parse(result)).toEqual(result);
  });
  it("keeps reset faults as Error even when verification returned Failed", async () => {
    const result = await createEvals({
      ...base,
      verify: () => ({
        passed: false,
        reason: "Required save absent",
        evidence: [],
      }),
      teardown: () => {
        throw new DomainError("RESET_FAILED", "Fixture reset did not complete");
      },
    }).run({ suiteId: "repro" });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.verification?.passed).toBe(false);
    expect(result.cases[0]?.errors[0]?.failure?.domainCode).toBe(
      "RESET_FAILED",
    );
  });
  it("does not charge fixture admission against execution's allowance", async () => {
    vi.useFakeTimers();
    const progress: string[] = [];
    const result = await createEvals({
      ...base,
      defaults: { setupTimeoutMs: 200, caseTimeoutMs: 100 },
      setup: async () => {
        await vi.advanceTimersByTimeAsync(150);
        return {};
      },
      execute: async () => {
        await vi.advanceTimersByTimeAsync(90);
        return { observation };
      },
      verify: () => ({ passed: true, reason: "Saved", evidence: [] }),
    }).run({
      suiteId: "repro",
      includeActivity: true,
      onProgress: (event) => {
        if (event.type === "case-progress") progress.push(event.phase);
      },
    });
    expect(result.status).toBe("passed");
    expect(result.cases[0]?.phaseDurationsMs).toMatchObject({
      setup: 150,
      execute: 90,
      verification: 0,
      cleanup: 0,
    });
    expect(result.cases[0]?.durationMs).toBe(240);
    expect(progress).toEqual([
      "params",
      "setup",
      "execute",
      "grading",
      "verification",
      "cleanup",
    ]);
  });
  it.each([
    "setup",
    "verification",
  ] as const)("identifies %s timeout with its own deadline and runs cleanup", async (phase) => {
    vi.useFakeTimers();
    const teardown = vi.fn();
    const result = await createEvals({
      ...base,
      defaults: {
        setupTimeoutMs: 10,
        verificationTimeoutMs: 10,
        caseTimeoutMs: 100,
      },
      teardown,
      ...(phase === "setup"
        ? {
            setup: async () => {
              await vi.advanceTimersByTimeAsync(15);
              return {};
            },
          }
        : {
            verify: async () => {
              await vi.advanceTimersByTimeAsync(15);
              return { passed: true, reason: "late", evidence: [] };
            },
          }),
    }).run({ suiteId: "repro" });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors[0]?.code).toBe(
      phase === "setup" ? "EVAL_SETUP_TIMEOUT" : "EVAL_VERIFICATION_TIMEOUT",
    );
    expect(teardown).toHaveBeenCalledTimes(1);
  });
  it("skips verification after cancellation and rejects invalid budget settings", async () => {
    const controller = new AbortController();
    controller.abort();
    const verify = vi.fn();
    const result = await createEvals({ ...base, verify }).run({
      suiteId: "repro",
      signal: controller.signal,
    });
    expect(result.status).toBe("cancelled");
    expect(verify).not.toHaveBeenCalled();
    expect(() =>
      createEvals({ ...base, defaults: { setupTimeoutMs: 0 } }),
    ).toThrow("setupTimeoutMs");
    expect(() =>
      createEvals({ ...base, defaults: { verificationTimeoutMs: -1 } }),
    ).toThrow("verificationTimeoutMs");
  });
});

it("retains the exact native failure when cancelling a waiting eval interrupt fails", async () => {
  const diagnosticId = randomUUID();
  const failure = serializeFailure(
    new DomainError(
      "CANCEL_RESET_FAILED",
      "The waiting resource could not be released",
    ),
  );
  const result = await createEvals({
    ...base,
    execute: ({ command }) =>
      command.type === "cancel"
        ? {
            observation: {
              type: "error",
              text: "",
              structured: [],
              failure,
              diagnosticId,
            },
          }
        : {
            observation: {
              type: "interrupt",
              text: "",
              structured: [],
              interrupt: { requestId: "waiting", kind: "text", options: [] },
            },
            continuation: "PRIVATE_RESUME_TOKEN",
          },
  }).run({ suiteId: "repro" });
  expect(result.status).toBe("error");
  expect(result.cases[0]?.errors[0]).toMatchObject({
    phase: "cleanup",
    diagnosticId,
    failure: { domainCode: "CANCEL_RESET_FAILED" },
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_RESUME_TOKEN");
});

it("retains the underlying diagnostic when an execution fault arrives after its deadline", async () => {
  vi.useFakeTimers();
  const original = new DomainError(
    "QUERY_TIMEOUT",
    "The fixture query timed out",
  );
  const id = randomUUID();
  const customAgent = {
    ...agent,
    reportError(error: unknown) {
      expect(this).toBe(customAgent);
      expect(error).toBe(original);
      return id;
    },
  };
  const result = await createEvals({
    ...base,
    agent: customAgent,
    defaults: { caseTimeoutMs: 10 },
    execute: async () => {
      await vi.advanceTimersByTimeAsync(15);
      throw original;
    },
  }).run({ suiteId: "repro" });
  expect(result.cases[0]?.errors[0]).toMatchObject({
    code: "EVAL_TIMEOUT",
    diagnosticId: id,
    failure: { domainCode: "QUERY_TIMEOUT" },
  });
});
