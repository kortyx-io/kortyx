// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import type { KortyxExecutableTool } from "@kortyx/providers";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { runWithHookContext } from "../src/context";
import { useTool } from "../src/tool";
import type { KortyxTelemetryEvent, ReasonTraceAdapter } from "../src/tracing";
import { createNode, createState } from "./helpers";

function setup(trace?: ReasonTraceAdapter) {
  const { node } = createNode();
  const events: KortyxTelemetryEvent[] = [];
  node.workflowCallTelemetry = {
    environment: "test",
    service: { name: "test" },
    correlation: {
      runId: "run",
      workflowId: "test-workflow",
      invocationId: "child",
      branchId: "fork",
    },
    reporter: {
      ensureWorkflowTopology: vi.fn(),
      emit: async (batch) => {
        events.push(...batch);
      },
    },
  };
  return {
    node,
    events,
    run: <T>(fn: () => Promise<T>) =>
      runWithHookContext(
        { node, state: createState(), reasonTrace: trace },
        fn,
      ),
  };
}

describe("useTool", () => {
  it("infers input and result, preserves result identity, and exports only safe facts without a trace adapter", async () => {
    const result = { status: "DENIED", secret: "PRIVATE_RESULT" };
    const tool: KortyxExecutableTool<{ jobId: string }, typeof result> = {
      name: "lookup",
      inputSchema: {},
      execute: (input) => {
        expect(input.jobId).toBe("PRIVATE_INPUT");
        return result;
      },
      outcomes: {
        denialCodes: ["NOT_ALLOWED"],
        classifyResult: (value) => ({
          outcome: value.status === "DENIED" ? "denied" : "success",
          code: "NOT_ALLOWED",
        }),
      },
    };
    const { events, run } = setup();
    const actual = await run(() =>
      useTool({ tool, input: { jobId: "PRIVATE_INPUT" } }),
    );
    expect(actual.result).toBe(result);
    expectTypeOf(actual.result).toEqualTypeOf<typeof result>();
    expect(events.map((event) => event.type)).toEqual([
      "tool.started",
      "tool.denied",
    ]);
    expect(events[1]?.payload).toMatchObject({
      denialCode: "NOT_ALLOWED",
      durationMs: expect.any(Number),
      invocationId: "child",
      branchId: "fork",
    });
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_INPUT|PRIVATE_RESULT/);
  });
  it.each([
    "unlisted",
    "NOT_ALLOWED secret",
    "a".repeat(100),
  ])("never exports an unsafe denial code %s", async (code) => {
    const { run, events } = setup();
    await run(() =>
      useTool({
        tool: {
          name: "lookup",
          inputSchema: {},
          execute: () => "denied",
          outcomes: {
            denialCodes: [code],
            classifyResult: () => ({ outcome: "denied", code }),
          },
        },
        input: {},
      }),
    );
    expect(events[1]?.payload.denialCode).toBe("DENIED");
    expect(JSON.stringify(events)).not.toContain(code);
  });
  it("preserves thrown error identity and ignores classification failures", async () => {
    const error = new Error("PRIVATE_ERROR");
    const { run, events } = setup();
    await expect(
      run(() =>
        useTool({
          tool: {
            name: "lookup",
            inputSchema: {},
            execute: () => {
              throw error;
            },
            outcomes: {
              classifyError: () => {
                throw new Error("classifier failed");
              },
            },
          },
          input: {},
        }),
      ),
    ).rejects.toBe(error);
    expect(events[1]?.type).toBe("tool.failed");
    expect(JSON.stringify(events)).not.toContain("PRIVATE_ERROR");
  });
  it("records cancellation before dispatch without counting an execution", async () => {
    const execute = vi.fn();
    const { run, events } = setup();
    await expect(
      run(() =>
        useTool({
          tool: { name: "lookup", inputSchema: {}, execute },
          input: {},
          abortSignal: AbortSignal.abort(),
        }),
      ),
    ).rejects.toBeDefined();
    expect(execute).not.toHaveBeenCalled();
    expect(events).toMatchObject([
      {
        type: "tool.cancelled",
        payload: { executed: false, outcome: "cancelled" },
      },
    ]);
  });
  it("does not execute twice when an active-span adapter rejects after the callback", async () => {
    const error = new Error("observer failed");
    const execute = vi.fn(async () => "OK");
    const { run } = setup({
      startSpan: () => undefined,
      withSpan: async (_, fn) => {
        await fn({
          end: () => {
            throw error;
          },
        });
        throw error;
      },
    });
    expect(
      (
        await run(() =>
          useTool({
            tool: { name: "lookup", inputSchema: {}, execute },
            input: {},
          }),
        )
      ).result,
    ).toBe("OK");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("keeps concurrent calls separate and does not cache direct invocations", async () => {
    const execute = vi.fn(async () => "OK");
    const { run, events } = setup();
    await run(() =>
      Promise.all([
        useTool({
          tool: { name: "lookup", inputSchema: {}, execute },
          input: {},
        }),
        useTool({
          tool: { name: "lookup", inputSchema: {}, execute },
          input: {},
        }),
      ]),
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(new Set(events.map((event) => event.payload.toolCallId)).size).toBe(
      2,
    );
  });
  it("does not wait for adapter delivery after its execution callback", async () => {
    const { run } = setup({
      startSpan: () => undefined,
      withSpan: async (_, fn) => {
        await fn({});
        return await new Promise<never>(() => {});
      },
    });
    expect(
      (
        await run(() =>
          useTool({
            tool: { name: "lookup", inputSchema: {}, execute: () => "OK" },
            input: {},
          }),
        )
      ).result,
    ).toBe("OK");
  });
  it("treats throwing span getters and result inspection as observation failures", async () => {
    const result = {
      get isError() {
        throw new Error("getter failed");
      },
    };
    const { run } = setup({
      startSpan: () => ({
        get end(): never {
          throw new Error("span getter failed");
        },
      }),
    });
    expect(
      (
        await run(() =>
          useTool({
            tool: { name: "lookup", inputSchema: {}, execute: () => result },
            input: {},
          }),
        )
      ).result,
    ).toBe(result);
  });
  it("maps thrown business denial while preserving the exception", async () => {
    const error = new Error("PRIVATE_DENIAL");
    const { run, events } = setup();
    await expect(
      run(() =>
        useTool({
          tool: {
            name: "lookup",
            inputSchema: {},
            outcomes: {
              denialCodes: ["NOT_ALLOWED"],
              classifyError: () => ({ outcome: "denied", code: "NOT_ALLOWED" }),
            },
            execute: () => {
              throw error;
            },
          },
          input: {},
        }),
      ),
    ).rejects.toBe(error);
    expect(events[1]).toMatchObject({
      type: "tool.denied",
      payload: { denialCode: "NOT_ALLOWED" },
    });
    expect(JSON.stringify(events)).not.toContain("PRIVATE_DENIAL");
  });
});
