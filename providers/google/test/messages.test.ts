import type { KortyxPromptMessage } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import {
  createGenerateContentRequest,
  extractText,
  toContents,
  toSystemInstruction,
} from "../src/messages";

describe("google message mapping", () => {
  it("maps system and conversational messages into Google request parts", () => {
    const messages: KortyxPromptMessage[] = [
      { role: "system", content: " Be direct. " },
      { role: "system", content: "Use JSON only." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ];

    expect(toSystemInstruction(messages)).toBe("Be direct.\n\nUse JSON only.");
    expect(toContents(messages)).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] },
    ]);
  });

  it("uses empty user content when only system messages are provided", () => {
    expect(toContents([{ role: "system", content: "Policy" }])).toEqual([
      { role: "user", parts: [{ text: "" }] },
    ]);
  });

  it("omits thinkingLevel when reasoning maxTokens is also set", () => {
    const request = createGenerateContentRequest(
      [{ role: "user", content: "Summarize this" }],
      {
        reasoning: {
          effort: "low",
          maxTokens: 128,
          includeThoughts: false,
        },
      },
    );

    expect(request.generationConfig?.thinkingConfig).toEqual({
      thinkingBudget: 128,
      includeThoughts: false,
    });
  });

  it("maps response and reasoning options into generation config", () => {
    const request = createGenerateContentRequest(
      [{ role: "user", content: "Summarize this" }],
      {
        temperature: 0.2,
        maxOutputTokens: 300,
        stopSequences: ["STOP"],
        responseFormat: { type: "text" },
        reasoning: {
          effort: "provider-custom",
          includeThoughts: true,
        },
      },
    );

    expect(request.generationConfig).toEqual({
      temperature: 0.2,
      maxOutputTokens: 300,
      stopSequences: ["STOP"],
      responseMimeType: "text/plain",
      thinkingConfig: {
        thinkingLevel: "medium",
        includeThoughts: true,
      },
    });
  });

  it("extracts text parts while ignoring non-text payloads", () => {
    expect(
      extractText({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello" }, {}, { text: " world" }],
            },
          },
        ],
      }),
    ).toBe("Hello world");
  });
});
