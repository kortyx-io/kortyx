import { describe, expect, it } from "vitest";
import { createChatCompletionRequest } from "../src/messages";

describe("groq message mapping", () => {
  it("maps nested Groq provider options into chat completion requests", () => {
    const request = createChatCompletionRequest(
      "openai/gpt-oss-120b",
      [{ role: "user", content: "Return a compact summary" }],
      {
        maxOutputTokens: 64,
        stopSequences: ["END"],
        responseFormat: {
          type: "json",
          schema: { type: "object" },
          name: "Summary",
        },
        providerOptions: {
          groq: {
            reasoningEffort: "high",
            reasoningFormat: "parsed",
            serviceTier: "performance",
            structuredOutputs: false,
          },
        },
      },
      false,
    );

    expect(request).toMatchObject({
      model: "openai/gpt-oss-120b",
      stream: false,
      temperature: 0.7,
      max_tokens: 64,
      stop: ["END"],
      response_format: { type: "json_object" },
      reasoning_effort: "high",
      reasoning_format: "parsed",
      service_tier: "performance",
    });
    expect(request).not.toHaveProperty("stream_options");
    expect(request.messages).toEqual([
      {
        role: "system",
        content:
          'Return JSON. Return JSON that conforms to this schema: {"type":"object"}',
      },
      { role: "user", content: "Return a compact summary" },
    ]);
  });

  it("normalizes generic reasoning options and strict structured outputs", () => {
    const request = createChatCompletionRequest(
      "deepseek-r1-distill-llama-70b",
      [],
      {
        reasoning: { effort: "minimal" },
        responseFormat: {
          type: "json",
          schema: { type: "object", additionalProperties: false },
        },
        providerOptions: {
          strictJsonSchema: false,
          serviceTier: "auto",
        },
      },
      true,
    );

    expect(request).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: "low",
      service_tier: "auto",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "response",
          schema: { type: "object", additionalProperties: false },
          strict: false,
        },
      },
    });
    expect(request.messages).toEqual([
      {
        role: "system",
        content:
          'Return JSON. Return JSON that conforms to this schema: {"type":"object","additionalProperties":false}',
      },
    ]);
  });

  it("falls back to an empty user message when no prompt is provided", () => {
    const request = createChatCompletionRequest(
      "llama-3.3-70b-versatile",
      [],
      {},
      false,
    );

    expect(request.messages).toEqual([{ role: "user", content: "" }]);
  });
});
