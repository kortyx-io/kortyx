import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createGoogleGenerativeAI } from "../src/provider";
import type { GoogleGenerateContentRequest } from "../src/types";

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

describe("google public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createGoogleGenerativeAI({ apiKey: "test-key" });

    expect(() => provider.getModel("not-a-model")).toThrow(
      "Unknown Google model: not-a-model.",
    );
    expect(() => provider("not-a-model" as never)).toThrow(
      "Unknown Google model: not-a-model.",
    );
    expect(provider("gemini-2.5-flash", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "gemini-2.5-flash",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createGoogleGenerativeAI({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as GoogleGenerateContentRequest;
        expect(body.generationConfig).toMatchObject({ temperature: 0.7 });
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "Hello from invoke" }] },
                finishReason: "MAX_TOKENS",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("gemini-2.5-flash", {
      streaming: false,
    });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "length", raw: "MAX_TOKENS" },
      },
    ]);
  });
});
