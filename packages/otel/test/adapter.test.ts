import type { ReasonTraceAttributes } from "@kortyx/hooks";
import type { Exception, Span, Tracer } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import type {
  OpenTelemetrySpanEndInfo,
  OpenTelemetrySpanStartInfo,
} from "../src";
import { createOpenTelemetryTraceAdapter } from "../src";
import {
  applyAttributeMapping,
  normalizeKnownAttributes,
  startAttributes,
  telemetryAttributes,
  toAttributes,
  usageAttributes,
} from "../src/attributes";
import { shouldCapture } from "../src/content";

type RecordedSpan = {
  name: string;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; attributes?: Record<string, unknown> }>;
  ended: boolean;
  endCount: number;
  exceptions: Exception[];
  status?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createFakeTracer = () => {
  const spans: RecordedSpan[] = [];

  const createSpan = (
    name: string,
    attributes: Record<string, unknown> = {},
  ): Span => {
    const recorded: RecordedSpan = {
      name,
      attributes: { ...attributes },
      events: [],
      ended: false,
      endCount: 0,
      exceptions: [],
    };
    spans.push(recorded);
    return {
      spanContext: () => ({
        traceId: "trace-id",
        spanId: `span-${spans.length}`,
        traceFlags: 1,
      }),
      setAttributes: (attrs) => {
        Object.assign(recorded.attributes, attrs);
        return {} as Span;
      },
      setAttribute: (key, value) => {
        recorded.attributes[key] = value;
        return {} as Span;
      },
      addEvent: (eventName, attrs) => {
        recorded.events.push({
          name: eventName,
          ...(attrs ? { attributes: attrs as Record<string, unknown> } : {}),
        });
        return {} as Span;
      },
      addLink: () => ({}) as Span,
      addLinks: () => ({}) as Span,
      setStatus: (status) => {
        recorded.status = status;
        return {} as Span;
      },
      updateName: () => ({}) as Span,
      end: () => {
        recorded.ended = true;
        recorded.endCount += 1;
      },
      isRecording: () => true,
      recordException: (exception) => {
        recorded.exceptions.push(exception);
      },
    } as Span;
  };

  const tracer = {
    startSpan: (name, options) =>
      createSpan(name, (options?.attributes ?? {}) as Record<string, unknown>),
    startActiveSpan: async (...args: unknown[]) => {
      const [nameArg, optionsArg] = args;
      const fn = args.find((arg) => typeof arg === "function") as
        | ((span: Span) => unknown)
        | undefined;
      if (!fn) throw new Error("missing active span callback");
      const span = createSpan(
        String(nameArg),
        (isRecord(optionsArg) && isRecord(optionsArg.attributes)
          ? optionsArg.attributes
          : {}) as Record<string, unknown>,
      );
      return fn(span);
    },
  } as Tracer;

  return { tracer, spans };
};

