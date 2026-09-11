import { describe, expect, it, vi } from "vitest";
import { createOpenAI } from "../src/provider";
import { createResponsesRequest, responsesResult } from "../src/responses";

const payload = (
  output: unknown[] = [
    { type: "message", content: [{ type: "output_text", text: "ok" }] },
  ],
) => ({
  id: "resp_1",
  model: "gpt-5.6-luna",
  status: "completed",
  output,
  usage: {
    input_tokens: 20,
    output_tokens: 10,
    total_tokens: 30,
    input_tokens_details: { cached_tokens: 5, cache_write_tokens: 2 },
    output_tokens_details: { reasoning_tokens: 7 },
  },
  reasoning: { effort: "medium" },
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
const sse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
  );
const collect = async (
  parts: AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>,
) => {
  const result = [];
  for await (const part of await parts) result.push(part);
  return result;
};
const message = [{ role: "user" as const, content: "Hello" }];

describe("OpenAI Responses", () => {
  it("defaults to Responses and preserves reasoning, schema, tools and request cancellation", async () => {
    const signal = new AbortController().signal;
    const fetch = vi.fn(async (_url, init) => {
      expect(init.signal).toBe(signal);
      expect(JSON.parse(init.body)).toMatchObject({
        model: "gpt-5.6-luna",
        store: false,
        stream: false,
        reasoning: { effort: "medium" },
        text: { format: { type: "json_schema", name: "answer", strict: true } },
        tools: [{ type: "function", name: "lookup", strict: false }],
      });
      return json(payload());
    });
    const result = await createOpenAI({ apiKey: "test", fetch })
      .getModel("gpt-5.6-luna", {
        abortSignal: signal,
        reasoning: { effort: "medium" },
        maxOutputTokens: 500,
        responseFormat: {
          type: "json",
          name: "answer",
          schema: { type: "object" },
        },
        tools: [{ name: "lookup", inputSchema: { type: "object" } }],
      })
      .invoke(message);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(result.usage).toMatchObject({
      total: 30,
      reasoning: 7,
      cacheRead: 5,
      cacheWrite: 2,
      outputIncludesReasoning: true,
    });
    expect(result.providerMetadata).toMatchObject({
      api: "responses",
      reasoning: { effort: "medium" },
    });
  });

  it("replays complete reasoning and call items without confusing item id and call_id", () => {
    const output = [
      {
        type: "reasoning",
        id: "rs_1",
        summary: [],
        encrypted_content: "opaque",
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "lookup",
        arguments: '{"id":42}',
      },
    ];
    const result = responsesResult(payload(output), "gpt-5.6-luna");
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "lookup", input: { id: 42 } },
    ]);
    const request = createResponsesRequest(
      "gpt-5.6-luna",
      [
        ...message,
        {
          role: "assistant",
          content: "",
          toolCalls: result.toolCalls,
          continuation: result.continuation!,
        },
        { role: "tool", content: "found", toolCallId: "call_1" },
      ],
      {},
      false,
    );
    expect(request.input).toEqual([
      ...message,
      ...output,
      { type: "function_call_output", call_id: "call_1", output: "found" },
    ]);
  });

  it.each([
    "responses",
    "chat-completions",
  ] as const)("respects the %s model override over the factory default", async (api) => {
    const fetch = vi.fn(
      async (
        _url: Parameters<typeof globalThis.fetch>[0],
        _init?: RequestInit,
      ) =>
        api === "responses"
          ? json(payload())
          : json({ choices: [{ message: { content: "old" } }] }),
    );
    const provider = createOpenAI({
      api: api === "responses" ? "chat-completions" : "responses",
      apiKey: "test",
      fetch,
    });
    const ref = provider("gpt-4.1-mini", { api });
    await provider.getModel(ref.modelId, ref.options).invoke(message);
    expect(fetch.mock.calls[0]?.[0]).toContain(
      api === "responses" ? "/responses" : "/chat/completions",
    );
  });

  it("streams text but assembles completed tool arguments from the terminal response", async () => {
    const output = [
      {
        type: "function_call",
        call_id: "call_1",
        name: "lookup",
        arguments: '{"id":42}',
      },
    ];
    const model = createOpenAI({
      apiKey: "test",
      fetch: async () =>
        sse([
          { type: "response.output_text.delta", delta: "Checking" },
          { type: "response.function_call_arguments.delta", delta: '{"id":' },
          { type: "response.completed", response: payload(output) },
        ]),
    }).getModel("gpt-5.6-luna");
    expect(await collect(model.stream(message))).toMatchObject([
      { type: "text-delta", delta: "Checking" },
      { type: "finish", toolCalls: [{ id: "call_1", input: { id: 42 } }] },
    ]);
  });

  it.each([
    "incomplete",
    "failed",
    "cancelled",
  ])("surfaces %s with available usage", async (status) => {
    const model = createOpenAI({
      apiKey: "test",
      fetch: async () =>
        json({
          ...payload(),
          status,
          incomplete_details: { reason: "max_output_tokens" },
        }),
    }).getModel("gpt-5.6-luna");
    await expect(model.invoke(message)).rejects.toMatchObject({
      usage: { total: 30 },
      providerMetadata: { status },
    });
  });
  it.each([
    [
      {
        type: "message",
        content: [{ type: "refusal", refusal: "Cannot comply" }],
      },
    ],
    [
      {
        type: "function_call",
        name: "lookup",
        call_id: "call_1",
        arguments: "{",
      },
    ],
    [{ type: "function_call", name: "lookup", arguments: "{}" }],
    [{ type: "web_search_call" }],
    [],
    [null],
  ])("rejects non-success output %#", (...output) =>
    expect(() => responsesResult(payload(output), "gpt-5.6-luna")).toThrow());

  it.each([
    [{ type: "response.output_text.delta", delta: "partial" }],
    [{ type: "error", message: "unavailable" }],
    [
      {
        type: "response.incomplete",
        response: { ...payload(), status: "incomplete" },
      },
    ],
  ])("never fabricates a finish for a failed or truncated stream %#", async (...events) => {
    const model = createOpenAI({
      apiKey: "test",
      fetch: async () => sse(events),
    }).getModel("gpt-5.6-luna");
    const parts = await collect(model.stream(message));
    expect(parts.at(-1)).toMatchObject({ type: "error" });
    expect(parts).not.toContainEqual(
      expect.objectContaining({ type: "finish" }),
    );
  });
  it("supports non-streaming through stream() and explicit storage", async () => {
    const fetch = vi.fn(async (_url, init) => {
      expect(JSON.parse(init.body)).toMatchObject({
        store: true,
        stream: false,
      });
      return json(payload());
    });
    const model = createOpenAI({ apiKey: "test", fetch }).getModel(
      "gpt-5.6-luna",
      { streaming: false, providerOptions: { openai: { store: true } } },
    );
    expect(await collect(model.stream(message))).toMatchObject([
      { type: "text-delta" },
      { type: "finish" },
    ]);
  });
  it.each([
    { stopSequences: ["STOP"] },
    { reasoning: { maxTokens: 0 } },
    { reasoning: { includeThoughts: true } },
  ])("rejects unsupported explicit settings %#", (options) => {
    expect(() =>
      createResponsesRequest("gpt-5.6-luna", message, options, false),
    ).toThrow();
  });
  it("never silently downgrades an unknown reasoning effort", () => {
    expect(
      createResponsesRequest(
        "gpt-5.6-luna",
        message,
        { reasoning: { effort: "future-effort" } },
        false,
      ),
    ).toMatchObject({ reasoning: { effort: "future-effort" } });
  });
  it("surfaces HTTP and malformed JSON errors", async () => {
    for (const response of [
      new Response('{"error":{"message":"bad model"}}', { status: 400 }),
      new Response("invalid"),
    ]) {
      await expect(
        createOpenAI({ apiKey: "test", fetch: async () => response })
          .getModel("gpt-5.6-luna")
          .invoke(message),
      ).rejects.toThrow();
    }
  });
});
