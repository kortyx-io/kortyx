import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createGroq } from "../src/provider";
import type { GroqChatCompletionRequest } from "../src/types";

const collectStreamParts = async (
  stream:
    | AsyncIterable<KortyxStreamPart>
    | Promise<AsyncIterable<KortyxStreamPart>>,
): Promise<KortyxStreamPart[]> => {
  const parts: KortyxStreamPart[] = [];
  for await (const part of await stream) {
    parts.push(part);
  }
  return parts;
};

describe("groq public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createGroq({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "Groq model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "Groq model id must be a non-empty string.",
    );
    expect(
      provider("llama-3.3-70b-versatile", { temperature: 0.2 }),
    ).toMatchObject({
      provider,
      modelId: "llama-3.3-70b-versatile",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createGroq({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as GroqChatCompletionRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "resp-1",
            choices: [
              {
                message: { content: "Hello from invoke" },
                finish_reason: "content_filter",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("llama-3.3-70b-versatile", {
      streaming: false,
    });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "content-filter", raw: "content_filter" },
      },
    ]);
  });
});