describe("createOpenTelemetryTraceAdapter", () => {
  it("maps Kortyx generation data to OpenTelemetry attributes", () => {
    const { tracer, spans } = createFakeTracer();
    const adapter = createOpenTelemetryTraceAdapter({ tracer });

    const span = adapter.startSpan({
      name: "runReasonEngine",
      attributes: {
        providerId: "google",
        modelId: "gemini-2.5-flash",
        stream: true,
        nodeId: "node-1",
        workflowId: "workflow-1",
        runId: "run-1",
        sessionId: "session-1",
        userId: "user-1",
        tenantId: "tenant-1",
        promptName: "fallback-prompt",
        promptVersion: "fallback-version",
        promptType: "chat",
      },
      telemetry: {
        operation: "assessmentChat",
        prompt: {
          name: "assessment-chat",
          version: 7,
          type: "text",
        },
      },
    });

    span?.end?.({
      usage: {
        input: 10,
        output: 20,
        total: 30,
        reasoning: 3,
      },
      finishReason: {
        unified: "stop",
      },
    });

    expect(spans[0]?.attributes).toMatchObject({
      "gen_ai.provider.name": "google",
      "gen_ai.request.model": "gemini-2.5-flash",
      "gen_ai.request.stream": true,
      "gen_ai.operation.name": "assessmentChat",
      "gen_ai.prompt.name": "fallback-prompt",
      "gen_ai.prompt.version": "fallback-version",
      "kortyx.node.id": "node-1",
      "kortyx.workflow.id": "workflow-1",
      "kortyx.run.id": "run-1",
      "kortyx.session.id": "session-1",
      "user.id": "user-1",
      "kortyx.tenant.id": "tenant-1",
      "kortyx.prompt.type": "chat",
      "gen_ai.usage.input_tokens": 10,
      "gen_ai.usage.output_tokens": 20,
      "gen_ai.usage.total_tokens": 30,
      "gen_ai.usage.reasoning.output_tokens": 3,
      "gen_ai.response.finish_reasons": ["stop"],
      "session.id": "session-1",
    });
    expect(spans[0]?.ended).toBe(true);
  });

  it("applies lifecycle hooks, event mapping, content capture, and end metadata", () => {
    const { tracer, spans } = createFakeTracer();
    const starts: OpenTelemetrySpanStartInfo[] = [];
    const ends: OpenTelemetrySpanEndInfo[] = [];
    const adapter = createOpenTelemetryTraceAdapter({
      tracer,
      defaultAttributes: { tenantId: "tenant-default" },
      captureContent: { input: true, output: false },
      mapAttributes: ({ phase, attributes }) => ({
        "app.phase": phase,
        ...(attributes["kortyx.trace.metadata.accountId"]
          ? { "app.account.id": attributes["kortyx.trace.metadata.accountId"] }
          : {}),
      }),
      onSpanStart: (args) => starts.push(args),
      onSpanEnd: (args) => ends.push(args),
    });

    const span = adapter.startSpan({
      name: "kortyx.node",
      attributes: { workflowId: "workflow-1" },
      telemetry: {
        input: "input text",
        output: "output text",
        metadata: { accountId: "account-1" },
        tags: ["chat", "account"],
      },
    });
    if (!span) throw new Error("expected span");

    span.setAttributes?.({ providerId: "google" });
    span.addEvent?.("node.event", { modelId: "gemini", nested: { ok: true } });
    span.addEvent?.("node.empty");
    span.end?.({
      attributes: { operation: "nodeRun" },
      telemetry: {
        output: "captured output",
        captureContent: { output: true },
      },
      usage: { cacheRead: 4, cacheWrite: 5 },
      finishReason: { unified: "stop", raw: "provider-stop" },
      warnings: [{ type: "other", message: "warn" }],
    });
    span.end?.();

    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      name: "kortyx.node",
      traceId: "trace-id",
      spanId: "span-1",
      attributes: {
        workflowId: "workflow-1",
        tenantId: "tenant-default",
        "kortyx.trace.metadata.accountId": "account-1",
      },
    });
    expect(ends).toEqual([
      {
        name: "kortyx.node",
        traceId: "trace-id",
        spanId: "span-1",
      },
    ]);
    expect(spans[0]?.attributes).toMatchObject({
      "app.phase": "end",
      "app.account.id": "account-1",
      "gen_ai.prompt": "input text",
      "kortyx.trace.input": "input text",
      "gen_ai.completion": "captured output",
      "kortyx.trace.output": "captured output",
      "gen_ai.usage.cache_read.input_tokens": 4,
      "gen_ai.usage.cache_creation.input_tokens": 5,
      "kortyx.finish_reason.raw": "provider-stop",
      "kortyx.warning.count": 1,
      "kortyx.tenant.id": "tenant-default",
      "kortyx.workflow.id": "workflow-1",
    });
    expect(spans[0]?.events).toEqual([
      {
        name: "node.event",
        attributes: {
          "app.phase": "event",
          modelId: "gemini",
          "gen_ai.request.model": "gemini",
          "kortyx.model.id": "gemini",
          nested: JSON.stringify({ ok: true }),
        },
      },
      {
        name: "node.empty",
        attributes: {
          "app.phase": "event",
        },
      },
    ]);
    expect(spans[0]?.endCount).toBe(1);
  });

  it("runs active spans and auto-ends successful callbacks", async () => {
    const { tracer, spans } = createFakeTracer();
    const adapter = createOpenTelemetryTraceAdapter({ tracer });

    const result = await adapter.withSpan?.(
      {
        name: "kortyx.run",
        attributes: { sessionId: "session-1" },
      },
      async (span) => {
        span.setAttributes?.({ userId: "user-1" });
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(spans[0]?.attributes).toMatchObject({
      "session.id": "session-1",
      "user.id": "user-1",
    });
    expect(spans[0]?.ended).toBe(true);
  });

  it("does not auto-end an active span that was ended by the callback", async () => {
    const { tracer, spans } = createFakeTracer();
    const adapter = createOpenTelemetryTraceAdapter({ tracer });

    await adapter.withSpan?.({ name: "manual.end" }, async (span) => {
      span.end?.();
    });

    expect(spans[0]?.endCount).toBe(1);
  });

  it("records active span failures and rethrows callback errors", async () => {
    const { tracer, spans } = createFakeTracer();
    const adapter = createOpenTelemetryTraceAdapter({
      tracer,
      mapAttributes: ({ phase }) => ({ "app.phase": phase }),
    });
    const error = new Error("boom");

    await expect(
      adapter.withSpan?.({ name: "error.span" }, async () => {
        throw error;
      }),
    ).rejects.toThrow("boom");

    expect(spans[0]?.attributes).toMatchObject({
      "app.phase": "end",
      "error.type": "Error",
      "error.message": "boom",
    });
    expect(spans[0]?.status).toMatchObject({
      code: 2,
      message: "boom",
    });
    expect(spans[0]?.exceptions).toEqual([error]);
    expect(spans[0]?.ended).toBe(true);
  });

  it("records non-Error failures with stringified messages", () => {
    const { tracer, spans } = createFakeTracer();
    const adapter = createOpenTelemetryTraceAdapter({ tracer });
    const span = adapter.startSpan({ name: "error.span" });

    span?.fail?.("bad", {
      attributes: { modelId: "gemini" },
      telemetry: { operation: "generation" },
    });

    expect(spans[0]?.attributes).toMatchObject({
      "error.type": "string",
      "error.message": "bad",
      "gen_ai.request.model": "gemini",
      "gen_ai.operation.name": "generation",
    });
    expect(spans[0]?.exceptions[0]).toBeInstanceOf(Error);
    expect(spans[0]?.ended).toBe(true);
  });

  it("can create spans from the global OpenTelemetry tracer", () => {
    const defaultAdapter = createOpenTelemetryTraceAdapter();
    const adapter = createOpenTelemetryTraceAdapter({
      instrumentationName: "kortyx-test",
      instrumentationVersion: "0.0.0",
    });
    const defaultSpan = defaultAdapter.startSpan({ name: "noop.default" });
    const span = adapter.startSpan({ name: "noop.span" });

    expect(defaultSpan).toBeTruthy();
    expect(span).toBeTruthy();
    expect(() => defaultSpan?.end?.()).not.toThrow();
    expect(() => span?.end?.()).not.toThrow();
  });

  it("keeps custom prompt mapping in adapter options", () => {
    const { tracer, spans } = createFakeTracer();
    const adapter = createOpenTelemetryTraceAdapter({
      tracer,
      mapPromptMetadata: (prompt) => ({
        "app.prompt.metadata": prompt.metadata,
      }),
    });

    const span = adapter.startSpan({
      name: "useReason",
      telemetry: {
        prompt: {
          name: "prompt-a",
          metadata: { name: "prompt-a", version: 1 },
        },
      },
    });
    span?.end?.();

    expect(spans[0]?.attributes["app.prompt.metadata"]).toBe(
      JSON.stringify({ name: "prompt-a", version: 1 }),
    );
  });
});

