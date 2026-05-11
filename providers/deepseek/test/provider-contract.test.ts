import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createDeepSeek } from "../src/provider";
import type { DeepSeekChatCompletionRequest } from "../src/types";

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

describe("deepseek public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createDeepSeek({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "DeepSeek model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "DeepSeek model id must be a non-empty string.",
    );
    expect(provider("deepseek-chat", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "deepseek-chat",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createDeepSeek({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as DeepSeekChatCompletionRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "resp-1",
            choices: [
              {
                message: { content: "Hello from invoke" },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("deepseek-chat", { streaming: false });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
      },
    ]);
  });
});
