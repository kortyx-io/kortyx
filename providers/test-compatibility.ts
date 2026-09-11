import { describe, expect, it } from "vitest";
import type {
  KortyxPromptMessage,
  KortyxStreamPart,
  ProviderInstance,
} from "../packages/providers/src/types";

export type Vendor = "anthropic" | "google" | "deepseek" | "groq" | "mistral";
export const testModels: Record<Vendor, string> = {
  anthropic: "claude-sonnet-4-6",
  google: "gemini-3-flash-preview",
  deepseek: "deepseek-v4-pro",
  groq: "openai/gpt-oss-120b",
  mistral: "mistral-medium-3-5",
};
const tool = {
  id: "call_a",
  type: "function",
  function: { name: "lookup", arguments: '{"key":"a"}' },
};
export const toolResponse = (vendor: Vendor, round = 1): unknown => {
  const marker = `private-state-${round}`;
  if (vendor === "anthropic")
    return {
      content: [
        { type: "thinking", thinking: marker, signature: `signature-${round}` },
        { type: "redacted_thinking", data: `redacted-${round}` },
        {
          type: "tool_use",
          id: `call_${round}`,
          name: "lookup",
          input: { key: String(round) },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  if (vendor === "google")
    return {
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: marker },
              {
                functionCall: {
                  id: `call_${round}`,
                  name: "lookup",
                  args: { key: String(round) },
                },
                thoughtSignature: `signature-${round}`,
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content:
            vendor === "mistral"
              ? [
                  {
                    type: "thinking",
                    thinking: [{ type: "text", text: marker }],
                    closed: true,
                  },
                ]
              : "",
          reasoning_content: marker,
          tool_calls: [{ ...tool, id: `call_${round}` }],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
};
export const textResponse = (vendor: Vendor, text: string): unknown => {
  if (vendor === "anthropic")
    return {
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  if (vendor === "google")
    return {
      candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };
  return {
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
};
const textEvent = (v: Vendor, text: string): unknown =>
  v === "anthropic"
    ? {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      }
    : v === "google"
      ? { candidates: [{ content: { parts: [{ text }] } }] }
      : { choices: [{ delta: { content: text } }] };
const terminal = (v: Vendor): unknown[] =>
  v === "anthropic"
    ? [
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
        { type: "message_stop" },
      ]
    : v === "google"
      ? [{ candidates: [{ finishReason: "STOP" }] }]
      : [
          { choices: [{ delta: {}, finish_reason: "stop" }] },
          {
            choices: [],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          },
        ];
export const wire = (events: unknown[]): string =>
  events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const json = (response: unknown) =>
  new Response(JSON.stringify(response), {
    headers: { "content-type": "application/json" },
  });
const collect = async (
  stream: ReturnType<ReturnType<ProviderInstance["getModel"]>["stream"]>,
) => {
  const parts: KortyxStreamPart[] = [];
  for await (const part of await stream) parts.push(part);
  return parts;
};
export function describeCompatibility(
  vendor: Vendor,
  factory: (settings: {
    apiKey: string;
    fetch: typeof fetch;
  }) => ProviderInstance,
) {
  const prompt: KortyxPromptMessage[] = [
    { role: "user", content: "Look up values." },
  ];
  describe(`${vendor} protocol compatibility`, () => {
    it("replays two complete reasoning/tool rounds with original call IDs", async () => {
      const requests: unknown[] = [];
      const model = factory({
        apiKey: "fixture",
        fetch: async (_url, init) => {
          requests.push(JSON.parse(String(init?.body)));
          return json(toolResponse(vendor, requests.length));
        },
      }).getModel(testModels[vendor], { reasoning: { effort: "medium" } });
      const messages = [...prompt];
      for (let round = 1; round <= 2; round++) {
        const result = await model.invoke(messages);
        expect(result.content).not.toContain("private-state");
        expect(result.toolCalls?.[0]?.id).toBe(`call_${round}`);
        expect(result.continuation).toBeDefined();
        messages.push(
          {
            role: "assistant",
            content: result.content,
            toolCalls: result.toolCalls,
            ...(result.continuation
              ? { continuation: result.continuation }
              : {}),
          },
          {
            role: "tool",
            name: "lookup",
            toolCallId: `call_${round}`,
            content: String(round),
          },
        );
      }
      await model.invoke(messages);
      if (vendor !== "groq") {
        expect(JSON.stringify(requests[2])).toContain("private-state-1");
        expect(JSON.stringify(requests[2])).toContain("private-state-2");
      }
      if (vendor === "anthropic" || vendor === "google")
        expect(JSON.stringify(requests[2])).toContain("signature-1");
      if (vendor === "anthropic")
        expect(JSON.stringify(requests[2])).toContain("redacted-1");
    });
    it("fails on truncation instead of fabricating a finish", async () => {
      const model = factory({
        apiKey: "fixture",
        fetch: async () => new Response(wire([textEvent(vendor, "partial")])),
      }).getModel(testModels[vendor]);
      const parts = await collect(model.stream(prompt));
      expect(parts.some((p) => p.type === "error")).toBe(true);
      expect(parts.some((p) => p.type === "finish")).toBe(false);
    });
    it.each([
      "truncation",
      "provider error",
    ])("retains observed usage after %s", async (failure) => {
      const usageEvent =
        vendor === "anthropic"
          ? {
              type: "message_start",
              message: { usage: { input_tokens: 10, output_tokens: 5 } },
            }
          : vendor === "google"
            ? {
                usageMetadata: {
                  promptTokenCount: 10,
                  candidatesTokenCount: 5,
                  totalTokenCount: 15,
                },
              }
            : {
                choices: [],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 5,
                  total_tokens: 15,
                },
              };
      const model = factory({
        apiKey: "fixture",
        fetch: async () =>
          new Response(
            wire([
              textEvent(vendor, "partial"),
              usageEvent,
              ...(failure === "provider error"
                ? [{ type: "error", error: { message: "provider failure" } }]
                : []),
            ]),
          ),
      }).getModel(testModels[vendor]);
      const parts = await collect(model.stream(prompt));
      expect(parts.at(-1)).toMatchObject({
        type: "error",
        error: { usage: { total: 15 } },
      });
    });
    it("rejects error envelopes returned with HTTP 200", async () => {
      const model = factory({
        apiKey: "fixture",
        fetch: async () => json({ error: { message: "provider failure" } }),
      }).getModel(testModels[vendor]);
      await expect(model.invoke(prompt)).rejects.toThrow("provider failure");
    });
    it("cancels and releases the reader when a consumer exits", async () => {
      let cancelled = false;
      const body = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(wire([textEvent(vendor, "first")])),
          );
        },
        cancel() {
          cancelled = true;
        },
      });
      const model = factory({
        apiKey: "fixture",
        fetch: async () => new Response(body),
      }).getModel(testModels[vendor]);
      for await (const part of await model.stream(prompt))
        if (part.type === "text-delta") break;
      expect(cancelled).toBe(true);
      expect(body.locked).toBe(false);
    });
    it("preserves repeated deltas, UTF-8 and split CRLF boundaries", async () => {
      const bytes = new TextEncoder().encode(
        wire([
          textEvent(vendor, "é"),
          textEvent(vendor, "é"),
          ...terminal(vendor),
        ]).replaceAll("\n", "\r\n"),
      );
      const body = new ReadableStream({
        start(c) {
          for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
          c.close();
        },
      });
      const model = factory({
        apiKey: "fixture",
        fetch: async () => new Response(body),
      }).getModel(testModels[vendor]);
      const parts = await collect(model.stream(prompt));
      expect(
        parts
          .filter((p) => p.type === "text-delta")
          .map((p) => p.delta)
          .join(""),
      ).toBe("éé");
      expect(parts.at(-1)?.type).toBe("finish");
    });
    if (["deepseek", "groq", "mistral"].includes(vendor)) {
      it("assembles interleaved tool argument deltas and trailing usage", async () => {
        const events = [
          {
            choices: [
              {
                delta: {
                  reasoning_content: "private-state",
                  tool_calls: [
                    {
                      index: 1,
                      id: "call_b",
                      type: "function",
                      function: { name: "lookup", arguments: '{"key":' },
                    },
                    {
                      index: 0,
                      id: "call_a",
                      type: "function",
                      function: { name: "lookup", arguments: '{"key":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '"a"}' } },
                    { index: 1, function: { arguments: '"b"}' } },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          },
          {
            choices: [],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          },
        ];
        const model = factory({
          apiKey: "fixture",
          fetch: async () => new Response(wire(events)),
        }).getModel(testModels[vendor]);
        const parts = await collect(model.stream(prompt));
        expect(parts.at(-1)).toMatchObject({
          type: "finish",
          toolCalls: [
            { id: "call_a", input: { key: "a" } },
            { id: "call_b", input: { key: "b" } },
          ],
          finishReason: { unified: "tool-calls" },
          usage: { total: 15 },
          continuation: { providerId: vendor },
        });
      });
      it("rejects malformed streamed function arguments", async () => {
        const model = factory({
          apiKey: "fixture",
          fetch: async () =>
            new Response(
              wire([
                {
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            ...tool,
                            function: { name: "lookup", arguments: "{broken" },
                          },
                        ],
                      },
                      finish_reason: "tool_calls",
                    },
                  ],
                },
              ]),
            ),
        }).getModel(testModels[vendor]);
        expect((await collect(model.stream(prompt))).at(-1)?.type).toBe(
          "error",
        );
      });
    }
  });
}

export function describeOptions(
  vendor: Vendor,
  factory: (settings: {
    apiKey: string;
    fetch: typeof fetch;
  }) => ProviderInstance,
) {
  const schema = {
    type: "object",
    properties: {
      additionalProperties: { type: "string" },
      default: { type: "string" },
    },
    required: ["additionalProperties", "default"],
    additionalProperties: false,
  };
  const prompt: KortyxPromptMessage[] = [
    { role: "user", content: "Return JSON." },
  ];
  describe(`${vendor} reasoning and schema options`, () => {
    it("honors supported reasoning settings and native schema fields", async () => {
      let request: Record<string, unknown> = {};
      const model = factory({
        apiKey: "fixture",
        fetch: async (_url, init) => {
          request = JSON.parse(String(init?.body));
          return json(
            textResponse(
              vendor,
              '{"additionalProperties":"yes","default":"yes"}',
            ),
          );
        },
      }).getModel(testModels[vendor], {
        reasoning: { effort: "high" },
        responseFormat: { type: "json", schema },
      });
      await model.invoke(prompt);
      if (vendor === "anthropic")
        expect(request).toMatchObject({
          thinking: { type: "adaptive" },
          output_config: {
            effort: "high",
            format: { type: "json_schema", schema },
          },
        });
      if (vendor === "google")
        expect(request).toMatchObject({
          generationConfig: {
            thinkingConfig: { thinkingLevel: "high" },
            responseJsonSchema: schema,
          },
        });
      if (vendor === "deepseek")
        expect(request).toMatchObject({
          reasoning_effort: "high",
          thinking: { type: "enabled" },
        });
      if (vendor === "mistral" || vendor === "groq")
        expect(request).toMatchObject({
          reasoning_effort: "high",
          response_format: { type: "json_schema", json_schema: { schema } },
        });
    });
    it("never enables reasoning when none was requested", async () => {
      let request: Record<string, unknown> = {};
      const model = factory({
        apiKey: "fixture",
        fetch: async (_url, init) => {
          request = JSON.parse(String(init?.body));
          return json(textResponse(vendor, "ok"));
        },
      }).getModel(testModels[vendor], { reasoning: { effort: "none" } });
      if (vendor === "google" || vendor === "groq")
        await expect(model.invoke(prompt)).rejects.toThrow(/disable/);
      else {
        await model.invoke(prompt);
        expect(request).toMatchObject(
          vendor === "mistral"
            ? { reasoning_effort: "none" }
            : { thinking: { type: "disabled" } },
        );
      }
    });
    if (vendor === "google") {
      it("maps effort to budgets on Gemini 2.5 without fallback requests", async () => {
        const requests: unknown[] = [];
        const provider = factory({
          apiKey: "fixture",
          fetch: async (_url, init) => {
            requests.push(JSON.parse(String(init?.body)));
            return json(textResponse(vendor, "ok"));
          },
        });
        await provider
          .getModel("gemini-2.5-flash", { reasoning: { effort: "medium" } })
          .invoke(prompt);
        await provider
          .getModel("gemini-2.5-flash", { reasoning: { effort: "none" } })
          .invoke(prompt);
        expect(requests).toMatchObject([
          { generationConfig: { thinkingConfig: { thinkingBudget: 8192 } } },
          { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } },
        ]);
      });
      it("preserves referenced tool schemas and real function identifiers", async () => {
        const inputSchema = {
          $defs: { Key: { type: "string" } },
          type: "object",
          properties: { default: { $ref: "#/$defs/Key" } },
        };
        let body: unknown;
        const provider = factory({
          apiKey: "fixture",
          fetch: async (_url, init) => {
            body = JSON.parse(String(init?.body));
            return json(toolResponse(vendor));
          },
        });
        await provider
          .getModel(testModels[vendor], {
            tools: [{ name: "lookup", inputSchema }],
          })
          .invoke(prompt);
        expect(body).toMatchObject({
          tools: [
            { functionDeclarations: [{ parametersJsonSchema: inputSchema }] },
          ],
        });
      });
    }
    if (vendor === "groq") {
      it("buffers native schema output and rejects direct schema-plus-tools", async () => {
        let body: unknown;
        const provider = factory({
          apiKey: "fixture",
          fetch: async (_url, init) => {
            body = JSON.parse(String(init?.body));
            return json(textResponse(vendor, "{}"));
          },
        });
        const options = { responseFormat: { type: "json" as const, schema } };
        const model = provider.getModel(testModels[vendor], options);
        expect((await collect(model.stream(prompt))).at(-1)?.type).toBe(
          "finish",
        );
        expect(body).toMatchObject({ stream: false });
        await expect(
          provider
            .getModel(testModels[vendor], {
              ...options,
              tools: [{ name: "lookup", inputSchema: {} }],
            })
            .invoke(prompt),
        ).rejects.toThrow("cannot combine");
      });
    }
    if (vendor === "anthropic") {
      it("rejects incomplete streamed tool blocks", async () => {
        const model = factory({
          apiKey: "fixture",
          fetch: async () =>
            new Response(
              wire([
                {
                  type: "content_block_start",
                  index: 0,
                  content_block: { type: "tool_use", id: "call_a", input: {} },
                },
                { type: "message_delta", delta: { stop_reason: "tool_use" } },
                { type: "message_stop" },
              ]),
            ),
        }).getModel(testModels[vendor]);
        const parts = await collect(model.stream(prompt));
        expect(parts.at(-1)).toMatchObject({ type: "error" });
        expect(parts.some((part) => part.type === "finish")).toBe(false);
      });
      it("replays streamed thinking, signatures, redactions and tool arguments", async () => {
        const events = [
          { type: "message_start", message: { usage: { input_tokens: 10 } } },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "private" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "signature_delta", signature: "signed" },
          },
          {
            type: "content_block_start",
            index: 1,
            content_block: { type: "redacted_thinking", data: "redacted" },
          },
          {
            type: "content_block_start",
            index: 2,
            content_block: {
              type: "tool_use",
              id: "call_a",
              name: "lookup",
              input: {},
            },
          },
          {
            type: "content_block_delta",
            index: 2,
            delta: { type: "input_json_delta", partial_json: '{"key":' },
          },
          {
            type: "content_block_delta",
            index: 2,
            delta: { type: "input_json_delta", partial_json: '"a"}' },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "tool_use" },
            usage: { output_tokens: 5 },
          },
          { type: "message_stop" },
        ];
        const model = factory({
          apiKey: "fixture",
          fetch: async () => new Response(wire(events)),
        }).getModel(testModels[vendor]);
        const parts = await collect(model.stream(prompt));
        expect(parts).toHaveLength(1);
        expect(parts[0]).toMatchObject({
          type: "finish",
          continuation: {
            items: [
              { type: "thinking", thinking: "private", signature: "signed" },
              { type: "redacted_thinking", data: "redacted" },
              { type: "tool_use", input: { key: "a" } },
            ],
          },
          toolCalls: [{ id: "call_a", input: { key: "a" } }],
        });
      });
    }
  });
}

