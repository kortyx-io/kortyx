import { describe, expect, it } from "vitest";
import { createChatRequest, toMessages } from "../src/messages";

describe("OpenRouter message mapping", () => {
  it("disables strict mode for mapped tool definitions", () => {
    const request = createChatRequest(
      "openai/gpt-5.4-mini",
      [{ role: "user", content: "Find engineering jobs in Spain" }],
      {
        tools: [
          {
            name: "list_jobs",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                city: { type: "string" },
              },
              required: ["query"],
              additionalProperties: false,
            },
          },
        ],
      },
      false,
    );

    expect(request.tools).toEqual([
      {
        type: "function",
        function: {
          name: "list_jobs",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              city: { type: "string" },
            },
            required: ["query"],
            additionalProperties: false,
          },
          strict: false,
        },
      },
    ]);
  });

  it("maps normalized options and preserves OpenRouter routing controls", () => {
    const request = createChatRequest(
      "anthropic/claude-sonnet-4.6",
      [{ role: "user", content: "Classify this" }],
      {
        temperature: 0.2,
        maxOutputTokens: 200,
        stopSequences: ["END"],
        reasoning: { effort: "high", includeThoughts: true },
        responseFormat: {
          type: "json",
          name: "classification",
          schema: {
            type: "object",
            properties: { label: { type: "string" } },
            required: ["label"],
          },
        },
        tools: [
          {
            name: "lookup",
            description: "Look up a record",
            inputSchema: {
              type: "object",
              properties: { id: { type: "number" } },
            },
          },
        ],
        providerOptions: {
          openrouter: {
            models: ["google/gemini-3.1-pro"],
            provider: { zdr: true },
          },
        },
      },
      false,
    );

    expect(request).toMatchObject({
      model: "anthropic/claude-sonnet-4.6",
      stream: false,
      temperature: 0.2,
      maxCompletionTokens: 200,
      stop: ["END"],
      reasoning: { effort: "high", summary: "auto" },
      models: ["google/gemini-3.1-pro"],
      provider: { zdr: true, requireParameters: true },
      responseFormat: {
        type: "json_schema",
        jsonSchema: { name: "classification", strict: true },
      },
      tools: [{ type: "function", function: { name: "lookup" } }],
    });
  });

  it("replays OpenRouter reasoning details and rejects foreign continuations", () => {
    expect(
      toMessages([
        {
          role: "assistant",
          content: "",
          continuation: {
            providerId: "openrouter",
            api: "chat-completions",
            items: [
              { type: "reasoning.text", text: "private", signature: "sig" },
            ],
          },
        },
      ]),
    ).toMatchObject([
      {
        role: "assistant",
        reasoningDetails: [{ type: "reasoning.text", text: "private" }],
      },
    ]);

    expect(() =>
      toMessages([
        {
          role: "assistant",
          content: "",
          continuation: {
            providerId: "anthropic",
            api: "messages",
            items: [],
          },
        },
      ]),
    ).toThrow("Cannot use another provider's continuation");
  });
});
