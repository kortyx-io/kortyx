import { describe, expect, it } from "vitest";
import {
  assertProviderResponse,
  DomainError,
  errorFromFailure,
  errorProperty,
  FAILURE_LIMITS,
  failureHttpStatus,
  isControlFlowError,
  isFailureDescriptor,
  KortyxError,
  normalizeProviderError,
  PersistenceError,
  ProviderConfigurationError,
  ProviderRequestError,
  providerHttpError,
  serializeFailure,
  ValidationError,
  WorkflowContractError,
} from "../src/errors";

describe("failure contracts", () => {
  it("propagates cancellation while reading an HTTP error body", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const response = new Response(null, { status: 503 });
    Object.defineProperty(response, "json", {
      value: async () => {
        throw abort;
      },
    });
    await expect(
      assertProviderResponse("openai", response, "invoke"),
    ).rejects.toBe(abort);
  });
  it("handles native aborts, unknown exceptions and changing proxy descriptors", () => {
    expect(isControlFlowError(new DOMException("aborted", "AbortError"))).toBe(
      true,
    );
    expect(new KortyxError("UNKNOWN", "private").category).toBe("internal");
    expect(
      normalizeProviderError("custom", "invoke", new TypeError("offline")),
    ).toMatchObject({ code: "PROVIDER_TRANSPORT_ERROR" });
    const original = new DomainError("SAFE", "safe").failure;
    const counts = new Map<PropertyKey, number>();
    const changing = new Proxy(original, {
      getOwnPropertyDescriptor(target, key) {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        if (
          (key === "code" || key === "message") &&
          count === (key === "code" ? 4 : 3)
        )
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: undefined,
          };
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(serializeFailure(changing)).toMatchObject({
      code: "EXECUTION_FAILED",
      message: "An unexpected error occurred.",
    });
    for (const hasResults of [false, true]) {
      const root = new DomainError("SAFE", "safe").failure;
      let cursor = root;
      for (let i = 0; i < 4; i++) {
        cursor.cause = new DomainError("SAFE", "safe").failure;
        cursor = cursor.cause;
      }
      if (hasResults) cursor.results = [{ status: "fulfilled" }];
      expect(serializeFailure(root).cause?.cause?.cause?.cause?.truncated).toBe(
        hasResults ? true : undefined,
      );
    }
  });
  it("keeps normalized metadata and filters unsupported diagnostic values", () => {
    const failure = new DomainError("SAFE_CODE", "Approved", {
      details: {
        scalar: 1,
        boolean: true,
        nil: null,
        invalid: Infinity,
        symbol: Symbol(),
        list: ["a", 2, undefined],
        nested: { deeper: { omitted: true } },
        toJSON: "skip",
        constructor: "skip",
      },
    }).failure;
    const error = new KortyxError("MODEL_OUTPUT_SCHEMA", "private", {
      ...failure,
      safeMessage: "safe",
      source: "provider",
      operation: "invoke",
      context: { runId: "run", invalid: 4 } as never,
      issues: [{ code: "x", path: [1] }, {}] as never,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        reasoning: 1,
        cacheRead: 0,
        cacheWrite: -1,
      },
      finishReason: { unified: "stop" },
    });
    Object.assign(error, {
      usage: { total: 8, raw: { token: "secret" } },
      finishReason: { unified: "length", raw: "private" },
    });
    const serialized = serializeFailure(error);
    expect(serialized).toMatchObject({
      usage: { total: 8 },
      finishReason: { unified: "length" },
      context: { runId: "run" },
      issues: [
        { code: "x", path: [1] },
        { code: "invalid_value", path: [] },
      ],
    });
    expect(serialized.context).not.toHaveProperty("invalid");
    expect(JSON.stringify(serialized)).not.toMatch(/secret|private|toJSON/);
    expect(error.category).toBe("domain");
    expect(errorFromFailure(undefined, "legacy live message").message).toBe(
      "legacy live message",
    );
    expect(errorProperty(() => {}, "missing")).toBeUndefined();
  });

  it("bounds distinct deep and large diagnostics while preserving ordered aggregate slots", () => {
    const leaf = () => new DomainError("SAFE", "safe").failure;
    const root = leaf();
    let current = root;
    for (let i = 0; i < 8; i++) {
      current.cause = leaf();
      current = current.cause;
    }
    current.results = [{ status: "fulfilled" }];
    root.issues = Array.from({ length: 30 }, () => ({
      code: "issue",
      path: [],
    }));
    root.results = Array.from({ length: 70 }, (_, i) =>
      i % 2
        ? { status: "fulfilled" }
        : {
            status: "rejected",
            failure: {
              ...leaf(),
              message: "界".repeat(1024),
              details: Object.fromEntries(
                Array.from({ length: 32 }, (_, key) => [
                  String(key),
                  "界".repeat(256),
                ]),
              ),
            },
          },
    );
    const result = serializeFailure(root);
    expect(result.truncated).toBe(true);
    expect(result.results).toHaveLength(64);
    expect(result.results?.[1]?.status).toBe("fulfilled");
    expect(
      new TextEncoder().encode(JSON.stringify(result)).length,
    ).toBeLessThanOrEqual(FAILURE_LIMITS.bytes);
    const large = serializeFailure({
      ...leaf(),
      details: Object.fromEntries(
        Array.from({ length: 32 }, (_, key) => [
          String(key),
          Object.fromEntries(
            Array.from({ length: 32 }, (_, i) => [String(i), "界".repeat(256)]),
          ),
        ]),
      ),
    });
    expect(large.truncated).toBe(true);
  });

  it("fails safely for hostile descriptor arrays and property enumeration", () => {
    const failure = new DomainError("SAFE", "safe").failure;
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("no");
        },
      },
    );
    expect(
      serializeFailure({ ...failure, details: hostile }).details,
    ).toBeUndefined();
    expect(
      serializeFailure({ ...failure, details: [1] }).details,
    ).toBeUndefined();
    expect(
      serializeFailure({ ...failure, details: true }).details,
    ).toBeUndefined();
    const issues = [{ code: "invalid" }];
    Object.defineProperty(issues, "slice", {
      value() {
        throw new Error("no");
      },
    });
    expect(serializeFailure({ ...failure, issues }).code).toBe(
      "EXECUTION_FAILED",
    );
    const abort = new DOMException("Aborted", "AbortError");
    Object.defineProperty(abort, "name", {
      get() {
        throw new Error("no");
      },
    });
    expect(isControlFlowError(abort)).toBe(false);
  });

  it.each([
    "AbortError",
    "GraphInterrupt",
    "NodeInterrupt",
    "ParallelChildWaiting",
  ])("recognizes %s without interpreting message text", (name) => {
    expect(isControlFlowError({ name })).toBe(true);
  });

  it("classifies known infrastructure/request failures at the HTTP boundary", () => {
    expect(failureHttpStatus(new PersistenceError("private"))).toBe(503);
    expect(failureHttpStatus(new WorkflowContractError("private"))).toBe(500);
    expect(
      failureHttpStatus(
        new KortyxError("NOT_FOUND", "private", { category: "request" }),
      ),
    ).toBe(404);
    expect(
      failureHttpStatus(
        new KortyxError("UNKNOWN_WORKFLOW", "private", { category: "request" }),
      ),
    ).toBe(404);
    expect(
      failureHttpStatus(
        new KortyxError("INVALID_INPUT", "private", { category: "request" }),
      ),
    ).toBe(400);
    expect(failureHttpStatus(new ProviderRequestError("private"))).toBe(502);
    expect(new ProviderRequestError().message).toBe("");
    expect(new ProviderConfigurationError().message).toBe("");
    const originalCause = new Error("private cause");
    expect(
      new ProviderConfigurationError("private", { cause: originalCause }).cause,
    ).toBe(originalCause);
    expect(new ProviderConfigurationError("private").code).toBe(
      "PROVIDER_CONFIGURATION",
    );
    expect(isControlFlowError({ code: "EXECUTION_LIMIT_REACHED" })).toBe(true);
    expect(isControlFlowError({ code: "EXECUTION_CANCELLED" })).toBe(true);
    expect(
      new ValidationError("OUTPUT_TRUNCATED", "private").failure.message,
    ).toContain("length");
    expect(
      new ValidationError("INVALID_MODEL_JSON", "private").failure.message,
    ).toContain("JSON");
    expect(normalizeProviderError("custom", "invoke", null)).toMatchObject({
      code: "PROVIDER_REQUEST_FAILED",
    });
    expect(
      normalizeProviderError("custom", "invoke", new SyntaxError("bad")),
    ).toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it("parses HTTP delay hints and refines terminal quota errors", async () => {
    await expect(
      assertProviderResponse("custom", new Response(), "invoke"),
    ).resolves.toBeUndefined();
    for (const body of [
      "not-json",
      "null",
      "{}",
      JSON.stringify({
        error: { code: "insufficient_quota", message: "private" },
      }),
      JSON.stringify({ message: "private" }),
      JSON.stringify({ detail: "private" }),
    ]) {
      const response = new Response(body, { status: 429 });
      try {
        await assertProviderResponse("custom", response, "invoke");
        throw new Error("Expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderRequestError);
        expect(serializeFailure(error).retryable).toBe(
          !body.includes("insufficient_quota"),
        );
        expect(JSON.stringify(error)).not.toContain("private");
      }
    }
    expect(
      providerHttpError(
        "custom",
        new Response(null, {
          status: 503,
          headers: { "retry-after": "nonsense" },
        }),
        "invoke",
        "x",
      ).retryAfterMs,
    ).toBeUndefined();
    expect(
      providerHttpError(
        "custom",
        new Response(null, {
          status: 503,
          headers: { "retry-after": "Wed, 01 Jan 2020 00:00:00 GMT" },
        }),
        "invoke",
        "x",
      ).retryAfterMs,
    ).toBe(0);
  });
  it("preserves a live cause but excludes arbitrary messages, bodies and properties from JSON", () => {
    const cause = Object.assign(new Error("secret api key"), {
      response: { secret: "token" },
    });
    const error = new KortyxError(
      "PROVIDER_TRANSPORT_ERROR",
      "private diagnostic",
      {
        cause,
        category: "provider",
        safeMessage: "Provider connection failed.",
      },
    );
    expect(error.cause).toBe(cause);
    expect(JSON.stringify(error)).not.toMatch(
      /secret|token|private diagnostic/,
    );
    expect(serializeFailure(error)).toMatchObject({
      code: "PROVIDER_TRANSPORT_ERROR",
      cause: { code: "EXECUTION_FAILED" },
    });
  });

  it("round trips explicit domain details without requiring class identity", () => {
    const original = new DomainError(
      "SPECIALIST_UNAVAILABLE",
      "Specialist unavailable.",
      { details: { specialist: "research" }, retryable: true },
    );
    const stored = JSON.parse(JSON.stringify(original));
    expect(isFailureDescriptor(stored)).toBe(true);
    const restored = errorFromFailure(stored);
    expect(restored.failure).toMatchObject({
      code: "DOMAIN_ERROR",
      domainCode: "SPECIALIST_UNAVAILABLE",
      details: { specialist: "research" },
      retryable: true,
    });
    expect(
      isControlFlowError(
        new DomainError("EXECUTION_CANCELLED", "A domain value"),
      ),
    ).toBe(false);
  });

  it("does not invoke getters, coercions, toJSON or leak unknown thrown values", () => {
    const hostile = Object.create(null, {
      message: {
        get() {
          throw new Error("getter");
        },
      },
      failure: {
        get() {
          throw new Error("getter");
        },
      },
      toString: {
        value() {
          throw new Error("coercion");
        },
      },
      toJSON: {
        value() {
          throw new Error("json");
        },
      },
    });
    for (const value of [
      hostile,
      1n,
      null,
      "secret",
      new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            throw new Error("proxy");
          },
        },
      ),
    ]) {
      expect(serializeFailure(value)).toMatchObject({
        code: "EXECUTION_FAILED",
        retryable: null,
      });
    }
  });

  it("bounds cyclic causes, issues and aggregate descriptors", () => {
    const failure = new DomainError("EXAMPLE", "x".repeat(100000)).failure;
    failure.cause = failure;
    failure.results = Array.from({ length: 64 }, () => ({
      status: "rejected",
      failure,
    }));
    const result = serializeFailure(failure);
    expect(
      new TextEncoder().encode(JSON.stringify(result)).length,
    ).toBeLessThanOrEqual(FAILURE_LIMITS.bytes);
    expect(result.results).toHaveLength(64);
    expect(result.truncated).toBe(true);
  });

  it("retains original validation issues in memory and excludes field values and custom messages from persistence", () => {
    const issues = [
      {
        code: "invalid_type",
        path: ["secret-field", 0],
        message: "secret value",
      },
    ];
    const error = new ValidationError("MODEL_OUTPUT_SCHEMA", "Invalid", {
      issues,
    });
    expect(error.issues).toBe(issues);
    expect(serializeFailure(error).issues).toEqual([
      { code: "invalid_type", path: ["[field]", 0] },
    ]);
    expect(JSON.stringify(error)).not.toContain("secret");
  });

  it.each([
    [408, true],
    [429, true],
    [503, true],
    [400, false],
    [401, false],
    [403, false],
  ])("classifies HTTP %i without parsing message text", (status, retryable) => {
    const error = providerHttpError(
      "example",
      new Response(null, { status, headers: { "retry-after": "2" } }),
      "invoke",
      "sensitive provider message",
    );
    expect(error).toMatchObject({
      code: "PROVIDER_HTTP_ERROR",
      status,
      statusCode: status,
      retryable,
      retryAfterMs: 2000,
    });
    expect(JSON.stringify(error)).not.toContain("sensitive");
    expect(normalizeProviderError("example", "invoke", error)).toBe(error);
  });

  it("preserves cancellation before provider wrapping", () => {
    const cancelled = Object.assign(new Error("stopped"), {
      name: "AbortError",
    });
    expect(normalizeProviderError("example", "invoke", cancelled)).toBe(
      cancelled,
    );
    expect(() => serializeFailure(cancelled)).toThrow(cancelled);
  });
});
