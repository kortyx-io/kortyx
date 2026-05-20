import { describe, expect, it } from "vitest";
import { createMessagesRequest, getThinkingRequest } from "../src/messages";

describe("anthropic message mapping", () => {
  it("maps system prompts, merged turns, thinking, and provider options", () => {
    const request = createMessagesRequest(
      "claude-sonnet-4-5",
      [
        { role: "system", content: "Be precise." },
        { role: "system", content: "  " },
        { role: "user", content: "First user turn" },
        { role: "user", content: "Second user turn" },
        { role: "assistant", content: "Draft answer" },
        { role: "assistant", content: "Refined answer" },
      ],
      {
        temperature: 0.8,
        maxOutputTokens: 256,
        stopSequences: ["END"],
        responseFormat: {
          type: "json",
          schema: { type: "object" },
        },
        reasoning: { maxTokens: 2000 },
        providerOptions: {
          anthropic: {
            top_p: 0.9,
            top_k: 20,
          },
        },
      },
      true,
    );

    expect(request).toMatchObject({
      model: "claude-sonnet-4-5",
      stream: true,
      max_tokens: 2256,
      stop_sequences: ["END"],
      top_p: 0.9,
      top_k: 20,
      thinking: { type: "enabled", budget_tokens: 2000 },
      system:
        'Return JSON. Return JSON that conforms to this schema: {"type":"object"}\n\nBe precise.',
    });
    expect(request).not.toHaveProperty("temperature");
    expect(request.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "First user turn" },
          { type: "text", text: "Second user turn" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Draft answer" },
          { type: "text", text: "Refined answer" },
        ],
      },
    ]);
  });

  it("applies thinking provider overrides and minimum budgets", () => {
    expect(
      getThinkingRequest({
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled", budgetTokens: 12 },
          },
        },
      }),
    ).toEqual({ type: "enabled", budget_tokens: 1024 });

    expect(
      getThinkingRequest({
        providerOptions: {
          thinking: { type: "enabled", budget_tokens: 2048 },
        },
      }),
    ).toEqual({ type: "enabled", budget_tokens: 2048 });

    expect(
      getThinkingRequest({
        reasoning: { maxTokens: 0 },
      }),
    ).toEqual({ type: "disabled" });
  });

  it("uses an empty user fallback for system-only prompts", () => {
    const request = createMessagesRequest(
      "claude-haiku-4-5",
      [{ role: "system", content: "Stay brief." }],
      {
        temperature: 0.4,
      },
      false,
    );

    expect(request).toMatchObject({
      max_tokens: 1024,
      temperature: 0.4,
      system: "Stay brief.",
    });
    expect(request.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "" }] },
    ]);
  });
});
