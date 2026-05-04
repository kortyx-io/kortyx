import { describe, expect, it } from "vitest";
import {
  defineWorkflow,
  loadWorkflow,
  parseGraphState,
  parseNodeConfig,
  parseNodeContext,
  parseNodeResult,
  validateWorkflow,
} from "../src";

const validWorkflow = {
  id: "support-routing",
  version: "1.0.0",
  nodes: {
    start: {
      run: "startNode",
      params: { queue: "support" },
      behavior: {
        retry: { maxAttempts: 2, delayMs: 5 },
        onError: { mode: "emit-and-stop" },
      },
    },
  },
  edges: [
    ["__start__", "start"],
    ["start", "__end__", { when: "done" }],
  ],
};

describe("workflow validation", () => {
  it("accepts the supported workflow shape", () => {
    const result = validateWorkflow(validWorkflow);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.start?.params).toEqual({ queue: "support" });
      expect(result.value.edges[1]).toEqual([
        "start",
        "__end__",
        { when: "done" },
      ]);
    }
  });

  it("returns structured errors instead of throwing for invalid workflows", () => {
    const result = validateWorkflow({
      ...validWorkflow,
      nodes: {
        start: {
          run: "startNode",
          unsupported: true,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({
        path: ["nodes", "start"],
        code: "unrecognized_keys",
      });
    }
  });

  it("defineWorkflow throws for invalid definitions", () => {
    expect(() =>
      defineWorkflow({
        ...validWorkflow,
        edges: [["__start__"]],
      } as never),
    ).toThrow();
  });
});

describe("workflow loading", () => {
  it("loads JSON workflow text, buffers, and objects", () => {
    const json = JSON.stringify(validWorkflow);

    expect(loadWorkflow(json)).toMatchObject({
      id: "support-routing",
      version: "1.0.0",
    });
    expect(loadWorkflow(Buffer.from(json))).toMatchObject({
      id: "support-routing",
    });
    expect(loadWorkflow(validWorkflow)).toMatchObject({
      id: "support-routing",
    });
  });

  it("rejects empty workflow text through the workflow schema", () => {
    expect(() => loadWorkflow("   ")).toThrow();
  });
});

describe("node schemas", () => {
  it("parses supported node config, context, result, and graph state shapes", () => {
    const emit = () => {};
    const error = () => {};
    const awaitInterrupt = () => "accepted";
    const speak = async () => "spoken";

    expect(
      parseNodeConfig({
        model: { provider: "openai", name: "gpt-5.4", temperature: 0.3 },
        behavior: { checkpoint: true, retry: { maxAttempts: 1 } },
      }),
    ).toMatchObject({
      model: { provider: "openai", name: "gpt-5.4" },
      behavior: { checkpoint: true },
    });

    expect(
      parseNodeContext({
        graph: { name: "support", node: "start" },
        config: {},
        emit,
        error,
        awaitInterrupt,
        speak,
      }),
    ).toMatchObject({
      graph: { name: "support", node: "start" },
    });

    expect(
      parseNodeResult({
        infra: { checkpoint: true, debug: { trace: "t1" } },
        data: { answer: 42 },
        ui: { message: "done", structured: { ok: true } },
        transitionTo: "next-workflow",
      }),
    ).toMatchObject({
      data: { answer: 42 },
      ui: { structured: { ok: true } },
      transitionTo: "next-workflow",
    });

    expect(
      parseGraphState({
        input: { message: "hello" },
        currentWorkflow: "support-routing",
        config: {},
        runtime: {
          requestedWorkflow: "support-routing",
          checkpoints: {
            start: {
              id: "cp1",
              nodeId: "start",
              timestamp: 1,
              snapshot: {},
            },
          },
          tokenUsage: { input: 1, output: 2, total: 3 },
        },
        ui: { message: "visible" },
      }),
    ).toMatchObject({
      lastNode: "__start__",
      awaitingHumanInput: false,
      conversationHistory: [],
    });
  });

  it("rejects invalid model temperature and empty workflow transitions", () => {
    expect(() =>
      parseNodeConfig({
        model: { provider: "openai", name: "gpt-5.4", temperature: 3 },
      }),
    ).toThrow();

    expect(() => parseNodeResult({ transitionTo: "" })).toThrow();
    expect(() =>
      parseNodeContext({
        graph: { name: "support", node: "start" },
        config: {},
        emit: "not-a-function",
        error: () => {},
        awaitInterrupt: () => "ok",
        speak: async () => "ok",
      }),
    ).toThrow();
  });
});
