import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineOutputContract, runWithHookContext, useReason } from "../src";
import { createNode, createProvider, createState } from "./helpers";

const completed = defineOutputContract({
  description: "Return the final result",
  schemaId: "test.completed",
  schemaVersion: "1",
  schema: z.object({ summary: z.string() }),
});
const returned = {
  content: "",
  toolCalls: [
    {
      id: "finish",
      name: "kortyx_return__completed",
      input: { summary: "saved" },
    },
  ],
};
const run = (
  responses: Parameters<typeof createProvider>[0],
  extra: Record<string, unknown> = {},
) => {
  const provider = createProvider(responses);
  const { node } = createNode();
  return {
    ...provider,
    result: runWithHookContext({ node, state: createState() }, () =>
      useReason({
        model: provider.modelRef,
        input: "Save and finish",
        stream: false,
        outputs: { return: { completed } },
        ...extra,
      }),
    ),
  };
};
describe("terminal output failure and bounded correction", () => {
  it("reports missing terminal output as a stable validation failure", async () => {
    const { result } = run({ invokeResponses: [{ content: "Done" }] });
    await expect(result).rejects.toMatchObject({
      code: "REASON_TERMINAL_OUTPUT_MISSING",
      failure: {
        code: "REASON_TERMINAL_OUTPUT_MISSING",
        category: "validation",
        retryable: false,
      },
    });
  });
  it("corrects the return selection without replaying the completed save tool", async () => {
    const execute = vi.fn(() => "saved");
    const { result, invoke } = run(
      {
        invokeResponses: [
          { content: "", toolCalls: [{ id: "save", name: "save", input: {} }] },
          { content: "Done" },
          returned,
        ],
      },
      {
        tools: [{ name: "save", inputSchema: {}, execute }],
        toolExecution: { maxSteps: 4, missingReturnCorrections: 1 },
      },
    );
    expect((await result).result.returned).toEqual({
      contract: "completed",
      data: { summary: "saved" },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(3);
  });
  it("rejects attempts to rerun business tools during return correction", async () => {
    const execute = vi.fn(() => "saved");
    const { result } = run(
      {
        invokeResponses: [
          { content: "Done" },
          {
            content: "",
            toolCalls: [{ id: "repeat", name: "save", input: {} }],
          },
        ],
      },
      {
        tools: [{ name: "save", inputSchema: {}, execute }],
        toolExecution: { maxSteps: 3, missingReturnCorrections: 1 },
      },
    );
    await expect(result).rejects.toMatchObject({
      code: "REASON_OUTPUT_CORRECTION_TOOL_DISALLOWED",
    });
    expect(execute).not.toHaveBeenCalled();
  });
  it("honors the correction count and shared model-pass budget", async () => {
    const counted = run(
      { invokeResponses: [{ content: "Done" }, { content: "Still done" }] },
      { toolExecution: { maxSteps: 3, missingReturnCorrections: 1 } },
    );
    await expect(counted.result).rejects.toMatchObject({
      code: "REASON_TERMINAL_OUTPUT_MISSING",
      failure: { details: { missingReturnAttempts: 1 } },
    });
    expect(counted.invoke).toHaveBeenCalledTimes(2);
    const exhausted = run(
      { invokeResponses: [{ content: "Done" }] },
      { toolExecution: { maxSteps: 1, missingReturnCorrections: 1 } },
    );
    await expect(exhausted.result).rejects.toMatchObject({
      code: "REASON_OUTPUT_CONTRACT_CORRECTION_EXHAUSTED",
      failure: { category: "validation" },
    });
  });
  it.each([
    -1,
    1.5,
    Number.NaN,
  ])("rejects invalid correction budgets: %s", async (value) => {
    const { result, invoke } = run(
      { invokeResponses: [returned] },
      { toolExecution: { missingReturnCorrections: value } },
    );
    await expect(result).rejects.toMatchObject({
      code: "INVALID_REASON_CORRECTION_POLICY",
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

it("emits the exact native diagnostic reference for each handled tool failure", async () => {
  const { DomainError } = await import("@kortyx/core/errors");
  const first = new DomainError("FIRST", "First safe failure");
  const second = new DomainError("SECOND", "Second safe failure");
  const firstId = "997b4f9e-8307-4e6a-a142-a7a8492e4521";
  const secondId = "3bb072d0-7393-4cfe-9b19-bdd49b1299d9";
  const { node, emitted } = createNode();
  const provider = createProvider({
    invokeResponses: [
      {
        content: "",
        toolCalls: [
          { id: "a", name: "first", input: {} },
          { id: "b", name: "second", input: {} },
        ],
      },
      { content: "Recovered" },
    ],
  });
  await runWithHookContext(
    {
      node,
      state: createState(),
      reasonTrace: {
        startSpan: () => undefined,
        reportError: (error) => (error === first ? firstId : secondId),
      },
    },
    () =>
      useReason({
        model: provider.modelRef,
        input: "Recover",
        stream: false,
        toolExecution: { emit: true },
        tools: [
          {
            name: "first",
            inputSchema: {},
            execute: () => {
              throw first;
            },
          },
          {
            name: "second",
            inputSchema: {},
            execute: () => {
              throw second;
            },
          },
        ],
      }),
  );
  expect(
    emitted
      .filter((item) => item.event === "tool-call-error")
      .map((item) => item.payload),
  ).toMatchObject([
    {
      toolCallId: "a",
      diagnosticId: firstId,
      failure: { domainCode: "FIRST" },
    },
    {
      toolCallId: "b",
      diagnosticId: secondId,
      failure: { domainCode: "SECOND" },
    },
  ]);
});

it("keeps the correction budget and completed tools across checkpoint recovery", async () => {
  const execute = vi.fn(() => "saved");
  const state = createState();
  const first = createProvider({
    invokeResponses: [
      { content: "", toolCalls: [{ id: "save", name: "save", input: {} }] },
      { content: "Done" },
    ],
  });
  const options = {
    id: "recover-return",
    input: "Save and finish",
    stream: false,
    outputs: { return: { completed } },
    tools: [{ name: "save", inputSchema: {}, execute }],
    toolExecution: { maxSteps: 4, missingReturnCorrections: 1 },
  };
  await expect(
    runWithHookContext({ node: createNode().node, state }, () =>
      useReason({ ...options, model: first.modelRef }),
    ),
  ).rejects.toThrow();
  const resumed = createProvider({
    invokeResponses: [{ content: "Still done" }],
  });
  await expect(
    runWithHookContext({ node: createNode().node, state }, () =>
      useReason({ ...options, model: resumed.modelRef }),
    ),
  ).rejects.toMatchObject({
    code: "REASON_TERMINAL_OUTPUT_MISSING",
    failure: { details: { missingReturnAttempts: 1 } },
  });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(resumed.invoke).toHaveBeenCalledTimes(1);
});
