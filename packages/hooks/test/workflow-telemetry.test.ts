import { describe, expect, it, vi } from "vitest";
import type { KortyxTelemetryConfig } from "../src/tracing";
import {
  emitWorkflowCall,
  workflowCallContent,
} from "../src/workflow-telemetry";

const config = (emit = vi.fn(async () => {})): KortyxTelemetryConfig => ({
  environment: "test",
  service: { name: "app" },
  correlation: { runId: "run", workflowId: "parent" },
  reporter: {
    emit,
    ensureWorkflowTopology: async () => ({
      workflowRevisionId: "rev",
      created: false,
    }),
  },
});
describe("child call telemetry", () => {
  it("captures only opted-in content and omits oversized results", () => {
    expect(workflowCallContent(undefined, "input", { secret: 1 })).toEqual({});
    expect(
      workflowCallContent({ captureContent: false }, "output", {}),
    ).toEqual({});
    expect(
      workflowCallContent({ captureContent: { input: true } }, "output", {}),
    ).toEqual({});
    expect(
      workflowCallContent({ captureContent: { input: true } }, "input", {
        topic: "test",
      }),
    ).toEqual({ input: { topic: "test" } });
    expect(
      workflowCallContent({ captureContent: true }, "output", { answer: "ok" }),
    ).toEqual({ output: { answer: "ok" } });
    expect(
      workflowCallContent(
        { captureContent: true },
        "output",
        "x".repeat(16385),
      ),
    ).toHaveProperty("outputOmitted");
    expect(
      workflowCallContent({ captureContent: true }, "output", undefined),
    ).toHaveProperty("outputOmitted");
  });
  it("never breaks execution when a reporter or trace adapter fails", async () => {
    for (const partial of [
      undefined,
      {},
      { reporter: config().reporter },
      { ...config(), environment: undefined },
      { ...config(), service: undefined },
      { ...config(), correlation: {} },
      { ...config(), correlation: { runId: "run" } },
    ])
      expect(() =>
        emitWorkflowCall(partial, "workflow.call.started", {}),
      ).not.toThrow();
    emitWorkflowCall(
      config(
        vi.fn(() => {
          throw new Error("offline");
        }),
      ),
      "workflow.call.started",
      {},
    );
    emitWorkflowCall(
      config(
        vi.fn(async () => {
          throw new Error("offline");
        }),
      ),
      "workflow.call.started",
      {},
    );
    const emit = vi.fn(async () => {});
    emitWorkflowCall(
      {
        ...config(emit),
        trace: {
          startSpan: () => undefined,
          getActiveContext: () => ({ traceId: "trace", spanId: "span" }),
        },
      },
      "workflow.call.completed",
      { output: { answer: "ok" } },
    );
    expect(emit).toHaveBeenCalledWith([
      expect.objectContaining({
        correlation: expect.objectContaining({
          traceId: "trace",
          spanId: "span",
        }),
        payload: { output: { answer: "ok" } },
      }),
    ]);
    expect(() =>
      emitWorkflowCall(
        {
          ...config(),
          trace: {
            startSpan: () => undefined,
            getActiveContext: () => {
              throw new Error("offline");
            },
          },
        },
        "workflow.call.started",
        {},
      ),
    ).not.toThrow();
    await Promise.resolve();
  });
});
