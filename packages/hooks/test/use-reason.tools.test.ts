import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineInterruptContract, runWithHookContext } from "../src";
import { useReason } from "../src/hooks";
import { createNode, createProvider, createState } from "./helpers";

const TextInterruptRequestSchema = z.object({
  kind: z.literal("text"),
  question: z.string(),
});

describe("useReason tool loop", () => {
  it("uses one of multiple interrupt contracts between ordinary tool calls", async () => {
    const jobPicker = defineInterruptContract({
      description: "Ask the user to select a matching job.",
      schemaId: "wolly.job-picker",
      schemaVersion: "1",
      requestSchema: z.object({
        kind: z.literal("choice"),
        question: z.string(),
        candidates: z.array(z.object({ jobId: z.string(), title: z.string() })),
      }),
      responseSchema: z.discriminatedUnion("type", [
        z.object({ type: z.literal("select"), jobId: z.string() }),
        z.object({ type: z.literal("cancel") }),
      ]),
    });
    const refinement = defineInterruptContract({
      description: "Ask the user to refine an ambiguous search.",
      schemaId: "wolly.job-refinement",
      schemaVersion: "1",
      requestSchema: z.object({ question: z.string() }),
      responseSchema: z.object({ query: z.string() }),
    });
    const candidates = [
      { jobId: "job-1", title: "Platform Engineer" },
      { jobId: "job-2", title: "Frontend Engineer" },
    ];
    const { modelRef, invoke } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            { id: "search-1", name: "search_jobs", input: { q: "France" } },
          ],
        },
        {
          content: "",
          toolCalls: [
            {
              id: "ask-1",
              name: "kortyx_request_input__jobPicker",
              input: {
                kind: "choice",
                question: "Which engineering job?",
                candidates,
              },
            },
          ],
        },
        {
          content: "",
          toolCalls: [
            { id: "read-1", name: "read_job", input: { jobId: "job-2" } },
          ],
        },
        { content: "The Frontend Engineer role is based in Paris." },
      ],
    });
    const search = vi.fn(async () => candidates);
    const read = vi.fn(async () => ({
      jobId: "job-2",
      title: "Frontend Engineer",
      city: "Paris",
    }));
    const { node, interrupts } = createNode({
      interruptResponse: { type: "select", jobId: "job-2" },
    });

    const { result } = await runWithHookContext(
      { node, state: createState() },
      () =>
        useReason({
          model: modelRef,
          input: "Tell me about that engineering job in France.",
          tools: [
            { name: "search_jobs", inputSchema: {}, execute: search },
            { name: "read_job", inputSchema: {}, execute: read },
          ],
          interrupts: {
            mode: "optional",
            maxRequests: 2,
            contracts: { jobPicker, refinement },
          },
          toolExecution: { maxSteps: 6 },
        }),
    );

    expect(search).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(
      { jobId: "job-2" },
      { toolCallId: "read-1" },
    );
    expect(interrupts).toEqual([
      expect.objectContaining({
        kind: "custom",
        contract: "jobPicker",
        schemaId: "wolly.job-picker",
        schemaVersion: "1",
        request: expect.objectContaining({ candidates }),
      }),
    ]);
    expect(result.interruptHistory).toEqual([
      {
        contract: "jobPicker",
        request: {
          kind: "choice",
          question: "Which engineering job?",
          candidates,
        },
        response: { type: "select", jobId: "job-2" },
      },
    ]);
    expect(result.toolCalls?.map((call) => call.name)).toEqual([
      "search_jobs",
      "read_job",
    ]);
    expect(result.toolResults).toHaveLength(2);
    expect(result.text).toContain("Paris");
    expect(invoke).toHaveBeenCalledTimes(4);
  });

  it("preserves a model failure when cleanup also fails", async () => {
    const { modelRef, invoke } = createProvider();
    const primary = new Error("model failed");
    invoke.mockRejectedValue(primary);
    const { node } = createNode();
    const close = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useReason({
          model: modelRef,
          input: "run",
          tools: [
            { name: "test", inputSchema: {}, execute: async () => ({}), close },
          ],
        }),
      ),
    ).rejects.toBe(primary);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves setup failures when cleanup fails before the model starts", async () => {
    const { modelRef, invoke } = createProvider();
    const { node } = createNode();
    const tool = {
      name: "duplicate",
      inputSchema: {},
      execute: async () => ({}),
      close: async () => {
        throw new Error("cleanup failed");
      },
    };
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useReason({ model: modelRef, input: "run", tools: [tool, tool] }),
      ),
    ).rejects.toThrow("duplicate tool name");
    expect(invoke).not.toHaveBeenCalled();
  });
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
        toolExecution: { maxSteps: 3, emit: true },
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
          toolExecution: { maxSteps: 1 },
        }),
      ),
    ).rejects.toThrow(
      "useReason tool loop reached maxSteps (1) before producing a final response.",
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps tool execution private when toolExecution.emit is false", async () => {
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
        toolExecution: { emit: false },
      }),
    );

    expect(emitted.map((entry) => entry.event)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
    ]);
  });

  it("adapts deprecated interrupt mode into the tool loop and closes owned tools", async () => {
    const { invoke, modelRef } = createProvider({
      invokeResponses: [
        {
          content: "",
          toolCalls: [
            {
              id: "ask-1",
              name: "kortyx_request_input__default",
              input: { kind: "text", question: "Which country?" },
            },
          ],
        },
        { content: "The order is in France." },
      ],
    });
    const execute = vi.fn(async () => ({ status: "ready" }));
    const close = vi.fn();
    const state = createState();

    const { result } = await runWithHookContext(
      { node: createNode({ interruptResponse: "France" }).node, state },
      async () =>
        useReason({
          model: modelRef,
          input: "Check order ord_1",
          interrupt: {
            requestSchema: TextInterruptRequestSchema,
          },
          tools: [
            {
              name: "lookup_order",
              inputSchema: { type: "object" },
              execute,
              close,
            },
          ],
        }),
    );
    expect(result.text).toBe("The order is in France.");
    expect(result.interruptResponse).toBe("France");
    expect(result.interruptHistory).toEqual([
      {
        contract: "default",
        request: { kind: "text", question: "Which country?" },
        response: "France",
      },
    ]);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(execute).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
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
        toolExecution: { approval: true },
      }),
    );

    expect(result.text).toBe("Approved result.");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(interrupts).toHaveLength(1);
    expect(interrupts[0]).toMatchObject({
      kind: "choice",
      question: "Approve lookup_order?",
      meta: {
        tool: "lookup_order",
        toolCallId: "call-1",
        input: { orderId: "ord_1" },
      },
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
        toolExecution: { approval: true },
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
