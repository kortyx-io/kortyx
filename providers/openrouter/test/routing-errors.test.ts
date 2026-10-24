import { serializeFailure } from "@kortyx/core/errors";
import { describe, expect, it, vi } from "vitest";
import { toProviderRequestError } from "../src/errors";
import { createChatRequest } from "../src/messages";
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
      "@preset/PRIVATE_PRESET",
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
      message: routingError.message,
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
        requireParametersSource: "automatic",
        featureParameters: ["response_format"],
        otherParameters: ["temperature"],
        usesPreset: true,
      },
    });
    expect(failure.message).toContain("Remove unsupported optional parameters");
    expect(failure.message).toContain(
      "enabled automatically by Kortyx for structured output",
    );
    expect(failure.message).toContain(
      "providerOptions.openrouter.provider.requireParameters=false",
    );
    expect(failure.message).toContain("may then be ignored");
    expect(failure.message).toContain(
      "Preset settings may also affect routing",
    );
    expect(JSON.stringify(failure)).not.toMatch(
      /PRIVATE_TOKEN|PRIVATE_PROMPT|PRIVATE_PRESET|routing_funnel/,
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
      details: {
        requireParameters: false,
        requireParametersSource: "explicit",
      },
    });
    expect(serializeFailure(error).details).not.toHaveProperty(
      "failedRoutingStep",
    );
    expect(serializeFailure(error).message).toContain(
      "configured explicitly by the caller",
    );
    expect(serializeFailure(error).message).not.toContain(
      "enabled automatically",
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

it.each([
  true,
  false,
])("distinguishes explicit requireParameters=%s without changing the request", async (requireParameters) => {
  const fetch = vi.fn<NonNullable<ProviderSettings["fetch"]>>(
    async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      expect(
        JSON.parse(await request.clone().text()).provider.require_parameters,
      ).toBe(requireParameters);
      return new Response(JSON.stringify({ error: routingError }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
  );
  const model = createOpenRouter({ apiKey: "test", fetch }).getModel("test", {
    ...options,
    providerOptions: { openrouter: { provider: { requireParameters } } },
  });
  const error = await model.invoke([]).catch((value) => value);
  const failure = serializeFailure(error);
  expect(failure.details).toMatchObject({
    requireParameters,
    requireParametersSource: "explicit",
  });
  expect(failure.message).toContain("configured explicitly by the caller");
  expect(failure.message).not.toContain("enabled automatically");
  expect(fetch).toHaveBeenCalledOnce();
});

it("explains tool-driven auto-enabling and keeps tool names and values private", async () => {
  const model = createOpenRouter({
    apiKey: "test",
    fetch: async () =>
      new Response(JSON.stringify({ error: routingError }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
  }).getModel("test", {
    tools: [{ name: "PRIVATE_TOOL", inputSchema: { type: "object" } }],
    providerOptions: { openrouter: { toolChoice: "required", topP: 0.71 } },
  });
  const failure = serializeFailure(
    await model.invoke([]).catch((value) => value),
  );
  expect(failure.message).toContain(
    "enabled automatically by Kortyx for tool calling",
  );
  expect(failure.details).toMatchObject({
    requireParametersSource: "automatic",
    featureParameters: ["tools", "tool_choice"],
    otherParameters: ["top_p"],
  });
  expect(JSON.stringify(failure)).not.toMatch(/PRIVATE_TOOL|0\.71/);
});

it("reports the provider default when Kortyx did not enable strict parameter routing", async () => {
  const model = createOpenRouter({
    apiKey: "test",
    fetch: async () =>
      new Response(JSON.stringify({ error: routingError }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
  }).getModel("test", { temperature: 0.3 });
  const failure = serializeFailure(
    await model.invoke([]).catch((value) => value),
  );
  expect(failure.details).toMatchObject({
    requireParameters: false,
    requireParametersSource: "default",
    usesPreset: false,
  });
  expect(failure.message).toContain("not explicitly set; provider default");
  expect(failure.message).not.toContain("enabled automatically");
});

it("uses structured routing evidence when provider wording changes", async () => {
  const model = createOpenRouter({
    apiKey: "test",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: { code: 404, message: "PRIVATE_NEW_PROVIDER_WORDING" },
          openrouter_metadata: {
            requested: "PRIVATE_MODEL",
            routing_funnel: {
              failed_routing_step: "filter by parameters",
              private_details: "PRIVATE_ACCOUNT",
            },
          },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
  }).getModel("test", options);
  const error = await model.invoke([]).catch((value) => value);
  expect(error.cause.message).toBe("PRIVATE_NEW_PROVIDER_WORDING");
  expect(error.message).toBe("PRIVATE_NEW_PROVIDER_WORDING");
  const failure = serializeFailure(error);
  expect(failure).toMatchObject({
    code: "PROVIDER_PARAMETER_UNSUPPORTED",
    details: { failedRoutingStep: "Filter by Parameters" },
  });
  expect(JSON.stringify(failure)).not.toMatch(
    /PRIVATE_NEW_PROVIDER_WORDING|PRIVATE_MODEL|PRIVATE_ACCOUNT/,
  );
});

it("matches a specific case-insensitive message only when structured routing evidence is absent", async () => {
  for (const metadata of [
    undefined,
    { failed_routing_step: "Filter by Models" },
  ]) {
    const model = createOpenRouter({
      apiKey: "test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 404,
              message:
                " NO ENDPOINTS FOUND THAT CAN HANDLE THE REQUESTED PARAMETERS ",
              metadata,
            },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
    }).getModel("test", options);
    const error = await model.invoke([]).catch((value) => value);
    expect(error.code).toBe(
      metadata ? "PROVIDER_REQUEST_FAILED" : "PROVIDER_PARAMETER_UNSUPPORTED",
    );
  }
});

it.each([
  false,
  true,
])("recovers string codes from real SDK HTTP parse failures (stream=%s)", async (stream) => {
  const model = createOpenRouter({
    apiKey: "test",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: { ...routingError, code: "404" },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
  }).getModel("test", options);
  let error: unknown;
  if (stream) {
    for await (const part of await model.stream([]))
      if (part.type === "error") error = part.error;
  } else error = await model.invoke([]).catch((value) => value);
  expect(error).toMatchObject({
    code: "PROVIDER_PARAMETER_UNSUPPORTED",
    cause: { name: "ResponseValidationError", statusCode: 404 },
  });
  expect(serializeFailure(error)).toMatchObject({
    details: { requireParametersSource: "automatic" },
  });
  expect(JSON.stringify(serializeFailure(error))).not.toContain(
    "PRIVATE_TOKEN",
  );
});

it("reports malformed SSE error chunks as SDK validation failures, preserving partial usage", async () => {
  const base = {
    id: "stream-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "test",
    choices: [],
  };
  const events = [
    {
      ...base,
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    },
    { ...base, error: { code: "404", message: routingError.message } },
  ];
  const model = createOpenRouter({
    apiKey: "test",
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
  if (error?.type !== "error") throw new Error("Expected error");
  expect(error.error).toMatchObject({
    code: "PROVIDER_INVALID_RESPONSE",
    cause: {
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_type",
          path: expect.arrayContaining(["error", "code"]),
          expected: "number",
        }),
      ]),
    },
    usage: { total: 3 },
  });
  expect(serializeFailure(error.error).message).toContain(
    "did not match its SDK schema",
  );
  // Zod can expose message as a lazy getter. Normalization must not invoke
  // accessors; the original cause retains the precise validation issues.
});

it("normalizes string status fields without confusing a provider-specific metadata code with HTTP status", () => {
  const request = createChatRequest("test", [], options, false);
  const error = { statusCode: "404", error: { message: routingError.message } };
  expect(toProviderRequestError("invoke", error, request)).toMatchObject({
    code: "PROVIDER_PARAMETER_UNSUPPORTED",
    cause: error,
  });
  const unrelated = {
    code: 500,
    message: routingError.message,
    metadata: { providerCode: "404" },
  };
  expect(toProviderRequestError("invoke", unrelated, request)).toHaveProperty(
    "code",
    "PROVIDER_REQUEST_FAILED",
  );
});

it.each([
  { kind: "malformed", rawValue: "not JSON" },
  { kind: "oversized", rawValue: "x".repeat(32769) },
])("bounds $kind SDK diagnostics and preserves cancellation", ({
  rawValue,
}) => {
  const request = createChatRequest("test", [], options, false);
  expect(
    toProviderRequestError(
      "invoke",
      { statusCode: 404, message: "Unknown model", rawValue },
      request,
    ),
  ).toHaveProperty("code", "PROVIDER_REQUEST_FAILED");
  const abort = new DOMException("aborted", "AbortError");
  expect(toProviderRequestError("invoke", abort, request)).toBe(abort);
});

it("reads a bounded serialized SDK envelope while retaining its original exception", () => {
  const request = createChatRequest("test", [], options, false);
  const original = Object.assign(new Error("PRIVATE_SDK_WRAPPER"), {
    statusCode: "404",
    rawValue: JSON.stringify({ error: routingError }),
  });
  const error = toProviderRequestError("invoke", original, request);
  expect(error).toMatchObject({
    code: "PROVIDER_PARAMETER_UNSUPPORTED",
    message: routingError.message,
    cause: original,
  });
  expect(JSON.stringify(serializeFailure(error))).not.toMatch(
    /PRIVATE_TOKEN|PRIVATE_SDK_WRAPPER/,
  );
});

it("warns about preset aliases in fallback models without exposing customer-chosen names", async () => {
  const model = createOpenRouter({
    apiKey: "test",
    fetch: async () =>
      new Response(JSON.stringify({ error: routingError }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
  }).getModel("test", {
    ...options,
    providerOptions: {
      openrouter: { models: ["test@preset/PRIVATE_FALLBACK"] },
    },
  });
  const failure = serializeFailure(
    await model.invoke([]).catch((value) => value),
  );
  expect(failure.details).toMatchObject({ usesPreset: true });
  expect(failure.message).toContain("Preset settings may also affect routing");
  expect(JSON.stringify(failure)).not.toContain("PRIVATE_FALLBACK");
});
