// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx server hooks run within workflow nodes.
import { defineWorkflow, type NodeResult } from "@kortyx/core";
import { completeResponse } from "@kortyx/hooks";
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
