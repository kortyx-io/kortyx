// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { defineWorkflow } from "@kortyx/core";
import {
  defineInterruptContract,
  defineOutputContract,
  useInterrupt,
  useReason,
} from "@kortyx/hooks";
import {
  createInMemoryFrameworkAdapter,
  createPostgresFrameworkAdapter,
  createRedisFrameworkAdapter,
} from "@kortyx/runtime";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";

for (const backend of [
  "memory",
  ...(process.env.KORTYX_TEST_REDIS_URL ? ["redis"] : []),
  ...(process.env.KORTYX_TEST_POSTGRES_URL ? ["postgres"] : []),
]) {
  it(`repairs output after Continue and preserves a completed write across human replay (${backend})`, async () => {
    const save = vi.fn(async () => ({ recordId: "saved-record" }));
    const replies = [
      { content: "", toolCalls: [{ id: "save", name: "save", input: {} }] },
      {
        content: "",
        toolCalls: [
          {
            id: "ask",
            name: "kortyx_request_input__ask",
            input: { question: "Continue?" },
          },
        ],
      },
      {
        content: "",
        toolCalls: [
          {
            id: "invalid",
            name: "kortyx_return__answer",
            input: { version: "v1" },
          },
        ],
      },
      { content: '{"version":"v2"}' },
    ];
    const invoke = vi.fn(async () => {
      const next = replies.shift();
      if (!next) throw new Error("Unexpected replayed model call");
      return next;
    });
    const provider = {
      id: "script",
      models: ["script"],
      getModel: () => ({
        invoke,
        stream: async function* () {
          yield { type: "text-delta" as const, delta: "" };
        },
      }),
    };
    const ask = defineInterruptContract({
      description: "Ask whether to continue",
      schemaId: "test.ask",
      schemaVersion: "1",
      requestSchema: z.object({ question: z.string() }),
      responseSchema: z.object({ answer: z.string() }),
    });
    const answer = defineOutputContract({
      description: "Return a preview",
      schemaId: "test.preview",
      schemaVersion: "2",
      schema: z.object({ version: z.literal("v2") }),
    });
    const root = defineWorkflow({
      id: "schema-recovery",
      version: "1",
      inputSchema: z.object({}),
      outputSchema: z.object({ version: z.literal("v2") }),
      nodes: {
        run: {
          run: async () => {
            const result = await useReason({
              id: "save-and-preview",
              model: { provider, modelId: "script" },
              input: "Save and show preview",
              stream: false,
              tools: [{ name: "save", inputSchema: {}, execute: save }],
              interrupts: { contracts: { ask } },
              outputs: { return: { answer } },
              toolExecution: { maxSteps: 6 },
            });
            await useInterrupt({
              id: "review",
              request: { kind: "text", question: "Review completed preview?" },
            });
            return { data: result.returned?.data };
          },
        },
      },
      edges: [
        ["__start__", "run"],
        ["run", "__end__"],
      ],
    });
    const namespace = `schema-recovery:${crypto.randomUUID()}:`;
    const create = () =>
      backend === "postgres"
        ? createPostgresFrameworkAdapter({
            connectionString: process.env.KORTYX_TEST_POSTGRES_URL ?? "",
            namespace,
          })
        : backend === "redis"
          ? createRedisFrameworkAdapter({
              url: process.env.KORTYX_TEST_REDIS_URL ?? "",
              prefix: namespace,
            })
          : createInMemoryFrameworkAdapter();
    let adapter = create();
    const agent = () =>
      createAgent({
        workflows: [root],
        frameworkAdapter: adapter,
        limits: { maxModelPasses: 3 },
      });
    const restart = async () => {
      if (backend !== "memory") {
        await adapter.close();
        adapter = create();
      }
    };
    try {
      if (backend === "postgres") await adapter.maintenance.setup();
      const human = await agent().execute({ workflow: root, input: {} });
      expect(human.status).toBe("suspended");
      if (human.status !== "suspended") throw new Error("Expected human pause");
      await restart();
      const stopped = await agent().resume({
        workflow: root,
        resume: human.resume,
        response: { type: "value", value: { answer: "yes" } },
      });
      expect(stopped).toMatchObject({
        status: "suspended",
        reason: "limit_reached",
      });
      if (stopped.status !== "suspended") throw new Error("Expected Continue");
      expect(save).toHaveBeenCalledTimes(1);
      await restart();
      const review = await agent().resume({
        workflow: root,
        resume: stopped.resume,
        response: { type: "select", ids: ["continue"] },
      });
      expect(review.status).toBe("suspended");
      if (review.status !== "suspended")
        throw new Error("Expected review pause");
      expect(review.interrupt.input).toMatchObject({
        kind: "text",
        question: "Review completed preview?",
      });
      expect(invoke).toHaveBeenCalledTimes(4);
      await restart();
      const completed = await agent().resume({
        workflow: root,
        resume: review.resume,
        response: { type: "text", text: "reviewed" },
      });
      expect(completed).toMatchObject({
        status: "completed",
        data: { version: "v2" },
      });
      expect(invoke).toHaveBeenCalledTimes(4);
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      await adapter.close();
    }
  });
}
