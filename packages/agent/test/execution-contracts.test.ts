import type { GraphState } from "@kortyx/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseExecutionInput,
  validateExecutionOutput,
} from "../src/execution/contracts";

const workflow = { id: "root", version: "1", nodes: {}, edges: [] };
const state: GraphState = {
  input: "x",
  currentWorkflow: "root",
  config: { executionContract: { id: "root", version: "1" } },
  runtime: {},
  lastNode: "__start__",
  awaitingHumanInput: false,
  conversationHistory: [],
};
describe("execution contract validation", () => {
  it("validates JSON and serializes arbitrary transform errors", async () => {
    expect(parseExecutionInput(workflow, "x")).toBe("x");
    expect(() =>
      parseExecutionInput(
        {
          ...workflow,
          inputSchema: z.string().transform(() => {
            throw "bad transform";
          }),
        },
        "x",
      ),
    ).toThrow("bad transform");
    await expect(
      validateExecutionOutput(state, async () => ({
        ...workflow,
        outputSchema: z.object({}).transform(() => {
          throw "bad output";
        }),
      })),
    ).rejects.toThrow("bad output");
    await expect(
      validateExecutionOutput(state, async () => workflow),
    ).resolves.toMatchObject({ data: {} });
  });
  it("rejects stale or missing root definitions on completion", async () => {
    await expect(
      validateExecutionOutput(state, async () => ({
        ...workflow,
        version: "2",
      })),
    ).rejects.toThrow("changed");
    await expect(
      validateExecutionOutput(state, async () => ({
        ...workflow,
        id: "fallback",
      })),
    ).rejects.toThrow("changed");
  });
});

it("keeps the result envelope serializable and omits absent usage", async () => {
  const { resultFromOutcome } = await import("../src/execution/execute");
  const { createInMemoryFrameworkAdapter, makeRequestId } = await import(
    "@kortyx/runtime"
  );
  const failed = resultFromOutcome(
    { state, error: "failure" },
    "run",
    "session",
  );
  expect(failed).toMatchObject({
    status: "failed",
    error: { message: "failure" },
  });
  expect(failed).not.toHaveProperty("usage");
  expect(resultFromOutcome({ state }, "run", "session")).toMatchObject({
    status: "completed",
    data: {},
  });
  const pending = {
    token: "private",
    requestId: makeRequestId("human"),
    runId: "run",
    workflow: "root",
    node: "ask",
    schema: { kind: "text" as const, multiple: false },
    options: [],
    createdAt: Date.now(),
    ttlMs: 1000,
  };
  expect(resultFromOutcome({ state, pending }, "run", "session")).toMatchObject(
    { status: "suspended", interrupt: { input: { meta: {}, options: [] } } },
  );
  const { resumeWorkflow } = await import("../src/execution/execute");
  const root = {
    ...workflow,
    inputSchema: z.string(),
    outputSchema: z.object({}),
  };
  const services = {
    registry: {
      select: async () => root,
      get: async () => root,
      list: async () => [root],
    },
    frameworkAdapter: createInMemoryFrameworkAdapter(),
    getProvider: () => {
      throw new Error("unused");
    },
  };
  const resume = {
    token: "private",
    requestId: pending.requestId,
    runId: "run",
    sessionId: "session",
  };
  await services.frameworkAdapter.pendingRequests.save({
    ...pending,
    state: { ...state, config: {} },
  });
  // A legacy pause has no stored entry contract. Identity still comes from the pending record.
  services.frameworkAdapter.pendingRequests.take = async () => {
    throw "store unavailable";
  };
  await expect(
    resumeWorkflow(services, {
      workflow: root,
      resume,
      response: { type: "text", text: "yes" },
    }),
  ).rejects.toThrow("store unavailable");
  const unavailable = {
    ...services,
    frameworkAdapter: {
      ...services.frameworkAdapter,
      pendingRequests: undefined,
    } as unknown as typeof services.frameworkAdapter,
  };
  await expect(
    resumeWorkflow(unavailable, {
      workflow: root,
      resume,
      response: { type: "text", text: "yes" },
    }),
  ).rejects.toThrow("No waiting execution");
});
