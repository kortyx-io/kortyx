import { ProviderRequestError, serializeFailure } from "@kortyx/core/errors";
import type { KortyxPromptMessage, KortyxToolCall } from "@kortyx/providers";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  defineInterruptContract,
  defineOutputContract,
  runWithHookContext,
  useReason,
} from "../src";
import { createNode, createProvider, createState } from "./helpers";

const answer = defineOutputContract({
  description: "Return the analysis.",
  schemaId: "test.answer",
  schemaVersion: "1",
  schema: z.object({ summary: z.string() }),
});
const liveAnswer = defineOutputContract({
  ...answer,
  stream: { fields: { summary: "text-delta" } },
});
const question = defineInterruptContract({
  description: "Ask for a choice.",
  schemaId: "test.choice",
  schemaVersion: "1",
  requestSchema: z.object({ question: z.string() }),
  responseSchema: z.object({ choice: z.string() }),
});
const call = (
  id: string,
  name: string,
  input: unknown = {},
): KortyxToolCall => ({ id, name, input });
const summaryCall = (
  id: string,
  name: string,
  summary = "Draft without evidence",
) => call(id, name, { summary });
const continuation = {
  providerId: "mock",
  api: "test",
  items: [{ opaque: "preserve-me" }],
};
const messagesFor = (mock: { mock: { calls: unknown[][] } }, index: number) =>
  mock.mock.calls[index]?.[0] as KortyxPromptMessage[];
const checkpointFrom = (error: Error) =>
  JSON.parse(
    JSON.stringify(
      (error as Error & { __kortyxHookStatePatch?: unknown })
        .__kortyxHookStatePatch,
    ),
  );

// Every requested call must have exactly one result before the next provider pass.
function expectCompleteHistory(messages: KortyxPromptMessage[]) {
  let outstanding = new Set<string>();
  for (const message of messages) {
    if (message.role === "tool") {
      expect(outstanding.has(message.toolCallId ?? "")).toBe(true);
      outstanding.delete(message.toolCallId ?? "");
    } else {
      expect([...outstanding]).toEqual([]);
      outstanding = new Set(message.toolCalls?.map((entry) => entry.id));
    }
  }
  expect([...outstanding]).toEqual([]);
}