/** Convert the recorded native shape into its provider's SSE protocol. */
export function responseStream(vendor: Vendor, response: unknown): Response {
  const r = response as {
    content?: Array<Record<string, unknown>>;
    stop_reason?: string;
    usage?: unknown;
    candidates?: Array<Record<string, unknown>>;
    usageMetadata?: unknown;
    choices?: Array<{
      message: Record<string, unknown>;
      finish_reason: string;
    }>;
  };
  if (vendor === "google") return new Response(wire([response]));
  if (vendor === "anthropic") {
    const events: unknown[] = [
      { type: "message_start", message: { usage: r.usage } },
    ];
    for (const [index, block] of (r.content ?? []).entries()) {
      events.push({
        type: "content_block_start",
        index,
        content_block:
          block.type === "text" ? { type: "text", text: "" } : block,
      });
      if (block.type === "text")
        events.push({
          type: "content_block_delta",
          index,
          delta: { type: "text_delta", text: block.text },
        });
      events.push({ type: "content_block_stop", index });
    }
    events.push(
      {
        type: "message_delta",
        delta: { stop_reason: r.stop_reason },
        usage: r.usage,
      },
      { type: "message_stop" },
    );
    return new Response(wire(events));
  }
  const choice = r.choices?.[0];
  const calls = choice?.message.tool_calls as
    | Array<Record<string, unknown>>
    | undefined;
  return new Response(
    wire([
      {
        choices: [
          {
            delta: {
              ...choice?.message,
              ...(calls
                ? {
                    tool_calls: calls.map((call, index) => ({
                      ...call,
                      index,
                    })),
                  }
                : {}),
            },
            finish_reason: choice?.finish_reason,
          },
        ],
      },
      { choices: [], usage: r.usage },
    ]),
  );
}