describe("OpenTelemetry attribute helpers", () => {
  it("converts supported attribute values and drops empty values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      toAttributes({
        string: "value",
        number: 1,
        boolean: true,
        strings: ["a", "b"],
        numbers: [1, 2],
        booleans: [true, false],
        mixed: ["a", 1],
        object: { ok: true },
        circular,
        nullish: null,
        missing: undefined,
      }),
    ).toEqual({
      string: "value",
      number: 1,
      boolean: true,
      strings: ["a", "b"],
      numbers: [1, 2],
      booleans: [true, false],
      mixed: JSON.stringify(["a", 1]),
      object: JSON.stringify({ ok: true }),
      circular: "[object Object]",
    });
  });

  it("normalizes every known Kortyx attribute", () => {
    expect(
      normalizeKnownAttributes({
        providerId: "google",
        modelId: "gemini",
        stream: false,
        operation: "chat",
        nodeId: "node",
        workflowId: "workflow",
        runId: "run",
        sessionId: "session",
        userId: "user",
        tenantId: "tenant",
        promptName: "prompt",
        promptVersion: 1,
        promptType: "text",
        tool: "lookup_order",
        toolCallId: "call-1",
        toolCallCount: 2,
        toolResultCount: 2,
        toolStepCount: 3,
      }),
    ).toMatchObject({
      "gen_ai.provider.name": "google",
      "kortyx.provider.id": "google",
      "gen_ai.request.model": "gemini",
      "kortyx.model.id": "gemini",
      "gen_ai.request.stream": false,
      "gen_ai.operation.name": "chat",
      "kortyx.operation.name": "chat",
      "kortyx.node.id": "node",
      "kortyx.workflow.id": "workflow",
      "kortyx.run.id": "run",
      "session.id": "session",
      "gen_ai.conversation.id": "session",
      "kortyx.session.id": "session",
      "user.id": "user",
      "kortyx.tenant.id": "tenant",
      "gen_ai.prompt.name": "prompt",
      "kortyx.prompt.name": "prompt",
      "gen_ai.prompt.version": 1,
      "kortyx.prompt.version": 1,
      "gen_ai.prompt.type": "text",
      "kortyx.prompt.type": "text",
      "gen_ai.tool.name": "lookup_order",
      "kortyx.tool.name": "lookup_order",
      "kortyx.tool.call.id": "call-1",
      "kortyx.tool.call.count": 2,
      "kortyx.tool.result.count": 2,
      "kortyx.tool.step.count": 3,
    });
  });

  it("builds telemetry attributes for prompt metadata and content capture", () => {
    expect(
      telemetryAttributes(
        {
          operation: "summarize",
          input: "prompt",
          output: "completion",
          prompt: {
            name: "prompt-a",
            version: "v1",
            type: "chat",
            source: "store",
            metadata: { id: "managed" },
          },
          metadata: { accountId: "account" },
          tags: ["a"],
          captureContent: { input: true, output: true },
        },
        {
          mapPromptMetadata: (prompt) => ({
            "app.prompt.id": (prompt.metadata as { id: string }).id,
          }),
        },
        "input",
      ),
    ).toMatchObject({
      operation: "summarize",
      "gen_ai.operation.name": "summarize",
      "gen_ai.prompt.name": "prompt-a",
      "kortyx.prompt.name": "prompt-a",
      "gen_ai.prompt.version": "v1",
      "kortyx.prompt.version": "v1",
      "gen_ai.prompt.type": "chat",
      "kortyx.prompt.type": "chat",
      "kortyx.prompt.source": "store",
      "app.prompt.id": "managed",
      "kortyx.trace.metadata.accountId": "account",
      "kortyx.trace.tags": ["a"],
      "gen_ai.prompt": "prompt",
      "kortyx.trace.input": "prompt",
    });

    expect(
      telemetryAttributes(
        { output: "completion", captureContent: { output: true } },
        {},
        "output",
      ),
    ).toMatchObject({
      "gen_ai.completion": "completion",
      "kortyx.trace.output": "completion",
    });
    expect(telemetryAttributes(undefined, {})).toEqual({});
    expect(
      telemetryAttributes(
        {
          prompt: {
            metadata: { id: "managed" },
          },
        },
        {},
      ),
    ).toEqual({});
  });

  it("builds usage, start, and mapped attributes", () => {
    expect(
      usageAttributes({
        usage: {
          input: 1,
          output: 2,
          total: 3,
          reasoning: 4,
          cacheRead: 5,
          cacheWrite: 6,
        },
        finishReason: {
          unified: "stop",
          raw: "raw-stop",
        },
        warnings: [{ type: "other", message: "warning" }],
      }),
    ).toMatchObject({
      "gen_ai.usage.input_tokens": 1,
      "gen_ai.usage.output_tokens": 2,
      "gen_ai.usage.total_tokens": 3,
      "gen_ai.usage.reasoning.output_tokens": 4,
      "gen_ai.usage.cache_read.input_tokens": 5,
      "gen_ai.usage.cache_creation.input_tokens": 6,
      "gen_ai.response.finish_reasons": ["stop"],
      "kortyx.finish_reason.raw": "raw-stop",
      "kortyx.warning.count": 1,
    });
    expect(usageAttributes(undefined)).toEqual({});
    expect(usageAttributes({})).toEqual({});
    expect(
      usageAttributes({
        usage: {},
        finishReason: { raw: "raw-only" } as never,
      }),
    ).toEqual({
      "kortyx.finish_reason.raw": "raw-only",
    });

    expect(
      startAttributes(
        {
          name: "span",
          attributes: { modelId: "model" },
          telemetry: { operation: "chat" },
        },
        { defaultAttributes: { providerId: "provider" } },
      ),
    ).toMatchObject({
      providerId: "provider",
      modelId: "model",
      operation: "chat",
    });

    expect(
      applyAttributeMapping(
        "span",
        { providerId: "provider" },
        {
          mapAttributes: ({ name, phase, attributes }) => ({
            mapped: `${name}:${phase}:${attributes.providerId}`,
          }),
        },
        { phase: "start" },
      ),
    ).toMatchObject({
      providerId: "provider",
      "gen_ai.provider.name": "provider",
      mapped: "span:start:provider",
    });
  });

  it("evaluates content capture settings", () => {
    expect(shouldCapture(true, "input")).toBe(true);
    expect(shouldCapture(false, "input")).toBe(false);
    expect(shouldCapture(undefined, "output")).toBe(false);
    expect(shouldCapture({ input: true }, "input")).toBe(true);
    expect(shouldCapture({ input: true }, "output")).toBe(false);
    expect(shouldCapture({ output: true }, "output")).toBe(true);
  });

  it("keeps unsupported known attribute values unchanged", () => {
    const attributes: ReasonTraceAttributes = {
      providerId: 1,
      modelId: false,
      stream: "yes",
      operation: 2,
      nodeId: null,
      workflowId: undefined,
      runId: [],
      sessionId: {},
      userId: 3,
      tenantId: false,
      promptName: 1,
      promptType: 2,
    };

    expect(normalizeKnownAttributes(attributes)).toEqual(attributes);
  });
});
