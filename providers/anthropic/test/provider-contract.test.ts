import type { KortyxStreamPart } from "@kortyx/providers";
import { describe, expect, it } from "vitest";
import { createAnthropic } from "../src/provider";
import type { AnthropicMessagesRequest } from "../src/types";

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

describe("anthropic public provider contract", () => {
  it("validates model ids on getModel and selector calls", () => {
    const provider = createAnthropic({ apiKey: "test-key" });

    expect(() => provider.getModel(" ")).toThrow(
      "Anthropic model id must be a non-empty string.",
    );
    expect(() => provider(" ")).toThrow(
      "Anthropic model id must be a non-empty string.",
    );
    expect(provider("claude-sonnet-4-5", { temperature: 0.2 })).toMatchObject({
      provider,
      modelId: "claude-sonnet-4-5",
      options: { temperature: 0.2 },
    });
  });

  it("streams from the non-streaming invoke transport when streaming is disabled", async () => {
    const provider = createAnthropic({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as AnthropicMessagesRequest;
        expect(body.stream).toBe(false);
        return new Response(
          JSON.stringify({
            id: "msg-1",
            content: [{ type: "text", text: "Hello from invoke" }],
            stop_reason: "tool_use",
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const model = provider.getModel("claude-sonnet-4-5", {
      streaming: false,
    });

    const parts = await collectStreamParts(
      model.stream([{ role: "user", content: "Hello" }]),
    );

    expect(parts).toMatchObject([
      { type: "text-delta", delta: "Hello from invoke" },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: "tool_use" },
      },
    ]);
  });
});
