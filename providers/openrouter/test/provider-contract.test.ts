import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod";
import { jevOutputSchema } from "../src/jev";
import { createOpenRouter } from "../src/provider";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

const sseResponse = (events: unknown[]): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};

const collect = async (
  stream:
    | AsyncIterable<KortyxStreamPart>
    | Promise<AsyncIterable<KortyxStreamPart>>,
): Promise<KortyxStreamPart[]> => {
  const parts: KortyxStreamPart[] = [];
  for await (const part of await stream) parts.push(part);
  return parts;
};

describe("OpenRouter public provider contract", () => {
  it("normalizes a chat result and sends OpenRouter attribution headers", async () => {
    const provider = createOpenRouter({
      apiKey: "test-key",
      appTitle: "Wolly",
      httpReferer: "https://workfully.com",
      fetch: async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        expect(request.url).toBe(
          "https://openrouter.ai/api/v1/chat/completions",
        );
        const headers = request.headers;
        expect(headers.get("authorization")).toBe("Bearer test-key");
        expect(headers.get("x-openrouter-title")).toBe("Wolly");
        expect(headers.get("http-referer")).toBe("https://workfully.com");
        expect(headers.get("x-openrouter-metadata")).toBe("enabled");
        expect(JSON.parse(await request.clone().text())).toMatchObject({
          model: "anthropic/claude-sonnet-4.6",
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        });
        return jsonResponse({
          id: "gen-1",
          object: "chat.completion",
          created: 1,
          model: "anthropic/claude-sonnet-4.6",
          system_fingerprint: null,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: "Hello from Claude",
                reasoning_details: [
                  { type: "reasoning.text", text: "reason", signature: "sig" },
                ],
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 7,
            total_tokens: 17,
            cost: 0.001,
            is_byok: false,
            completion_tokens_details: { reasoning_tokens: 2 },
            prompt_tokens_details: { cached_tokens: 3 },
          },
        });
      },
    });

    const result = await provider
      .getModel("anthropic/claude-sonnet-4.6")
      .invoke([{ role: "user", content: "Hello" }]);

    expect(result).toMatchObject({
      content: "Hello from Claude",
      finishReason: { unified: "stop", raw: "stop" },
      usage: { input: 10, output: 7, total: 17, reasoning: 2, cacheRead: 3 },
      providerMetadata: {
        providerId: "openrouter",
        modelId: "anthropic/claude-sonnet-4.6",
        responseId: "gen-1",
        cost: 0.001,
        isByok: false,
      },
      continuation: { providerId: "openrouter", api: "chat-completions" },
    });
  });

  it("assembles streamed tool calls and retains usage from the terminal chunk", async () => {
    const base = {
      id: "gen-stream",
      object: "chat.completion.chunk",
      created: 1,
      model: "openai/gpt-5.2",
    };
    const provider = createOpenRouter({
      apiKey: "test-key",
      fetch: async () =>
        sseResponse([
          {
            ...base,
            choices: [
              {
                index: 0,
                finish_reason: null,
                delta: {
                  role: "assistant",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call-1",
                      type: "function",
                      function: { name: "lookup", arguments: '{"id":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            ...base,
            choices: [
              {
                index: 0,
                finish_reason: "tool_calls",
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: "42}" } }],
                },
              },
            ],
          },
          {
            ...base,
            choices: [],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30,
            },
          },
        ]),
    });

    const parts = await collect(
      provider
        .getModel("openai/gpt-5.2")
        .stream([{ role: "user", content: "Look up 42" }]),
    );

    expect(parts).toMatchObject([
      {
        type: "finish",
        finishReason: { unified: "tool-calls" },
        toolCalls: [{ id: "call-1", name: "lookup", input: { id: 42 } }],
        usage: { input: 20, output: 10, total: 30 },
      },
    ]);
  });

  it("uses Jev as a regular model through its native System One contract", async () => {
    const schema = jevOutputSchema({
      queue: {
        type: "choice",
        instructions: "Choose the queue",
        criteria: { billing: "Billing issue", technical: "Technical issue" },
      },
      urgency: {
        type: "score",
        instructions: "Score the urgency",
        criteria: ["Can wait", "Important", "Blocked"],
      },
      needsHuman: {
        type: "noul",
        instructions: "Does this need a human?",
      },
    });
    const provider = createOpenRouter({
      apiKey: "test-key",
      fetch: async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        expect(request.url).toBe("https://openrouter.ai/api/v1/systemone");
        expect(JSON.parse(await request.clone().text())).toMatchObject({
          model: "typesafe/jev-1.13",
          state: "My invoice is wrong",
          questions: { queue: { type: "choice" } },
        });
        return jsonResponse({
          id: "decision-1",
          model: "typesafe/jev-1.13",
          provider: "TypeSafe",
          answers: {
            queue: {
              type: "choice",
              choice: "billing",
              confidence: 0.92,
              probabilities: { billing: 0.92, technical: 0.08 },
            },
            urgency: {
              type: "score",
              score: 1.7,
              confidence: 0.8,
              probabilities: { "0": 0.05, "1": 0.25, "2": 0.7 },
            },
            needsHuman: { type: "noul", noul: 0.81 },
          },
          usage: { input_tokens: 12, output_tokens: 1, cost: 0.0002 },
        });
      },
    });

    const result = await provider
      .getModel("typesafe/jev-1.13", {
        streaming: false,
        temperature: 0.2,
        maxOutputTokens: 100,
        responseFormat: { type: "json", schema: toJSONSchema(schema) },
      })
      .invoke([{ role: "user", content: "My invoice is wrong" }]);

    expect(result).toMatchObject({
      content: '{"queue":"billing","urgency":1.7,"needsHuman":0.81}',
      finishReason: { unified: "stop" },
      usage: { input: 12, output: 1, total: 13 },
      warnings: [
        { type: "unsupported", feature: "temperature" },
        { type: "unsupported", feature: "maxOutputTokens" },
      ],
      providerMetadata: {
        providerId: "openrouter",
        api: "system-one",
        responseId: "decision-1",
        cost: 0.0002,
        answers: {
          queue: { type: "choice", choice: "billing", confidence: 0.92 },
        },
      },
    });
  });

  it("rejects unsupported Jev features before making a request", () => {
    let fetchCalls = 0;
    const provider = createOpenRouter({
      apiKey: "test-key",
      fetch: async () => {
        fetchCalls += 1;
        return jsonResponse({});
      },
    });
    const schema = jevOutputSchema({
      queue: {
        type: "choice",
        instructions: "Choose",
        criteria: { one: "First", two: "Second" },
      },
    });
    const responseFormat = {
      type: "json" as const,
      schema: toJSONSchema(schema),
    };

    expect(() =>
      provider.getModel("typesafe/jev-1.13", {
        responseFormat,
        tools: [{ name: "lookup", inputSchema: { type: "object" } }],
      }),
    ).toThrow("do not support tools");
    expect(() => provider.getModel("typesafe/jev-1.13")).toThrow(
      "jevOutputSchema",
    );
    expect(fetchCalls).toBe(0);
  });

  it("validates model ids and defers API-key loading until use", async () => {
    const provider = createOpenRouter({});
    expect(provider.id).toBe("openrouter");
    expect(() => provider(" ")).toThrow("model id must be a non-empty string");
    expect(() => provider.getModel(" ")).toThrow(
      "model id must be a non-empty string",
    );
    await expect(
      provider
        .getModel("openai/gpt-5.2")
        .invoke([{ role: "user", content: "Hello" }]),
    ).rejects.toThrow("requires an API key");
  });
});
