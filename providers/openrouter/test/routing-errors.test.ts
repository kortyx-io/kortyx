import { serializeFailure } from "@kortyx/core/errors";
import { describe, expect, it, vi } from "vitest";
import { createOpenRouter } from "../src/provider";
import type { ProviderSettings } from "../src/types";

const options = {
  temperature: 0.3,
  responseFormat: { type: "json" as const, schema: { type: "object" } },
};
const routingError = {
  code: 404,
  message: "No endpoints found that can handle the requested parameters.",
  metadata: {
    routing_funnel: {
      failed_routing_step: "Filter by Parameters",
      private_account_data: "PRIVATE_TOKEN",
    },
  },
};

describe("OpenRouter parameter routing failures", () => {
  it.each([
    false,
    true,
  ])("reports HTTP routing failures (stream=%s) without retrying or changing controls", async (stream) => {
    const fetch = vi.fn<NonNullable<ProviderSettings["fetch"]>>(
      async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        expect(JSON.parse(await request.clone().text())).toMatchObject({
          temperature: 0.3,
          provider: { require_parameters: true },
          response_format: { type: "json_schema" },
          stream,
        });
        return new Response(JSON.stringify({ error: routingError }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      },
    );
    const model = createOpenRouter({ apiKey: "test-key", fetch }).getModel(
      "@preset/test",
      options,
    );
    let error: unknown;
    if (stream) {
      for await (const part of await model.stream([
        { role: "user", content: "PRIVATE_PROMPT" },
      ]))
        if (part.type === "error") error = part.error;
    } else {
      error = await model
        .invoke([{ role: "user", content: "PRIVATE_PROMPT" }])
        .catch((value) => value);
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(error).toMatchObject({
      code: "PROVIDER_PARAMETER_UNSUPPORTED",
      cause: { statusCode: 404 },
    });
    const failure = serializeFailure(error);
    expect(failure).toMatchObject({
      code: "PROVIDER_PARAMETER_UNSUPPORTED",
      status: 404,
      retryable: false,
      details: {
        failedRoutingStep: "Filter by Parameters",
        requestedParameters: ["temperature", "response_format"],
        requireParameters: true,
      },
    });
    expect(failure.message).toContain("Remove unsupported optional parameters");
    expect(JSON.stringify(failure)).not.toMatch(
      /PRIVATE_TOKEN|PRIVATE_PROMPT|routing_funnel/,
    );
  });

  it("classifies the specific parameter error without funnel metadata and respects explicit opt-out", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 404, message: routingError.message },
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const model = createOpenRouter({ apiKey: "test-key", fetch }).getModel(
      "test",
      {
        ...options,
        providerOptions: {
          openrouter: { provider: { requireParameters: false } },
        },
      },
    );
    const error = await model.invoke([]).catch((value) => value);
    expect(serializeFailure(error)).toMatchObject({
      code: "PROVIDER_PARAMETER_UNSUPPORTED",
      details: { requireParameters: false },
    });
    expect(serializeFailure(error).details).not.toHaveProperty(
      "failedRoutingStep",
    );
  });

  it("does not misclassify an unrelated 404 as unsupported parameters", async () => {
    const model = createOpenRouter({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 404,
              message: "Unknown model",
              metadata: { failed_routing_step: "Filter by Models" },
            },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
    }).getModel("test", options);
    await expect(model.invoke([])).rejects.toHaveProperty(
      "code",
      "PROVIDER_REQUEST_FAILED",
    );
  });

  it("retains partial usage and safe diagnostics for parameter errors after the stream opens", async () => {
    const base = {
      id: "stream-1",
      object: "chat.completion.chunk",
      created: 1,
      model: "test",
    };
    const events = [
      {
        ...base,
        choices: [],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      },
      {
        ...base,
        choices: [],
        error: {
          ...routingError,
          metadata: { error_type: "not_found", provider_code: "PRIVATE_TOKEN" },
        },
      },
    ];
    const model = createOpenRouter({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        ),
    }).getModel("test", options);
    const parts = [];
    for await (const part of await model.stream([])) parts.push(part);
    const error = parts.find((part) => part.type === "error");
    expect(error?.type).toBe("error");
    if (error?.type !== "error") throw new Error("Expected stream failure");
    expect(error.error).toMatchObject({
      code: "PROVIDER_PARAMETER_UNSUPPORTED",
      usage: { total: 3 },
    });
    expect(JSON.stringify(serializeFailure(error.error))).not.toContain(
      "PRIVATE_TOKEN",
    );
  });
});
