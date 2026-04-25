import { describe, expect, it } from "vitest";
import { createGenerateContentRequest } from "../src/messages";

describe("google message mapping", () => {
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
});
