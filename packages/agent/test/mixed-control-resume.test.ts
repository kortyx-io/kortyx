// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run in workflow nodes.
import { defineWorkflow } from "@kortyx/core";
import {
  defineInterruptContract,
  defineOutputContract,
  useInterrupt,
  useReason,
} from "@kortyx/hooks";
import type { KortyxInvokeResult } from "@kortyx/providers";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import type { ExecutionResult } from "../src/execution/types";

it.each([
  false,
  true,
])("preserves distinct mixed-turn responses through the real engine (parallel graph: %s)", async (parallelGraph) => {
  const contract = defineInterruptContract({
    description: "Ask a review question",
    schemaId: "test.review",
    schemaVersion: "1",
    requestSchema: z.object({ question: z.string() }),
    responseSchema: z.string(),
  });
  const answer = defineOutputContract({
    description: "Return the final answer",
    schemaId: "test.answer",
    schemaVersion: "1",
    schema: z.object({ summary: z.string() }),
  });
  const invoke = vi
    .fn<() => Promise<KortyxInvokeResult>>()
    .mockResolvedValueOnce({
      content: "",
      toolCalls: [
        {
          id: "return",
          name: "kortyx_return__answer",
          input: { summary: "stale draft" },
        },
        { id: "write", name: "record_check", input: {} },
        {
          id: "first",
          name: "kortyx_request_input__review",
          input: { question: "Rollout?" },
        },
        {
          id: "second",
          name: "kortyx_request_input__review",
          input: { question: "Notify?" },
        },
      ],
    })
    .mockResolvedValueOnce({ content: '{"summary":"defer and silent"}' });
  const provider = {
    id: "mock",
    models: ["mock"],
    getModel: () => ({ invoke, stream: async function* () {} }),
  };
  const execute = vi.fn(async () => ({ recorded: true }));
  const demo = defineWorkflow({
    id: `mixed-resume-${parallelGraph}`,
    version: "1",
    inputSchema: z.string(),
    outputSchema: z.object({
      before: z.string(),
      decisions: z.array(z.string()),
      summary: z.string(),
      after: z.string(),
      sibling: z.boolean().optional(),
    }),
    nodes: {
      mixed: {
        run: async () => {
          const before = await useInterrupt({
            id: "before",
            request: { kind: "text", question: "Before?" },
          });
          const result = await useReason({
            id: "mixed",
            input: "Review",
            model: { provider, modelId: "mock" },
            stream: false,
            tools: [{ name: "record_check", inputSchema: {}, execute }],
            interrupts: { contracts: { review: contract }, maxRequests: 2 },
            outputs: { return: { answer } },
            toolExecution: { approval: true, maxSteps: 2 },
          });
          const after = await useInterrupt({
            id: "after",
            request: { kind: "text", question: "After?" },
          });
          return {
            data: {
              before,
              decisions: result.interruptHistory?.map(
                (entry) => entry.response,
              ),
              summary: result.returned?.data.summary,
              after,
            },
          };
        },
      },
      sibling: { run: async () => ({ data: { sibling: true } }) },
    },
    edges: parallelGraph
      ? [
          ["__start__", "mixed"],
          ["__start__", "sibling"],
          ["mixed", "__end__"],
          ["sibling", "__end__"],
        ]
      : [
          ["__start__", "sibling"],
          ["sibling", "mixed"],
          ["mixed", "__end__"],
        ],
  });
  const frameworkAdapter = createInMemoryFrameworkAdapter();
  const make = () => createAgent({ workflows: [demo], frameworkAdapter });
  let result: ExecutionResult = await make().execute({
    workflow: demo,
    input: "go",
  });
  for (const [question, value] of [
    ["Before?", "before"],
    ["Approve record_check?", "approve"],
    ["Rollout?", "defer"],
    ["Notify?", "silent"],
    ["After?", "after"],
  ]) {
    expect(result.status, JSON.stringify(result)).toBe("suspended");
    if (result.status !== "suspended") throw new Error(JSON.stringify(result));
    expect(result.interrupt.input.question).toBe(question);
    result = await make().resume({
      workflow: demo,
      resume: result.resume,
      response:
        result.interrupt.input.kind === "custom"
          ? { type: "value", value }
          : result.interrupt.input.kind === "text"
            ? { type: "text", text: value ?? "" }
            : { type: "select", ids: [value ?? ""] },
    });
  }
  expect(result).toMatchObject({
    status: "completed",
    data: {
      before: "before",
      decisions: ["defer", "silent"],
      summary: "defer and silent",
      after: "after",
    },
  });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledTimes(2);
});