describe("mixed tools, outputs, and interrupts", () => {
  it("streams multiple outputs after multiple domain results, with the terminal output last", async () => {
    const { modelRef, provider, invoke, stream } = createProvider();
    provider.getModel.mockImplementation(() => ({
      invoke,
      stream,
      supportsToolStreaming: true,
    }));
    const toolCalls = [
      call("return", "kortyx_stream_return__answer", {
        instruction: "Summarize the evidence.",
      }),
      call("read", "read_evaluation"),
      call("list", "list_job_candidates"),
      call("card", "kortyx_stream_emit__card", {
        instruction: "Show the evidence.",
      }),
    ];
    stream
      .mockImplementationOnce(async function* () {
        yield {
          type: "finish",
          toolCalls,
          continuation,
          usage: { input: 2, output: 3, total: 5 },
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "text-delta", delta: '{"summary":"Verified evidence"}' };
        yield { type: "finish", usage: { input: 3, output: 4, total: 7 } };
      })
      .mockImplementationOnce(async function* () {
        yield {
          type: "text-delta",
          delta: '{"summary":"Evidence-based final answer"}',
        };
        yield { type: "finish", usage: { input: 4, output: 5, total: 9 } };
      });
    const { node, emitted } = createNode();
    const read = vi.fn(async () => {
      expect(
        emitted.filter((event) => event.event === "structured_data"),
      ).toEqual([]);
      return { verdict: "verified" };
    });
    const list = vi.fn(async () => {
      expect(
        emitted.filter((event) => event.event === "structured_data"),
      ).toEqual([]);
      return { candidates: ["candidate-1"] };
    });
    const { result } = await runWithHookContext(
      { node, state: createState() },
      () =>
        useReason({
          model: modelRef,
          input: "Analyze",
          stream: true,
          tools: [
            { name: "read_evaluation", inputSchema: {}, execute: read },
            { name: "list_job_candidates", inputSchema: {}, execute: list },
          ],
          outputs: {
            emit: { card: liveAnswer },
            return: { answer: liveAnswer },
          },
          toolExecution: { maxSteps: 3 },
        }),
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(3);
    expect(result.returned?.data).toEqual({
      summary: "Evidence-based final answer",
    });
    expect(result.emissions?.map((entry) => entry.data)).toEqual([
      { summary: "Verified evidence" },
    ]);
    expect(result.steps?.map((entry) => entry.stepIndex)).toEqual([0, 1, 2]);
    expect(result.usage).toMatchObject({ input: 9, output: 12, total: 21 });
    for (const index of [1, 2]) {
      const messages = messagesFor(stream, index);
      expectCompleteHistory(messages);
      expect(messages).toContainEqual(
        expect.objectContaining({ role: "assistant", toolCalls, continuation }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({
          role: "tool",
          name: "read_evaluation",
          content: '{"verdict":"verified"}',
        }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({
          role: "tool",
          name: "list_job_candidates",
          content: '{"candidates":["candidate-1"]}',
        }),
      );
    }
    expect(
      result.steps?.[0]?.toolResults.map((entry) => entry.toolCallId),
    ).toEqual(["read", "list", "card", "return"]);
  });

  it("allows multiple direct emissions and a return in one pass", async () => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            summaryCall("return", "kortyx_return__answer", "Done"),
            summaryCall("first", "kortyx_emit__card", "First"),
            summaryCall("second", "kortyx_emit__card", "Second"),
          ],
        },
      ],
    });
    const { node, emitted } = createNode();
    const { result } = await runWithHookContext(
      { node, state: createState() },
      () =>
        useReason({
          model: modelRef,
          input: "Show cards",
          stream: false,
          outputs: { emit: { card: answer }, return: { answer } },
          toolExecution: { maxSteps: 1 },
        }),
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.emissions?.map((entry) => entry.data.summary)).toEqual([
      "First",
      "Second",
    ]);
    expect(result.returned?.data.summary).toBe("Done");
    expect(
      emitted
        .filter((entry) => entry.event === "structured_data")
        .map((entry) => (entry.payload as { data: unknown }).data),
    ).toEqual([
      { summary: "First" },
      { summary: "Second" },
      { summary: "Done" },
    ]);
  });

  it("resumes multiple interrupts within a mixed turn without replaying mutations or publishing stale drafts", async () => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "",
          continuation,
          toolCalls: [
            summaryCall("return", "kortyx_return__answer"),
            call("mutate-1", "save_record"),
            call("ask-1", "kortyx_request_input__question", {
              question: "First choice?",
            }),
            call("mutate-2", "save_record"),
            call("ask-2", "kortyx_request_input__question", {
              question: "Second choice?",
            }),
            summaryCall("card", "kortyx_emit__card"),
          ],
        },
        { content: '{"summary":"Both choices received"}' },
        { content: '{"summary":"Completed using both choices"}' },
      ],
    });
    const mutate = vi.fn(async () => ({ saved: true }));
    const run = () =>
      useReason({
        id: "mixed",
        model: modelRef,
        input: "Save and ask",
        stream: false,
        tools: [{ name: "save_record", inputSchema: {}, execute: mutate }],
        outputs: { emit: { card: answer }, return: { answer } },
        interrupts: { contracts: { question }, maxRequests: 2 },
        toolExecution: { maxSteps: 3 },
      });
    const pause1 = new Error("pause one");
    const first = createNode({
      onInterrupt: () => {
        throw pause1;
      },
    });
    await expect(
      runWithHookContext({ node: first.node, state: createState() }, run),
    ).rejects.toBe(pause1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(first.emitted).toEqual([]);
    const pause2 = new Error("pause two");
    const second = createNode({
      onInterrupt: (request) => {
        if (request.question === "First choice?") return { choice: "A" };
        throw pause2;
      },
    });
    await expect(
      runWithHookContext(
        { node: second.node, state: createState(checkpointFrom(pause1)) },
        run,
      ),
    ).rejects.toBe(pause2);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(second.emitted).toEqual([]);
    const third = createNode({ interruptResponse: { choice: "B" } });
    const pauseAfterCompletion = new Error("pause after useReason");
    await expect(
      runWithHookContext(
        { node: third.node, state: createState(checkpointFrom(pause2)) },
        async () => {
          const result = await run();
          expect(result.returned?.data.summary).toBe(
            "Completed using both choices",
          );
          expect(
            result.interruptHistory?.map((entry) => entry.response),
          ).toEqual([{ choice: "A" }, { choice: "B" }]);
          throw pauseAfterCompletion;
        },
      ),
    ).rejects.toBe(pauseAfterCompletion);
    expect(third.interrupts).toHaveLength(1);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(3);
    for (const index of [1, 2]) {
      const messages = messagesFor(invoke, index);
      expectCompleteHistory(messages);
      expect(messages).toContainEqual(
        expect.objectContaining({ continuation }),
      );
      expect(
        messages
          .filter((entry) => entry.name === "kortyx_request_input__question")
          .map((entry) => entry.content),
      ).toEqual(['{"choice":"A"}', '{"choice":"B"}']);
    }
    const replay = createNode();
    const { result } = await runWithHookContext(
      {
        node: replay.node,
        state: createState(checkpointFrom(pauseAfterCompletion)),
      },
      run,
    );
    expect(result.returned?.data.summary).toBe("Completed using both choices");
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(replay.interrupts).toEqual([]);
    expect(replay.emitted).toEqual([]);
  });

  it("publishes an emission before an interrupt and resumes the rest of the same turn", async () => {
    const { modelRef, invoke, stream } = createProvider({
      invokeResponses: [
        {
          content: "",
          continuation,
          toolCalls: [
            call("first-card", "kortyx_stream_emit__card", {
              instruction: "Show the choices.",
            }),
            summaryCall("return", "kortyx_return__answer"),
            call("save", "save_record"),
            call("ask", "kortyx_request_input__question", {
              question: "Choose a card?",
            }),
            call("second-card", "kortyx_stream_emit__card", {
              instruction: "Show the choice.",
            }),
          ],
        },
        { content: '{"summary":"Final choice A"}' },
      ],
    });
    stream
      .mockImplementationOnce(async function* () {
        yield { type: "text-delta", delta: '{"summary":"Choices A and B"}' };
      })
      .mockImplementationOnce(async function* () {
        yield { type: "text-delta", delta: '{"summary":"Selected A"}' };
      });
    const execute = vi.fn(async () => ({ saved: true }));
    const run = () =>
      useReason({
        model: modelRef,
        input: "Choose",
        stream: true,
        tools: [{ name: "save_record", inputSchema: {}, execute }],
        outputs: { emit: { card: liveAnswer }, return: { answer } },
        interrupts: { contracts: { question } },
        toolExecution: { maxSteps: 4 },
      });
    const paused = new Error("waiting for choice");
    const first = createNode({
      onInterrupt: () => {
        expect(first.emitted).toContainEqual(
          expect.objectContaining({
            event: "structured_data",
            payload: expect.objectContaining({
              kind: "final",
              data: { summary: "Choices A and B" },
            }),
          }),
        );
        throw paused;
      },
    });
    await expect(
      runWithHookContext({ node: first.node, state: createState() }, run),
    ).rejects.toBe(paused);
    expect(execute).toHaveBeenCalledTimes(1);
    expectCompleteHistory(messagesFor(stream, 0));
    const resumed = createNode({ interruptResponse: { choice: "A" } });
    const { result } = await runWithHookContext(
      { node: resumed.node, state: createState(checkpointFrom(paused)) },
      run,
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.steps?.map((step) => step.stepIndex)).toEqual([0, 1, 2, 3]);
    expect(result.emissions?.map((entry) => entry.data.summary)).toEqual([
      "Choices A and B",
      "Selected A",
    ]);
    expect(result.returned?.data.summary).toBe("Final choice A");
    expect(
      resumed.emitted
        .filter(
          (entry) =>
            entry.event === "structured_data" &&
            (entry.payload as { kind: string }).kind === "final",
        )
        .map((entry) => (entry.payload as { data: unknown }).data),
    ).toEqual([{ summary: "Selected A" }, { summary: "Final choice A" }]);
    expectCompleteHistory(messagesFor(stream, 1));
    expectCompleteHistory(messagesFor(invoke, 1));
  });

  it.each([
    3, 4,
  ])("counts failed output generation on resume with maxSteps %s and preserves completed calls", async (maxSteps) => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            call("save", "save_record"),
            summaryCall("card", "kortyx_emit__card"),
            summaryCall("return", "kortyx_return__answer"),
          ],
        },
        { content: '{"summary":"Saved"}' },
        { content: "invalid JSON" },
        { content: '{"summary":"Finished"}' },
      ],
    });
    const execute = vi.fn(async () => ({ saved: true }));
    const run = () =>
      useReason({
        model: modelRef,
        input: "Save",
        stream: false,
        tools: [{ name: "save_record", inputSchema: {}, execute }],
        outputs: { emit: { card: answer }, return: { answer } },
        toolExecution: { maxSteps },
      });
    const first = createNode();
    const error = await runWithHookContext(
      { node: first.node, state: createState() },
      run,
    ).catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(invoke).toHaveBeenCalledTimes(3);
    const resumed = createNode();
    const running = runWithHookContext(
      {
        node: resumed.node,
        state: createState(checkpointFrom(error as Error)),
      },
      run,
    );
    if (maxSteps === 3) {
      await expect(running).rejects.toMatchObject({
        code: "REASON_OUTPUT_BUDGET_EXHAUSTED",
      });
      expect(invoke).toHaveBeenCalledTimes(3);
      expect(resumed.emitted).toEqual([]);
    } else {
      const { result } = await running;
      expect(result.emissions).toHaveLength(1);
      expect(result.returned?.data.summary).toBe("Finished");
      expect(result.steps).toHaveLength(4);
      expect(invoke).toHaveBeenCalledTimes(4);
      expect(
        resumed.emitted.filter((entry) => entry.event === "structured_data"),
      ).toHaveLength(1);
      expectCompleteHistory(messagesFor(invoke, 3));
    }
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    "approve",
    "deny",
  ])("preserves tool approval (%s) in a mixed turn", async (decision) => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            summaryCall("return", "kortyx_return__answer"),
            call("save", "save_record"),
          ],
        },
        {
          content: JSON.stringify({
            summary: decision === "approve" ? "Saved" : "Not saved",
          }),
        },
      ],
    });
    const execute = vi.fn(async () => ({ saved: true }));
    const { node, interrupts } = createNode({ interruptResponse: decision });
    const { result } = await runWithHookContext(
      { node, state: createState() },
      () =>
        useReason({
          model: modelRef,
          input: "Save",
          stream: false,
          tools: [{ name: "save_record", inputSchema: {}, execute }],
          outputs: { return: { answer } },
          toolExecution: { approval: true, maxSteps: 2 },
        }),
    );
    expect(interrupts).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(decision === "approve" ? 1 : 0);
    expect(result.returned?.data.summary).toBe(
      decision === "approve" ? "Saved" : "Not saved",
    );
    expectCompleteHistory(messagesFor(invoke, 1));
  });

  it("corrects conflicting terminal returns without replaying domain calls", async () => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            call("save", "save_record"),
            summaryCall("a", "kortyx_return__answer"),
            summaryCall("b", "kortyx_return__answer"),
          ],
        },
        {
          content: "",
          toolCalls: [
            summaryCall("selected", "kortyx_return__answer", "Selected"),
          ],
        },
      ],
    });
    const execute = vi.fn(async () => ({ saved: true }));
    const { node } = createNode();
    const { result } = await runWithHookContext(
      { node, state: createState() },
      () =>
        useReason({
          model: modelRef,
          input: "Save",
          stream: false,
          tools: [{ name: "save_record", inputSchema: {}, execute }],
          outputs: { return: { answer } },
          toolExecution: { maxSteps: 2 },
        }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.returned?.data.summary).toBe("Selected");
    expect(
      result.steps?.[0]?.toolResults.filter((entry) => entry.isError),
    ).toHaveLength(2);
    expectCompleteHistory(messagesFor(invoke, 1));
  });

  it("bounds conflicting-return correction and preserves the exhausted budget on resume", async () => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [0, 1].map((index) => ({
        content: "",
        toolCalls: [
          summaryCall(`a-${index}`, "kortyx_return__answer"),
          summaryCall(`b-${index}`, "kortyx_return__answer"),
        ],
      })),
    });
    const { node, emitted } = createNode();
    const run = () =>
      useReason({
        model: modelRef,
        input: "Analyze",
        outputs: { return: { answer } },
        toolExecution: { maxSteps: 2 },
      });
    const error = await runWithHookContext(
      { node, state: createState() },
      run,
    ).catch((error: Error) => error);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(serializeFailure(error)).toMatchObject({
      code: "REASON_OUTPUT_CONTRACT_CORRECTION_EXHAUSTED",
      retryable: false,
      message: expect.stringContaining("Select exactly one terminal"),
      details: { maxSteps: 2, outputContractCorrections: 2 },
    });
    await expect(
      runWithHookContext(
        { node, state: createState(checkpointFrom(error as Error)) },
        run,
      ),
    ).rejects.toMatchObject({
      code: "REASON_OUTPUT_CONTRACT_CORRECTION_EXHAUSTED",
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([]);
  });

  it("reports an actionable budget failure before publishing a mixed-turn draft", async () => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            call("read", "read_evaluation"),
            summaryCall("return", "kortyx_return__answer"),
          ],
        },
      ],
    });
    const execute = vi.fn(async () => ({ evidence: "verified" }));
    const { node, emitted } = createNode();
    const run = () =>
      useReason({
        model: modelRef,
        input: "Analyze",
        tools: [{ name: "read_evaluation", inputSchema: {}, execute }],
        outputs: { return: { answer } },
        toolExecution: { maxSteps: 1 },
      });
    const error = await runWithHookContext(
      { node, state: createState() },
      run,
    ).catch((error: Error) => error);
    expect(serializeFailure(error)).toMatchObject({
      code: "REASON_OUTPUT_BUDGET_EXHAUSTED",
      message: expect.stringContaining("Increase maxSteps"),
      retryable: false,
    });
    await expect(
      runWithHookContext(
        { node, state: createState(checkpointFrom(error as Error)) },
        run,
      ),
    ).rejects.toMatchObject({ code: "REASON_OUTPUT_BUDGET_EXHAUSTED" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([]);
  });
});
