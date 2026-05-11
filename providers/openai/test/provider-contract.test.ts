import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createOpenAI } from "../src/provider";
import type { OpenAIChatCompletionRequest } from "../src/types";

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

describe("openai public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createOpenAI({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "OpenAI model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "OpenAI model id must be a non-empty string.",
    );
    expect(provider("gpt-4.1-mini", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "gpt-4.1-mini",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createOpenAI({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as OpenAIChatCompletionRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "resp-1",
            choices: [
              {
                message: { content: "Hello from invoke" },
                finish_reason: "length",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("gpt-4.1-mini", { streaming: false });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "length", raw: "length" },
      },
    ]);
  });
});
