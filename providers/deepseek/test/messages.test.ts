import { describe, expect, it } from "vitest";
import { createChatCompletionRequest } from "../src/messages";

describe("deepseek message mapping", () => {
  it("lets explicit provider thinking settings override generic reasoning", () => {
    const request = createChatCompletionRequest(
      "deepseek-reasoner",
      [{ role: "user", content: "Solve this" }],
      {
        temperature: 0.2,
        maxOutputTokens: 512,
        stopSequences: ["DONE"],
        reasoning: { effort: "high" },
        providerOptions: {
          deepseek: {
            thinking: { type: "disabled" },
          },
        },
      },
      true,
    );

    expect(request).toMatchObject({
      model: "deepseek-reasoner",
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2,
      max_tokens: 512,
      stop: ["DONE"],
      thinking: { type: "disabled" },
    });
    expect(request.messages).toEqual([{ role: "user", content: "Solve this" }]);
  });

  it("maps JSON mode and generic reasoning into DeepSeek request fields", () => {
    const request = createChatCompletionRequest(
      "deepseek-chat",
      [{ role: "assistant", content: "Previous answer" }],
      {
        reasoning: { effort: "medium" },
        responseFormat: {
          type: "json",
          schema: { type: "object" },
        },
      },
      false,
    );

    expect(request).toMatchObject({
      stream: false,
      temperature: 0.7,
      response_format: { type: "json_object" },
      thinking: { type: "enabled" },
    });
    expect(request.messages).toEqual([
      {
        role: "system",
        content:
          'Return JSON. Return JSON that conforms to this schema: {"type":"object"}',
      },
      { role: "assistant", content: "Previous answer" },
    ]);
  });

  it("disables thinking for zero reasoning budget and uses an empty user fallback", () => {
    const request = createChatCompletionRequest(
      "deepseek-chat",
      [],
      { reasoning: { maxTokens: 0 } },
      false,
    );

    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.messages).toEqual([{ role: "user", content: "" }]);
  });

  it("maps Kortyx tools and tool result messages to DeepSeek chat completions", () => {
    const request = createChatCompletionRequest(
      "deepseek-chat",
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
            inputSchema: { type: "object" },
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
          parameters: { type: "object" },
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
