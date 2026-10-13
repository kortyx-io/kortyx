// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx server hooks run within workflow nodes.
import { defineWorkflow, type NodeResult } from "@kortyx/core";
import { completeResponse } from "@kortyx/hooks";
import type { FrameworkAdapter } from "@kortyx/runtime";
import { collectStream } from "@kortyx/stream";
import {
  createUsageTelemetry,
  type UsageRecord,
} from "@kortyx/usage-telemetry";
import { configureUsageTelemetry } from "@kortyx/usage-telemetry/node";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

const records: UsageRecord[] = [];
const telemetry = createUsageTelemetry({
  context: { product: "sdk", component: "agent", version: "1.0.0" },
  identity: () => crypto.randomUUID(),
  transport: async (batch) => {
    records.push(...batch);
  },
});
configureUsageTelemetry("agent", telemetry);
afterEach(() => {
  records.length = 0;
  vi.restoreAllMocks();
});
const workflow = (run: () => Promise<NodeResult>) =>
  defineWorkflow({
    id: "private-workflow-name",
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ answer: z.string() }),
    nodes: { run: { run } },
    edges: [
      ["__start__", "run"],
      ["run", "__end__"],
    ],
  });
it("preserves agent creation when optional telemetry metadata throws", async () => {
  const adapter = Object.defineProperty({}, "kind", {
    get() {
      throw new Error("private-metadata-error");
    },
  }) as FrameworkAdapter;
  const agent = createAgent({
    frameworkAdapter: adapter,
    workflows: [workflow(async () => ({ data: { answer: "private-output" } }))],
  });
  expect(
    (
      await agent.execute({
        workflow: "private-workflow-name",
        input: "private-input",
      })
    ).status,
  ).toBe("completed");
  await telemetry.flush();
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "sdk.initialize",
        outcome: "success",
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("private-");
});
it("records direct execution success and validation failure without workflow or input content", async () => {
  const agent = createAgent({
    workflows: [workflow(async () => ({ data: { answer: "private-output" } }))],
  });
  expect(
    (
      await agent.execute({
        workflow: "private-workflow-name",
        input: "private-input",
      })
    ).status,
  ).toBe("completed");
  await expect(
    agent.execute({ workflow: "private-workflow-name", input: 123 }),
  ).rejects.toBeDefined();
  await telemetry.flush();
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "sdk.execute",
        outcome: "success",
        count: 1,
      }),
      expect.objectContaining({
        operation: "sdk.execute",
        outcome: "failed",
        count: 1,
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("private-");
});
it("records a later execution failure separately from an already completed streamed response", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let completion!: Promise<void>;
  const agent = createAgent({
    workflows: [
      workflow(async () => {
        await completeResponse({ message: "private-answer" });
        await gate;
        throw new Error("private-error-message");
      }),
    ],
  });
  const chunks = await collectStream(
    await agent.streamChat([], {
      workflowId: "private-workflow-name",
      onExecution: (value) => {
        completion = value;
      },
    }),
  );
  release();
  await completion;
  await telemetry.flush();
  expect(chunks.filter((chunk) => chunk.type === "done")).toHaveLength(1);
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "sdk.chat.admission",
        outcome: "success",
      }),
      expect.objectContaining({
        operation: "sdk.response",
        outcome: "success",
      }),
      expect.objectContaining({
        operation: "sdk.execution",
        outcome: "failed",
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("private-");
  log.mockRestore();
});

it("measures an unmet eval postcondition as quality failure without collecting its content", async () => {
  const { createEvals } = await import("../src/evals/index");
  await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [
      {
        id: "private-suite-name",
        cases: [
          {
            id: "private-case-name",
            steps: [{ message: "private-input", expect: { type: "answer" } }],
          },
        ],
      },
    ],
    execute: () => ({
      observation: { type: "answer", text: "private-output", structured: [] },
    }),
    verify: () => ({
      passed: false,
      reason: "private-postcondition",
      evidence: ["private-evidence"],
    }),
  }).run({ suiteId: "private-suite-name" });
  await telemetry.flush();
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "sdk.eval",
        outcome: "quality_failed",
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("private-");
});

it("measures reducer registration and typed failures without collecting field names or values", async () => {
  const root = defineWorkflow({
    id: "private-reducer-workflow",
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ privateField: z.string() }),
    reduce: {
      privateField: () => {
        throw new Error("private-reducer-error");
      },
    },
    nodes: {
      write: { run: () => ({ data: { privateField: "private-value" } }) },
    },
    edges: [
      ["__start__", "write"],
      ["write", "__end__"],
    ],
  });
  const result = await createAgent({ workflows: [root] }).execute({
    workflow: root,
    input: "private-input",
  });
  expect(result.status).toBe("failed");
  await telemetry.flush();
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "sdk.registry",
        outcome: "success",
        count: 1,
        properties: { data_reducers: true },
      }),
      expect.objectContaining({
        operation: "sdk.execute",
        outcome: "failed",
        properties: expect.objectContaining({
          error_code: "WORKFLOW_REDUCER_FAILED",
          error_category: "workflow",
        }),
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("private");
});

it("does not count undefined reducer entries as configured adoption", async () => {
  const root = defineWorkflow({
    id: "unused-reducer",
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({ answer: z.string() }),
    reduce: { answer: undefined },
    nodes: { write: { run: () => ({ data: { answer: "value" } }) } },
    edges: [
      ["__start__", "write"],
      ["write", "__end__"],
    ],
  });
  expect(
    (
      await createAgent({ workflows: [root] }).execute({
        workflow: root,
        input: "start",
      })
    ).status,
  ).toBe("completed");
  await telemetry.flush();
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "sdk.registry",
        properties: { data_reducers: false },
      }),
    ]),
  );
});

it("keeps registry resolution usable when optional reducer metadata throws", async () => {
  const root = workflow(async () => ({ data: { answer: "value" } }));
  Object.defineProperty(root, "reduce", {
    get: () => {
      throw new Error("private-metadata-failure");
    },
  });
  const agent = createAgent({ workflows: [root] });
  expect(
    await agent.projectTopology?.({
      environment: "test",
      service: { name: "test" },
    }),
  ).toHaveLength(1);
  await telemetry.flush();
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "sdk.registry",
        outcome: "success",
        properties: {},
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("private-metadata-failure");
});
