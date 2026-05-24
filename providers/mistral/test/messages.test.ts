import { describe, expect, it } from "vitest";
import {
  createChatCompletionRequest,
  modelSupportsReasoningEffort,
  normalizeReasoningEffort,
} from "../src/messages";

describe("mistral message mapping", () => {
  it("maps provider options and strict structured output settings", () => {
    const request = createChatCompletionRequest(
      "mistral-small-latest",
      [{ role: "user", content: "Extract the fields" }],
      {
        temperature: 0.3,
        maxOutputTokens: 200,
        responseFormat: {
          type: "json",
          schema: { type: "object" },
          name: "Extraction",
        },
        providerOptions: {
          mistral: {
            safePrompt: true,
            topP: 0.8,
            randomSeed: 42,
            strictJsonSchema: true,
            reasoningEffort: "none",
          },
        },
      },
      true,
    );

    expect(request).toMatchObject({
      model: "mistral-small-latest",
      stream: true,
      temperature: 0.3,
      max_tokens: 200,
      top_p: 0.8,
      random_seed: 42,
      safe_prompt: true,
      reasoning_effort: "none",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "Extraction",
          schema: { type: "object" },
          strict: true,
        },
      },
    });
    expect(request.messages).toEqual([
      { role: "user", content: "Extract the fields" },
    ]);
  });

  it("adds JSON instruction only for schema-less JSON mode and preserves user fallback", () => {
    const request = createChatCompletionRequest(
      "mistral-large-latest",
      [{ role: "system", content: "Use terse language." }],
      {
        responseFormat: { type: "json" },
        providerOptions: {
          structuredOutputs: false,
        },
      },
      false,
    );

    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request).not.toHaveProperty("reasoning_effort");
    expect(request.messages).toEqual([
      { role: "system", content: "Return JSON." },
      { role: "system", content: "Use terse language." },
      { role: "user", content: "" },
    ]);
  });

  it("normalizes reasoning only for models that support it", () => {
    expect(modelSupportsReasoningEffort("mistral-small-latest")).toBe(true);
    expect(modelSupportsReasoningEffort("mistral-large-latest")).toBe(false);
    expect(
      normalizeReasoningEffort("mistral-small-2603", {
        reasoning: { includeThoughts: false },
      }),
    ).toBe("high");
    expect(
      normalizeReasoningEffort("mistral-small-2603", {
        reasoning: { maxTokens: 0 },
      }),
    ).toBe("none");
    expect(
      normalizeReasoningEffort("mistral-large-latest", {
        reasoning: { effort: "high" },
      }),
    ).toBeUndefined();
  });

  it("maps Kortyx tools and tool result messages to Mistral chat completions", () => {
    const request = createChatCompletionRequest(
      "mistral-large-latest",
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
