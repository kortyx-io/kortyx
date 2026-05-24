import { describe, expect, it } from "vitest";
import { createChatCompletionRequest } from "../src/messages";

describe("openai message mapping", () => {
  it("keeps non-reasoning parameters for gpt-5 models when reasoning is disabled", () => {
    const request = createChatCompletionRequest(
      "gpt-5.4-mini",
      [{ role: "system", content: "Use the product voice." }],
      {
        temperature: 0.1,
        maxOutputTokens: 99,
        responseFormat: {
          type: "json",
          schema: { type: "object" },
          name: "IgnoredByJsonObject",
        },
        providerOptions: {
          openai: {
            reasoningEffort: "none",
            systemMessageMode: "remove",
            structuredOutputs: false,
            maxCompletionTokens: 123,
            serviceTier: "priority",
            store: true,
            metadata: {
              traceId: "trace-1",
              ignored: 42,
            },
          },
        },
      },
      true,
    );

    expect(request).toMatchObject({
      model: "gpt-5.4-mini",
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.1,
      max_completion_tokens: 123,
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      service_tier: "priority",
      store: true,
      metadata: { traceId: "trace-1" },
    });
    expect(request).not.toHaveProperty("max_tokens");
    expect(request.messages).toEqual([
      {
        role: "system",
        content:
          'Return JSON. Return JSON that conforms to this schema: {"type":"object"}',
      },
      { role: "user", content: "" },
    ]);
  });

  it("uses developer messages and reasoning restrictions for reasoning models", () => {
    const request = createChatCompletionRequest(
      "o3-mini",
      [
        { role: "system", content: "Think carefully." },
        { role: "user", content: "Plan this migration" },
      ],
      {
        temperature: 0.9,
        maxOutputTokens: 256,
        reasoning: { effort: "minimal" },
        responseFormat: {
          type: "json",
          schema: { type: "object", required: ["steps"] },
          name: "MigrationPlan",
        },
        providerOptions: {
          strictJsonSchema: false,
        },
      },
      false,
    );

    expect(request).toMatchObject({
      model: "o3-mini",
      stream: false,
      max_completion_tokens: 256,
      reasoning_effort: "minimal",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "MigrationPlan",
          schema: { type: "object", required: ["steps"] },
          strict: false,
        },
      },
    });
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("max_tokens");
    expect(request.messages).toEqual([
      {
        role: "developer",
        content:
          'Return JSON. Return JSON that conforms to this schema: {"type":"object","required":["steps"]}',
      },
      { role: "developer", content: "Think carefully." },
      { role: "user", content: "Plan this migration" },
    ]);
  });

  it("falls back to an empty user message when no user-visible prompt remains", () => {
    const request = createChatCompletionRequest("gpt-4.1-mini", [], {}, false);

    expect(request.messages).toEqual([{ role: "user", content: "" }]);
  });

  it("maps Kortyx tools and tool result messages to OpenAI chat completions", () => {
    const request = createChatCompletionRequest(
      "gpt-4.1-mini",
      [
        { role: "user", content: "Check order ord_1" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call-1",
              name: "lookup_order",
              input: { orderId: "ord_1" },
            },
          ],
        },
        {
          role: "tool",
          content: '{"status":"ready"}',
          toolCallId: "call-1",
          name: "lookup_order",
        },
      ],
      {
        tools: [
          {
            name: "lookup_order",
            description: "Look up an order.",
            inputSchema: {
              type: "object",
              properties: { orderId: { type: "string" } },
              required: ["orderId"],
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
          name: "lookup_order",
          description: "Look up an order.",
          parameters: {
            type: "object",
            properties: { orderId: { type: "string" } },
            required: ["orderId"],
          },
        },
      },
    ]);
    expect(request.messages).toEqual([
      { role: "user", content: "Check order ord_1" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "lookup_order",
              arguments: '{"orderId":"ord_1"}',
            },
          },
        ],
      },
      {
        role: "tool",
        content: '{"status":"ready"}',
        tool_call_id: "call-1",
        name: "lookup_order",
      },
    ]);
  });
});
