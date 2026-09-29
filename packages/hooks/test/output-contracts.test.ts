import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  defineInterruptContract,
  defineOutputContract,
  runWithHookContext,
  useReason,
  useStructuredData,
} from "../src";
import { createNode, createProvider, createState } from "./helpers";

const card = defineOutputContract({
  description: "Show matching accounts.",
  schemaId: "acme.account-card",
  schemaVersion: "1",
  schema: z.object({ accounts: z.array(z.string()) }),
});
const completed = defineOutputContract({
  description: "Return the account analysis.",
  schemaId: "acme.analysis",
  schemaVersion: "1",
  schema: z.object({ summary: z.string() }),
});
const rejected = defineOutputContract({
  description: "Return a rejection reason.",
  schemaId: "acme.rejection",
  schemaVersion: "1",
  schema: z.object({ reason: z.string() }),
});

describe("output contracts", () => {
  it("streams partial fields before final validation, then resumes assistant text", async () => {
    const liveCard = defineOutputContract({
      description: "Show a live account card.",
      schemaId: "acme.live-card",
      schemaVersion: "1",
      schema: z.object({ summary: z.string(), accounts: z.array(z.string()) }),
      stream: { fields: { summary: "text-delta", accounts: "append" } },
    });
    const { modelRef, invoke, stream } = createProvider({
      invokeResponses: [
        {
          content: "I found matches.",
          toolCalls: [
            {
              id: "stream-card",
              name: "kortyx_stream_emit__liveCard",
              input: { instruction: "Show A and B with a brief summary." },
            },
          ],
        },
        { content: "The first is most relevant." },
      ],
    });
    let releaseStream: (() => void) | undefined;
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    stream.mockImplementationOnce(async function* () {
      yield { type: "text-delta", delta: '{"summary":"He' } as const;
      await streamGate;
      yield {
        type: "text-delta",
        delta: 'llo","accounts":["A",',
      } as const;
      yield { type: "text-delta", delta: '"B"]}' } as const;
      yield { type: "finish", finishReason: { unified: "stop" } } as const;
    });
    const { node, emitted } = createNode();
    const running = runWithHookContext({ node, state: createState() }, () =>
      useReason({
        model: modelRef,
        input: "Find matching accounts",
        outputs: { emit: { liveCard } },
        toolExecution: { maxSteps: 3 },
      }),
    );
    await vi.waitFor(() =>
      expect(
        emitted.some(
          (entry) =>
            entry.event === "structured_data" &&
            (entry.payload as { kind: string }).kind === "text-delta",
        ),
      ).toBe(true),
    );
    expect(
      emitted.some(
        (entry) =>
          entry.event === "structured_data" &&
          (entry.payload as { kind: string }).kind === "final",
      ),
    ).toBe(false);
    releaseStream?.();
    const { result } = await running;
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(stream).toHaveBeenCalledTimes(1);
    const events = emitted.filter(
      (entry) =>
        entry.event === "text-delta" || entry.event === "structured_data",
    );
    expect(events.map((entry) => entry.event)).toEqual([
      "text-delta",
      "structured_data",
      "structured_data",
      "structured_data",
      "structured_data",
      "structured_data",
      "text-delta",
    ]);
    const chunks = events
      .filter((entry) => entry.event === "structured_data")
      .map((entry) => entry.payload as { kind: string; streamId: string });
    expect(chunks.map((chunk) => chunk.kind)).toEqual([
      "text-delta",
      "append",
      "text-delta",
      "append",
      "final",
    ]);
    expect(new Set(chunks.map((chunk) => chunk.streamId)).size).toBe(1);
    expect(result.emissions).toEqual([
      {
        contract: "liveCard",
        data: { summary: "Hello", accounts: ["A", "B"] },
      },
    ]);
    expect(result.text).toBe("I found matches.\nThe first is most relevant.");
    expect(result.steps?.map((step) => step.kind)).toEqual([
      undefined,
      "output",
      undefined,
    ]);
  });

  it("interleaves text, repeated structured emissions, and a terminal return", async () => {
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "I found two accounts.",
          toolCalls: [
            {
              id: "emit-1",
              name: "kortyx_emit__card",
              input: { accounts: ["A", "B"] },
            },
          ],
        },
        {
          content: "The second looks relevant.",
          toolCalls: [
            {
              id: "emit-2",
              name: "kortyx_emit__card",
              input: { accounts: ["B"] },
            },
          ],
        },
        {
          content: "Here is the analysis.",
          toolCalls: [
            {
              id: "return-1",
              name: "kortyx_return__completed",
              input: { summary: "B is relevant" },
            },
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
          input: "Analyze accounts",
          outputs: { emit: { card }, return: { completed, rejected } },
          toolExecution: { maxSteps: 4 },
        }),
    );

    expect(invoke).toHaveBeenCalledTimes(3);
    expect(result.text).toBe(
      "I found two accounts.\nThe second looks relevant.\nHere is the analysis.",
    );
    expect(result.emissions).toEqual([
      { contract: "card", data: { accounts: ["A", "B"] } },
      { contract: "card", data: { accounts: ["B"] } },
    ]);
    expect(result.returned).toEqual({
      contract: "completed",
      data: { summary: "B is relevant" },
    });
    expectTypeOf(result.returned).toEqualTypeOf<
      | { contract: "completed"; data: { summary: string } }
      | { contract: "rejected"; data: { reason: string } }
      | undefined
    >();
    expect(result.toolCalls).toEqual([]);
    expect(emitted.map((entry) => entry.event)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
      "structured_data",
      "text-start",
      "text-delta",
      "text-end",
      "structured_data",
      "text-start",
      "text-delta",
      "text-end",
      "structured_data",
    ]);
    expect(
      emitted
        .filter((entry) => entry.event === "structured_data")
        .map((entry) => entry.payload),
    ).toEqual([
      expect.objectContaining({
        kind: "final",
        dataType: "acme.account-card",
        data: { accounts: ["A", "B"] },
      }),
      expect.objectContaining({
        kind: "final",
        dataType: "acme.account-card",
        data: { accounts: ["B"] },
      }),
      expect.objectContaining({
        kind: "final",
        dataType: "acme.analysis",
        data: { summary: "B is relevant" },
      }),
    ]);
    const segments = emitted
      .filter((entry) => entry.event === "text-delta")
      .map((entry) => (entry.payload as { segmentId: string }).segmentId);
    expect(segments).toEqual(["step-0", "step-1", "step-2"]);
  });

  it("streams a selected terminal return and stops without another assistant pass", async () => {
    const liveReturn = defineOutputContract({
      description: "Return the completed analysis as it is written.",
      schemaId: "acme.live-analysis",
      schemaVersion: "1",
      schema: z.object({ summary: z.string() }),
      stream: { fields: { summary: "text-delta" } },
    });
    const { modelRef, invoke, stream } = createProvider({
      invokeResponses: [
        {
          content: "Here is the analysis.",
          toolCalls: [
            {
              id: "return-live",
              name: "kortyx_stream_return__completed",
              input: { instruction: "Summarize the account." },
            },
          ],
        },
      ],
      streamResponses: [
        '{"summary":"The ',
        'account is ready."}',
        { type: "finish", finishReason: { unified: "stop" } },
      ],
    });
    const { node, emitted } = createNode();
    const { result } = await runWithHookContext(
      { node, state: createState() },
      () =>
        useReason({
          model: modelRef,
          input: "Analyze",
          outputs: { return: { completed: liveReturn } },
          toolExecution: { maxSteps: 2 },
        }),
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(result.returned).toEqual({
      contract: "completed",
      data: { summary: "The account is ready." },
    });
    expect(result.text).toBe("Here is the analysis.");
    expect(
      emitted
        .filter((entry) => entry.event === "structured_data")
        .map((entry) => (entry.payload as { kind: string }).kind),
    ).toEqual(["text-delta", "text-delta", "final"]);
  });

  it("preserves emitted outputs across a human interrupt and resumes to a return", async () => {
    const approval = defineInterruptContract({
      description: "Ask which account to use.",
      schemaId: "acme.account-choice",
      schemaVersion: "1",
      requestSchema: z.object({ question: z.string() }),
      responseSchema: z.object({ account: z.string() }),
    });
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "Here are the matches.",
          toolCalls: [
            {
              id: "emit-card",
              name: "kortyx_emit__card",
              input: { accounts: ["A", "B"] },
            },
          ],
        },
        {
          content: "Which should I analyze?",
          toolCalls: [
            {
              id: "ask-account",
              name: "kortyx_request_input__approval",
              input: { question: "Which account?" },
            },
          ],
        },
        {
          content: "B is ready.",
          toolCalls: [
            {
              id: "return-result",
              name: "kortyx_return__completed",
              input: { summary: "B is ready" },
            },
          ],
        },
      ],
    });
    const paused = new Error("pause for human input");
    const firstNode = createNode({
      onInterrupt: () => {
        throw paused;
      },
    });
    const run = () =>
      useReason({
        id: "account-analysis",
        model: modelRef,
        input: "Analyze accounts",
        outputs: { emit: { card }, return: { completed } },
        interrupts: { contracts: { approval } },
        toolExecution: { maxSteps: 4 },
      });
    await expect(
      runWithHookContext({ node: firstNode.node, state: createState() }, run),
    ).rejects.toBe(paused);
    const runtimePatch = (
      paused as Error & { __kortyxHookStatePatch?: Record<string, unknown> }
    ).__kortyxHookStatePatch;
    expect(runtimePatch).toBeTruthy();

    const resumedNode = createNode({
      interruptResponse: { account: "B" },
    });
    const { result } = await runWithHookContext(
      { node: resumedNode.node, state: createState(runtimePatch) },
      run,
    );
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(result.emissions).toEqual([
      { contract: "card", data: { accounts: ["A", "B"] } },
    ]);
    expect(result.interruptHistory).toEqual([
      {
        contract: "approval",
        request: { question: "Which account?" },
        response: { account: "B" },
      },
    ]);
    expect(result.returned).toEqual({
      contract: "completed",
      data: { summary: "B is ready" },
    });
  });

  it("requires a terminal contract when return alternatives are provided", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [{ content: "Done" }],
    });
    const { node } = createNode();
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useReason({
          model: modelRef,
          input: "Analyze",
          outputs: { return: { completed } },
        }),
      ),
    ).rejects.toThrow("requires one terminal output contract call");
  });

  it("rejects invalid model output before publishing it", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            { id: "bad", name: "kortyx_emit__card", input: { accounts: 3 } },
          ],
        },
      ],
    });
    const { node, emitted } = createNode();
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useReason({
          model: modelRef,
          input: "Analyze",
          outputs: { emit: { card } },
        }),
      ),
    ).rejects.toThrow();
    expect(
      emitted.filter((entry) => entry.event === "structured_data"),
    ).toEqual([]);
  });

  it("shares the validated stream payload with deterministic useStructuredData", async () => {
    const { node, emitted } = createNode();
    await runWithHookContext({ node, state: createState() }, async () => {
      useStructuredData({ contract: card, data: { accounts: ["A"] } });
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        event: "structured_data",
        payload: expect.objectContaining({
          kind: "final",
          dataType: "acme.account-card",
          schemaId: "acme.account-card",
          schemaVersion: "1",
          data: { accounts: ["A"] },
        }),
      }),
    ]);
  });

  it("shares partial stream operations with deterministic contract output", async () => {
    const liveCard = defineOutputContract({
      description: "A card assembled by application code.",
      schemaId: "acme.manual-card",
      schemaVersion: "1",
      schema: z.object({ title: z.string(), accounts: z.array(z.string()) }),
      stream: { fields: { title: "text-delta", accounts: "append" } },
    });
    const { node, emitted } = createNode();
    await runWithHookContext({ node, state: createState() }, async () => {
      useStructuredData({
        contract: liveCard,
        kind: "text-delta",
        path: "title",
        delta: "Matches",
        streamId: "card-1",
      });
      useStructuredData({
        contract: liveCard,
        kind: "append",
        path: "accounts",
        items: ["A"],
        streamId: "card-1",
      });
      useStructuredData({
        contract: liveCard,
        kind: "final",
        data: { title: "Matches", accounts: ["A"] },
        streamId: "card-1",
      });
    });
    expect(
      emitted.map((entry) => (entry.payload as { kind: string }).kind),
    ).toEqual(["text-delta", "append", "final"]);
    expect(
      emitted.every(
        (entry) =>
          (entry.payload as { streamId: string }).streamId === "card-1",
      ),
    ).toBe(true);
  });
});
