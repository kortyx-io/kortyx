// Native execution shares the same supported lifecycle boundary as useTool.
// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks execute on the server.
import { useReason } from "kortyx";
import { describe, expect, it, vi } from "vitest";
import { runWithHookContext } from "../../packages/hooks/src/context";
import type { ReasonTraceAdapter } from "../../packages/hooks/src/tracing";
import {
  createNode,
  createProvider,
  createState,
} from "../../packages/hooks/test/helpers";

function provider() {
  return createProvider({
    invokeResponses: [
      { content: "", toolCalls: [{ id: "call-1", name: "lookup", input: {} }] },
      { content: "done" },
    ],
  });
}

describe("native lifecycle crosschecks", () => {
  it("dispatches provider tool arguments without validating the advertised input schema", async () => {
    const { modelRef } = provider();
    const { node } = createNode();
    const execute = vi.fn(async () => ({}));
    await runWithHookContext({ node, state: createState() }, () =>
      useReason({
        model: modelRef,
        input: "run",
        stream: false,
        tools: [
          {
            name: "lookup",
            inputSchema: {
              type: "object",
              properties: { jobId: { type: "string" } },
              required: ["jobId"],
              additionalProperties: false,
            },
            execute,
          },
        ],
      }),
    );
    // The stub requested {}, which violates the declared required jobId field.
    expect(execute).toHaveBeenCalledWith({}, { toolCallId: "call-1" });
  });

  it("preserves a successful result when completion tracing throws", async () => {
    const { modelRef, invoke } = provider();
    const { node } = createNode();
    const execute = vi.fn(async () => ({ status: "OK" }));
    const reasonTrace: ReasonTraceAdapter = {
      startSpan: ({ name }) =>
        name === "kortyx.tool"
          ? {
              end: () => {
                throw new Error("observer failed");
              },
              addEvent: (event) => {
                if (event === "useReason.tool-call.complete")
                  throw new Error("observer failed");
              },
            }
          : undefined,
    };
    const { result } = await runWithHookContext(
      { node, state: createState(), reasonTrace },
      () =>
        useReason({
          model: modelRef,
          input: "run",
          stream: false,
          tools: [{ name: "lookup", inputSchema: {}, execute }],
        }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.toolResults).toHaveLength(1);
    expect(
      result.toolResults?.map((r) => [r.toolCallId, Boolean(r.isError)]),
    ).toEqual([["call-1", false]]);
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", toolCallId: "call-1" }),
      ]),
    );
  });

  it("isolates span acquisition failure and closes owned resources", async () => {
    const { modelRef, invoke } = provider();
    const { node } = createNode();
    const execute = vi.fn(async () => ({}));
    const close = vi.fn();
    const failure = new Error("observer acquisition failed");
    await expect(
      runWithHookContext(
        {
          node,
          state: createState(),
          reasonTrace: {
            startSpan: () => {
              throw failure;
            },
          },
        },
        () =>
          useReason({
            model: modelRef,
            input: "run",
            tools: [{ name: "lookup", inputSchema: {}, execute, close }],
          }),
      ),
    ).resolves.toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("isolates reasoning completion failure from a successful tool loop", async () => {
    const { modelRef } = provider();
    const { node } = createNode();
    const execute = vi.fn(async () => ({}));
    const close = vi.fn();
    const failure = new Error("observer completion failed");
    const reasonTrace: ReasonTraceAdapter = {
      startSpan: ({ name }) =>
        name === "useReason"
          ? {
              end: () => {
                throw failure;
              },
            }
          : undefined,
    };
    await expect(
      runWithHookContext({ node, state: createState(), reasonTrace }, () =>
        useReason({
          model: modelRef,
          input: "run",
          stream: false,
          tools: [{ name: "lookup", inputSchema: {}, execute, close }],
        }),
      ),
    ).resolves.toBeDefined();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes newly supplied owned resources when a completed reason checkpoint is replayed", async () => {
    const { modelRef, invoke } = provider();
    const { node } = createNode();
    const state = createState();
    const execute = vi.fn(async () => ({}));
    const firstClose = vi.fn();
    const replayClose = vi.fn();
    // A later node interruption retains the completed reasoning checkpoint.
    const laterInterrupt = new Error("later node suspended");
    await expect(
      runWithHookContext({ node, state }, async () => {
        await useReason({
          id: "lookup",
          model: modelRef,
          input: "run",
          stream: false,
          tools: [
            { name: "lookup", inputSchema: {}, execute, close: firstClose },
          ],
        });
        throw laterInterrupt;
      }),
    ).rejects.toBe(laterInterrupt);
    const { result } = await runWithHookContext({ node, state }, () =>
      useReason({
        id: "lookup",
        model: modelRef,
        input: "run",
        stream: false,
        tools: [
          { name: "lookup", inputSchema: {}, execute, close: replayClose },
        ],
      }),
    );
    expect(result.text).toBe("done");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(replayClose).toHaveBeenCalledTimes(1);
  });

  it("closes owned resources if the signal is already aborted at entry", async () => {
    const { modelRef, invoke } = provider();
    const { node } = createNode();
    node.abortSignal = AbortSignal.abort();
    const close = vi.fn();
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useReason({
          model: modelRef,
          input: "run",
          tools: [
            {
              name: "lookup",
              inputSchema: {},
              execute: async () => ({}),
              close,
            },
          ],
        }),
      ),
    ).rejects.toBeDefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps a completed side effect committed if owned cleanup fails", async () => {
    const { modelRef, invoke } = provider();
    const { node } = createNode();
    const state = createState();
    const execute = vi.fn(async () => ({}));
    const end = vi.fn();
    const reasonTrace: ReasonTraceAdapter = {
      startSpan: ({ name }) => (name === "useReason" ? { end } : undefined),
    };
    const cleanupFailure = new Error("close failed");
    await expect(
      runWithHookContext({ node, state, reasonTrace }, async () => {
        await useReason({
          id: "lookup",
          model: modelRef,
          input: "run",
          stream: false,
          tools: [
            {
              name: "lookup",
              inputSchema: {},
              execute,
              close: async () => {
                throw cleanupFailure;
              },
            },
          ],
        });
        throw new Error("later interruption");
      }),
    ).rejects.toThrow("later interruption");
    expect(end).toHaveBeenCalledTimes(1);
    const close = vi.fn();
    const { result } = await runWithHookContext({ node, state }, () =>
      useReason({
        id: "lookup",
        model: modelRef,
        input: "run",
        stream: false,
        tools: [{ name: "lookup", inputSchema: {}, execute, close }],
      }),
    );
    expect(result.text).toBe("done");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("uses dispatched correlation IDs and reuses a completed tool after a later approval interruption", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            { id: "call-1", name: "lookup", input: {} },
            { id: "call-2", name: "second", input: {} },
          ],
        },
        { content: "done" },
      ],
    });
    const state = createState();
    const pause = new Error("second approval suspended");
    const execute = vi.fn(async () => ({
      toolCallId: "foreign-call",
      name: "foreign-tool",
      content: "OK",
    }));
    const second = vi.fn(async () => ({}));
    const args = {
      model: modelRef,
      input: "run",
      stream: false,
      tools: [
        { name: "lookup", inputSchema: {}, execute },
        { name: "second", inputSchema: {}, execute: second },
      ],
      toolExecution: { approval: { second: true } },
    };
    const firstNode = createNode({
      onInterrupt: () => {
        throw pause;
      },
    }).node;
    await expect(
      runWithHookContext({ node: firstNode, state }, () => useReason(args)),
    ).rejects.toBe(pause);
    expect(execute).toHaveBeenCalledTimes(1);
    const resumedNode = createNode({ interruptResponse: "approve" }).node;
    const { result } = await runWithHookContext(
      { node: resumedNode, state },
      () => useReason(args),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(
      result.toolResults?.filter(
        (r) => r.toolCallId === "call-1" && r.name === "lookup",
      ),
    ).toHaveLength(1);
  });
});
