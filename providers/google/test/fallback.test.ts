import { describe, expect, it } from "vitest";
import { createGoogleGenerativeAI } from "../src/provider";
import type { GoogleGenerateContentRequest } from "../src/types";

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const createSseResponse = (events: unknown[]): Response => {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );
};

describe("google reasoning fallback", () => {
  it("retries invoke without thinkingLevel when the model rejects reasoning effort", async () => {
    const requests: GoogleGenerateContentRequest[] = [];
    const provider = createGoogleGenerativeAI({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as GoogleGenerateContentRequest;
        requests.push(body);

        const hasThinkingLevel =
          body.generationConfig?.thinkingConfig?.thinkingLevel !== undefined;

        if (hasThinkingLevel) {
          return createJsonResponse(
            {
              error: {
                message: "Thinking level is not supported for this model.",
              },
            },
            400,
          );
        }

        return createJsonResponse({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello from Gemini" }],
              },
              finishReason: "STOP",
            },
          ],
        });
      },
    });

    const model = provider.getModel("gemini-2.5-flash", {
      reasoning: {
        effort: "low",
        includeThoughts: false,
      },
    });

    const result = await model.invoke([{ role: "user", content: "Hello" }]);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: "low",
      includeThoughts: false,
    });
    expect(requests[1]?.generationConfig?.thinkingConfig).toEqual({
      includeThoughts: false,
    });
    expect(result.content).toBe("Hello from Gemini");
    expect(result.warnings).toContainEqual({
      type: "compatibility",
      feature: "reasoning.effort",
      details:
        "Google rejected reasoning.effort for this model or request. Kortyx retried without it. Try other reasoning settings such as reasoning.maxTokens.",
    });
  });

  it("retries streaming without thinkingLevel when the model rejects reasoning effort", async () => {
    const requests: GoogleGenerateContentRequest[] = [];
    const provider = createGoogleGenerativeAI({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        const body = JSON.parse(
          String(init?.body),
        ) as GoogleGenerateContentRequest;
        requests.push(body);

        const hasThinkingLevel =
          body.generationConfig?.thinkingConfig?.thinkingLevel !== undefined;

        if (hasThinkingLevel) {
          return createJsonResponse(
            {
              error: {
                message: "Thinking level is not supported for this model.",
              },
            },
            400,
          );
        }

        return createSseResponse([
          {
            candidates: [
              {
                content: {
                  parts: [{ text: "Hello" }],
                },
              },
            ],
          },
          {
            candidates: [
              {
                content: {
                  parts: [{ text: "Hello world" }],
                },
                finishReason: "STOP",
              },
            ],
          },
        ]);
      },
    });

    const model = provider.getModel("gemini-2.5-flash", {
      reasoning: {
        effort: "low",
        includeThoughts: false,
      },
      streaming: true,
    });

    const parts = [];
    for await (const part of model.stream([
      { role: "user", content: "Hello" },
    ])) {
      parts.push(part);
    }

    expect(requests).toHaveLength(2);
    expect(requests[0]?.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: "low",
      includeThoughts: false,
    });
    expect(requests[1]?.generationConfig?.thinkingConfig).toEqual({
      includeThoughts: false,
    });
    const finishPart = parts.find((part) => part.type === "finish");
    expect(finishPart).toMatchObject({
      type: "finish",
      finishReason: {
        unified: "stop",
        raw: "STOP",
      },
      warnings: [
        {
          type: "compatibility",
          feature: "reasoning.effort",
          details:
            "Google rejected reasoning.effort for this model or request. Kortyx retried without it. Try other reasoning settings such as reasoning.maxTokens.",
        },
      ],
    });
    expect(finishPart?.raw).toEqual(expect.any(Object));
  });
});
