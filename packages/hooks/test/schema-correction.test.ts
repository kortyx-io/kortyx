import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runWithHookContext } from "../src/context";
import { defineInterruptContract } from "../src/interrupt-contract";
import { defineOutputContract } from "../src/output-contract";
import { useReason } from "../src/reason/use-reason";
import { createNode, createProvider, createState } from "./helpers";

const schema = z.object({ version: z.literal("v2") });
const card = defineOutputContract({
  description: "Show a preview",
  schemaId: "preview",
  schemaVersion: "2",
  schema,
});
const call = (id: string, name: string, input: unknown) => ({
  content: "",
  toolCalls: [{ id, name, input }],
});

describe("bounded output schema correction", () => {
  it.each([
    "__proto__",
    "constructor",
  ])("treats tool-call ID %s as a data key", async (id) => {
    const provider = createProvider({
      invokeResponses: [
        call(id, "kortyx_return__card", {}),
        { content: '{"version":"v2"}' },
      ],
    });
    const { result } = await runWithHookContext(
      { node: createNode().node, state: createState() },
      () =>
        useReason({
          model: provider.modelRef,
          input: "Preview",
          stream: false,
          outputs: { return: { card } },
        }),
    );
    expect(result.returned?.data).toEqual({ version: "v2" });
  });
  it("keeps a forbidden correction terminal across replay, even if its JSON is valid", async () => {
    const provider = createProvider({
      invokeResponses: [
        call("bad", "kortyx_return__card", {}),
        {
          content: '{"version":"v2"}',
          toolCalls: [{ id: "unsafe", name: "save", input: {} }],
        },
      ],
    });
    const execute = vi.fn(),
      state = createState();
    const reason = () =>
      useReason({
        id: "forbidden-repair",
        model: provider.modelRef,
        input: "Preview",
        stream: false,
        outputs: { return: { card } },
        tools: [{ name: "save", inputSchema: {}, execute }],
        toolExecution: { maxSteps: 5 },
      });
    await expect(
      runWithHookContext({ node: createNode().node, state }, reason),
    ).rejects.toMatchObject({
      code: "REASON_OUTPUT_CORRECTION_TOOL_DISALLOWED",
    });
    await expect(
      runWithHookContext(
        { node: createNode().node, state: JSON.parse(JSON.stringify(state)) },
        reason,
      ),
    ).rejects.toMatchObject({
      code: "REASON_OUTPUT_CORRECTION_TOOL_DISALLOWED",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(provider.invoke).toHaveBeenCalledTimes(2);
  });
  it("counts a failed provider request against the correction allowance", async () => {
    const provider = createProvider({
      invokeResponses: [call("bad", "kortyx_return__card", {})],
    });
    const state = createState();
    const reason = () =>
      useReason({
        id: "provider-failed-repair",
        model: provider.modelRef,
        input: "Preview",
        stream: false,
        outputs: { return: { card } },
        toolExecution: { maxSteps: 5 },
      });
    await expect(
      runWithHookContext({ node: createNode().node, state }, reason),
    ).rejects.toThrow("No mock invoke response configured");
    await expect(
      runWithHookContext(
        { node: createNode().node, state: JSON.parse(JSON.stringify(state)) },
        reason,
      ),
    ).rejects.toMatchObject({
      code: "REASON_OUTPUT_SCHEMA_CORRECTION_EXHAUSTED",
      failure: { details: { attempts: 1 } },
    });
    expect(provider.invoke).toHaveBeenCalledTimes(2);
  });
  it("accounts for both model responses in repaired output usage", async () => {
    const provider = createProvider({
      invokeResponses: [
        {
          ...call("bad", "kortyx_return__card", {}),
          usage: { input: 2, output: 3, total: 5 },
        },
        {
          content: '{"version":"v2"}',
          usage: { input: 4, output: 5, total: 9 },
        },
      ],
    });
    const { result } = await runWithHookContext(
      { node: createNode().node, state: createState() },
      () =>
        useReason({
          model: provider.modelRef,
          input: "Preview",
          stream: false,
          outputs: { return: { card } },
          toolExecution: { maxSteps: 5 },
        }),
    );
    expect(result.usage).toMatchObject({ input: 6, output: 8, total: 14 });
    expect(result.steps).toHaveLength(2);
  });
  it.each([
    "emit",
    "return",
  ] as const)("repairs invalid %s payloads without calling business tools", async (kind) => {
    const provider = createProvider({
      invokeResponses: [
        call("invalid", `kortyx_${kind}__card`, { version: "v1" }),
        { content: '{"version":"v2"}' },
        { content: "Done" },
      ],
    });
    const execute = vi.fn();
    const { result } = await runWithHookContext(
      { node: createNode().node, state: createState() },
      () =>
        useReason({
          model: provider.modelRef,
          input: "Show preview",
          stream: false,
          outputs: { [kind]: { card } },
          tools: [{ name: "save", inputSchema: {}, execute }],
          toolExecution: { maxSteps: 5 },
        }),
    );
    expect(
      kind === "emit" ? result.emissions?.[0]?.data : result.returned?.data,
    ).toEqual({ version: "v2" });
    expect(execute).not.toHaveBeenCalled();
    const request = provider.invoke.mock.calls[1] as unknown as [
      Array<{ content: string }>,
    ];
    expect(JSON.stringify(request[0])).toContain("version");
    expect(JSON.stringify(request[0])).toContain("v2");
    expect(provider.provider.getModel).toHaveBeenCalledWith(
      "mock-model",
      expect.objectContaining({ tools: [] }),
    );
  });
  it("repairs legacy final JSON and preserves completed read evidence", async () => {
    const provider = createProvider({
      invokeResponses: [
        call("read", "read", {}),
        { content: '{"text":"saved"}' },
        { content: '{"needsInput":false,"text":"saved"}' },
      ],
    });
    const execute = vi.fn(() => ({ recordId: "saved-record" }));
    const { result } = await runWithHookContext(
      { node: createNode().node, state: createState() },
      () =>
        useReason({
          model: provider.modelRef,
          input: "Read the saved record",
          stream: false,
          outputSchema: z.object({ needsInput: z.boolean(), text: z.string() }),
          tools: [{ name: "read", inputSchema: {}, execute }],
          toolExecution: { maxSteps: 5 },
        }),
    );
    expect(result.output).toEqual({ needsInput: false, text: "saved" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(provider.invoke.mock.calls[2])).toContain(
      "saved-record",
    );
  });
  it("corrects plain structured calls without tools", async () => {
    const provider = createProvider({
      invokeResponses: [
        { content: "not JSON" },
        { content: '{"version":"v2"}' },
      ],
    });
    const { result } = await runWithHookContext(
      { node: createNode().node, state: createState() },
      () =>
        useReason({
          model: provider.modelRef,
          input: "Preview",
          outputSchema: schema,
        }),
    );
    expect(result.output).toEqual({ version: "v2" });
    expect(provider.invoke).toHaveBeenCalledTimes(2);
  });
  it("keeps completed writes and a serialized human response across correction and replay", async () => {
    const ask = defineInterruptContract({
      description: "Choose",
      schemaId: "choose",
      schemaVersion: "1",
      requestSchema: z.object({ question: z.string() }),
      responseSchema: z.object({ answer: z.string() }),
    });
    const provider = createProvider({
      invokeResponses: [
        call("save", "save", {}),
        call("ask", "kortyx_request_input__ask", { question: "Continue?" }),
        call("bad", "kortyx_return__card", { version: "v1" }),
        { content: '{"version":"v2"}' },
      ],
    });
    const execute = vi.fn(() => ({ recordId: "saved-record" }));
    const state = createState();
    const pause = new Error("pause");
    const reason = () =>
      useReason({
        id: "save-preview",
        model: provider.modelRef,
        input: "Save and show preview",
        stream: false,
        outputs: { return: { card } },
        tools: [{ name: "save", inputSchema: {}, execute }],
        interrupts: { contracts: { ask } },
        toolExecution: { maxSteps: 6 },
      });
    await expect(
      runWithHookContext(
        {
          node: createNode({
            onInterrupt: () => {
              throw pause;
            },
          }).node,
          state,
        },
        reason,
      ),
    ).rejects.toBe(pause);
    const restored = JSON.parse(JSON.stringify(state));
    const node = createNode({ interruptResponse: { answer: "yes" } }).node;
    const laterPause = new Error("later pause");
    await expect(
      runWithHookContext({ node, state: restored }, async () => {
        expect((await reason()).returned?.data).toEqual({ version: "v2" });
        throw laterPause;
      }),
    ).rejects.toBe(laterPause);
    const replayed = await runWithHookContext(
      { node, state: JSON.parse(JSON.stringify(restored)) },
      reason,
    );
    expect(replayed.result.returned?.data).toEqual({ version: "v2" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(provider.invoke).toHaveBeenCalledTimes(4);
    expect(replayed.result.interruptHistory).toHaveLength(1);
  });
  it("does not replenish correction attempts when a failed checkpoint is replayed", async () => {
    const provider = createProvider({
      invokeResponses: [
        call("bad", "kortyx_return__card", {}),
        { content: "{}" },
      ],
    });
    const state = createState();
    const reason = () =>
      useReason({
        id: "bounded",
        model: provider.modelRef,
        input: "Preview",
        stream: false,
        outputs: { return: { card } },
        toolExecution: { maxSteps: 5 },
      });
    await expect(
      runWithHookContext({ node: createNode().node, state }, reason),
    ).rejects.toMatchObject({
      code: "REASON_OUTPUT_SCHEMA_CORRECTION_EXHAUSTED",
      failure: { details: { attempts: 1, reason: "attempts_exhausted" } },
    });
    await expect(
      runWithHookContext(
        { node: createNode().node, state: JSON.parse(JSON.stringify(state)) },
        reason,
      ),
    ).rejects.toMatchObject({
      code: "REASON_OUTPUT_SCHEMA_CORRECTION_EXHAUSTED",
    });
    expect(provider.invoke).toHaveBeenCalledTimes(2);
  });
  it("preserves a shared execution-limit suspension before repair", async () => {
    const provider = createProvider({
      invokeResponses: [
        call("save", "save", {}),
        call("bad", "kortyx_return__card", {}),
        { content: '{"version":"v2"}' },
      ],
    });
    const execute = vi.fn(() => "saved");
    const state = createState(),
      node = createNode().node;
    let passes = 0;
    const pause = Object.assign(new Error("Continue required"), {
      name: "GraphInterrupt",
    });
    node.consumeExecution = () => {
      if (++passes === 3) throw pause;
    };
    const reason = () =>
      useReason({
        id: "continue",
        model: provider.modelRef,
        input: "Save and preview",
        stream: false,
        outputs: { return: { card } },
        tools: [{ name: "save", inputSchema: {}, execute }],
        toolExecution: { maxSteps: 5 },
      });
    await expect(runWithHookContext({ node, state }, reason)).rejects.toBe(
      pause,
    );
    node.consumeExecution = undefined;
    expect(
      (
        await runWithHookContext(
          { node, state: JSON.parse(JSON.stringify(state)) },
          reason,
        )
      ).result.returned?.data,
    ).toEqual({ version: "v2" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(provider.invoke).toHaveBeenCalledTimes(3);
  });
  it("invalidates streamed draft fields before publishing a corrected final", async () => {
    const live = defineOutputContract({
      description: "Show preview",
      schemaId: "preview",
      schemaVersion: "2",
      schema,
      stream: { fields: { version: "text-delta" } },
    });
    const provider = createProvider({
      invokeResponses: [
        call("bad", "kortyx_stream_return__card", {
          instruction: "Show preview",
        }),
        { content: '{"version":"v2"}' },
      ],
      streamResponses: [
        '{"version":"v1"}',
        { type: "finish", finishReason: { unified: "stop" } },
      ],
    });
    const { node, emitted } = createNode();
    const { result } = await runWithHookContext(
      { node, state: createState() },
      () =>
        useReason({
          model: provider.modelRef,
          input: "Preview",
          outputs: { return: { card: live } },
          toolExecution: { maxSteps: 5 },
        }),
    );
    expect(result.returned?.data).toEqual({ version: "v2" });
    const invalidated = emitted.findIndex(
      (event) => event.event === "structured_data_invalidated",
    );
    const final = emitted.findIndex(
      (event) =>
        event.event === "structured_data" &&
        (event.payload as { kind?: string }).kind === "final",
    );
    expect(invalidated).toBeGreaterThanOrEqual(0);
    expect(final).toBeGreaterThan(invalidated);
  });
  it.each([
    0, 1,
  ])("enforces local model budget with schemaCorrections=%s", async (schemaCorrections) => {
    const provider = createProvider({
      invokeResponses: [call("bad", "kortyx_return__card", {})],
    });
    await expect(
      runWithHookContext(
        { node: createNode().node, state: createState() },
        () =>
          useReason({
            model: provider.modelRef,
            input: "Preview",
            stream: false,
            outputs: { return: { card } },
            schemaCorrections,
            toolExecution: { maxSteps: 1 },
          }),
      ),
    ).rejects.toMatchObject({
      code: schemaCorrections
        ? "REASON_OUTPUT_SCHEMA_CORRECTION_EXHAUSTED"
        : "SCHEMA_VALIDATION",
    });
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([
    "content-filter",
    "length",
    "error",
  ] as const)("never treats %s as a repairable schema mistake", async (unified) => {
    const provider = createProvider({
      invokeResponses: [{ content: "refused", finishReason: { unified } }],
    });
    await expect(
      runWithHookContext(
        { node: createNode().node, state: createState() },
        () =>
          useReason({
            model: provider.modelRef,
            input: "Preview",
            outputSchema: schema,
          }),
      ),
    ).rejects.toThrow();
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([
    -1,
    0.5,
    11,
    Number.NaN,
  ])("rejects invalid correction policy %s", async (schemaCorrections) => {
    const provider = createProvider();
    await expect(
      runWithHookContext(
        { node: createNode().node, state: createState() },
        () =>
          useReason({
            model: provider.modelRef,
            input: "Preview",
            outputs: { return: { card } },
            schemaCorrections,
          }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REASON_CORRECTION_POLICY" });
    expect(provider.invoke).not.toHaveBeenCalled();
  });
});
