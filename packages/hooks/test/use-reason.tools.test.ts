import { describe, expect, it, vi } from "vitest";
import { runWithHookContext } from "../src";
import { useReason } from "../src/hooks";
import { createNode, createProvider, createState } from "./helpers";

describe("useReason tool loop", () => {
  it("executes MCP-style tools, feeds results back to the model, emits tool chunks, and closes owned tools", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          toolCalls: [
            {
              id: "call-1",
              name: "lookup_order",
              input: { orderId: "ord_1" },
            },
          ],
        },
        { content: "Order ord_1 is ready." },
      ],
    });
    const execute = vi.fn(async () => ({
      orderId: "ord_1",
      status: "ready",
    }));
    const close = vi.fn();
    const { node, emitted } = createNode();
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Check order ord_1",
        tools: [
          {
            name: "lookup_order",
            description: "Look up an order.",
            inputSchema: {
              type: "object",
              properties: { orderId: { type: "string" } },
              required: ["orderId"],
            },
            execute,
            close,
          },
        ],
        toolPolicy: { maxSteps: 3, emit: true },
      }),
    );

    expect(result.text).toBe("Order ord_1 is ready.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolResults).toHaveLength(1);
    expect(result.steps).toHaveLength(2);
    expect(execute).toHaveBeenCalledWith(
      { orderId: "ord_1" },
      { toolCallId: "call-1" },
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(emitted.map((entry) => entry.event)).toEqual([
      "tool-call-start",
      "tool-call-result",
      "text-start",
      "text-delta",
      "text-end",
    ]);
  });

  it("fails when maxSteps is reached before a final response", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "I need to check that.",
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          toolCalls: [
            {
              id: "call-1",
              name: "lookup_order",
              input: { orderId: "ord_1" },
            },
          ],
        },
      ],
    });
    const close = vi.fn();
    const { node } = createNode();
    const state = createState();

    await expect(
      runWithHookContext({ node, state }, async () =>
        useReason({
          model: modelRef,
          input: "Check order ord_1",
          tools: [
            {
              name: "lookup_order",
              inputSchema: { type: "object" },
              execute: async () => ({ status: "ready" }),
              close,
            },
          ],
          toolPolicy: { maxSteps: 1 },
        }),
      ),
    ).rejects.toThrow(
      "useReason tool loop reached maxSteps (1) before producing a final response.",
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps tool execution private when toolPolicy.emit is false", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            {
              id: "call-1",
              name: "lookup_order",
              input: { orderId: "ord_1" },
            },
          ],
        },
        { content: "Order ord_1 is ready." },
      ],
    });
    const { node, emitted } = createNode();
    const state = createState();

    await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Check order ord_1",
        tools: [
          {
            name: "lookup_order",
            inputSchema: { type: "object" },
            execute: async () => ({ status: "ready" }),
          },
        ],
        toolPolicy: { emit: false },
      }),
    );

    expect(emitted.map((entry) => entry.event)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
    ]);
  });

  it("executes an approved tool call", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            {
              id: "call-1",
              name: "lookup_order",
              input: { orderId: "ord_1" },
            },
          ],
        },
        { content: "Approved result." },
      ],
    });
    const execute = vi.fn(async () => ({ status: "ready" }));
    const { node, interrupts } = createNode({ interruptResponse: "approve" });
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Check order ord_1",
        tools: [
          {
            name: "lookup_order",
            inputSchema: { type: "object" },
            execute,
          },
        ],
        toolPolicy: { approval: true },
      }),
    );

    expect(result.text).toBe("Approved result.");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(1);
    expect(interrupts[0]).toMatchObject({
      kind: "choice",
      question: "Approve lookup_order?",
    });
  });

  it("feeds a denied approval back as an error tool result", async () => {
    const { modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            {
              id: "call-1",
              name: "lookup_order",
              input: { orderId: "ord_1" },
            },
          ],
        },
        { content: "The tool was denied." },
      ],
    });
    const execute = vi.fn(async () => ({ status: "ready" }));
    const { node } = createNode({ interruptResponse: "deny" });
    const state = createState();

    const { result } = await runWithHookContext({ node, state }, async () =>
      useReason({
        model: modelRef,
        input: "Check order ord_1",
        tools: [
          {
            name: "lookup_order",
            inputSchema: { type: "object" },
            execute,
          },
        ],
        toolPolicy: { approval: true },
      }),
    );

    expect(result.text).toBe("The tool was denied.");
    expect(execute).not.toHaveBeenCalled();
    expect(result.toolResults).toEqual([
      {
        toolCallId: "call-1",
        name: "lookup_order",
        content: "Tool call denied by user.",
        isError: true,
      },
    ]);
  });
});
