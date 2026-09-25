import { describe, expect, it } from "vitest";
import { createKortyxTelemetryAdapter } from "../src";

type SentEvent = {
  type: string;
  correlation: Record<string, string>;
  payload: Record<string, unknown>;
};

type EventBatch = { body: { events: SentEvent[] } };

const topology = (topologyHash = "topology-hash") => ({
  schemaVersion: 1 as const,
  environment: "test",
  service: { name: "telemetry-test" },
  workflow: {
    id: "workflow",
    declaredVersion: "1",
    topologyHash,
    nodes: [],
    edges: [],
  },
});

const event = (eventId: string) => ({
  schemaVersion: 1 as const,
  eventId,
  occurredAt: "2026-01-01T00:00:00.000Z",
  environment: "test",
  service: { name: "telemetry-test" },
  correlation: { runId: "run_1", workflowId: "workflow" },
  type: "run.cancelled" as const,
  payload: {},
});

describe("createKortyxTelemetryAdapter", () => {
  it("registers topology once and batches correlated span, generation, and tool facts", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "ktyx_test_key_secret",
      environment: "test",
      service: { name: "telemetry-test" },
      flushIntervalMs: 60_000,
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        });
        return new Response(
          JSON.stringify(
            String(url).endsWith("workflow-revisions:ensure")
              ? { workflowRevisionId: "revision_1", created: true }
              : { accepted: true },
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await adapter.reporter?.ensureWorkflowTopology(topology());
    await adapter.trace?.withSpan?.(
      {
        name: "kortyx.run",
        attributes: {
          runId: "run_1",
          workflowId: "workflow",
          topologyHash: "topology-hash",
        },
      },
      async (run) => {
        await adapter.trace?.withSpan?.(
          {
            name: "runReasonEngine",
            attributes: {
              providerId: "openrouter",
              modelId: "anthropic/claude-sonnet-4.6",
              nodeId: "node_1",
            },
          },
          async (generation) => {
            generation.addEvent?.("useReason.tool-call.start", {
              tool: "search",
              toolCallId: "tool_1",
            });
            generation.addEvent?.("useReason.tool-call.complete", {
              tool: "search",
              toolCallId: "tool_1",
            });
            generation.end?.({
              attributes: {
                ttftMs: 120,
                streamDurationMs: 80,
                timeToLastTokenMs: 200,
              },
              usage: { input: 1, output: 2, total: 3 },
              providerMetadata: {
                providerId: "openrouter",
                cost: 0.001234,
              },
            });
          },
        );
        run.setAttributes?.({ "kortyx.run.final_workflow": "workflow" });
        run.end?.();
      },
    );
    await adapter.flush();

    const topologyRequest = requests.find(({ url }) =>
      url.endsWith("workflow-revisions:ensure"),
    );
    const batch = requests.find(({ url }) =>
      url.endsWith("events:batch"),
    ) as EventBatch;
    expect(topologyRequest).toBeDefined();
    expect(batch.body.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "span.started",
        "generation.completed",
        "tool.started",
        "tool.completed",
      ]),
    );
    expect(
      batch.body.events.every((event) => event.correlation.runId === "run_1"),
    ).toBe(true);

    const root = batch.body.events.find(
      (event) =>
        event.type === "span.started" && event.payload.name === "kortyx.run",
    );
    const generation = batch.body.events.find(
      (event) =>
        event.type === "generation.completed" &&
        event.payload.provider === "openrouter",
    );
    if (!root || !generation) {
      throw new Error(
        "Expected correlated root and generation telemetry events.",
      );
    }
    expect(generation.correlation.traceId).toBe(root.correlation.traceId);
    expect(generation.correlation.parentSpanId).toBe(root.correlation.spanId);
    expect(generation.payload).toMatchObject({
      pricing: {
        source: "provider",
        currency: "USD",
        actualCostMicros: 1234,
      },
      durationMs: expect.any(Number),
      ttftMs: 120,
      streamDurationMs: 80,
      postStreamDurationMs: expect.any(Number),
    });
    const endedRoot = batch.body.events.find(
      (event) =>
        event.type === "span.ended" && event.payload.name === "kortyx.run",
    );
    expect(endedRoot?.payload.attributes).toMatchObject({
      "kortyx.run.final_workflow": "workflow",
    });
  });

  it("deduplicates concurrent topology ensure requests and retries failed ensures", async () => {
    let topologyRequests = 0;
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "ktyx_test_key_secret",
      environment: "test",
      service: { name: "telemetry-test" },
      fetch: async (url) => {
        if (!String(url).endsWith("workflow-revisions:ensure")) {
          return new Response("{}", { status: 200 });
        }
        topologyRequests += 1;
        if (topologyRequests === 1)
          return new Response("nope", { status: 503 });
        return new Response(
          JSON.stringify({ workflowRevisionId: "revision_2", created: true }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await expect(
      Promise.all([
        adapter.reporter?.ensureWorkflowTopology(topology()),
        adapter.reporter?.ensureWorkflowTopology(topology()),
      ]),
    ).rejects.toThrow("503");
    expect(topologyRequests).toBe(1);

    await expect(
      adapter.reporter?.ensureWorkflowTopology(topology()),
    ).resolves.toMatchObject({ workflowRevisionId: "revision_2" });
    await expect(
      adapter.reporter?.ensureWorkflowTopology(topology()),
    ).resolves.toEqual({ workflowRevisionId: "revision_2", created: false });
    expect(topologyRequests).toBe(2);
  });

  it("does not emit uncorrelated spans or content unless content capture is enabled", async () => {
    const requests: EventBatch[] = [];
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "ktyx_test_key_secret",
      environment: "test",
      service: { name: "telemetry-test" },
      flushIntervalMs: 60_000,
      fetch: async (_url, init) => {
        requests.push({ body: JSON.parse(String(init?.body)) });
        return new Response("{}", { status: 200 });
      },
    });

    await adapter.trace?.withSpan?.(
      { name: "uncorrelated" },
      async () => undefined,
    );
    await adapter.trace?.withSpan?.(
      {
        name: "kortyx.run",
        attributes: { runId: "run_1", workflowId: "workflow" },
        telemetry: { input: "do not persist" },
      },
      async (span) => {
        span.end?.({ telemetry: { output: "do not persist" } });
      },
    );
    await adapter.flush();

    const payloads = requests.flatMap(({ body }) =>
      body.events.map((event) => event.payload),
    );
    expect(JSON.stringify(payloads)).not.toContain("do not persist");

    const capturedRequests: EventBatch[] = [];
    const captureAdapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "ktyx_test_key_secret",
      environment: "test",
      service: { name: "telemetry-test" },
      captureContent: true,
      flushIntervalMs: 60_000,
      fetch: async (_url, init) => {
        capturedRequests.push({ body: JSON.parse(String(init?.body)) });
        return new Response("{}", { status: 200 });
      },
    });
    await captureAdapter.trace?.withSpan?.(
      {
        name: "kortyx.run",
        attributes: { runId: "run_2", workflowId: "workflow" },
        telemetry: { input: "persist input" },
      },
      async (span) => {
        span.end?.({ telemetry: { output: "persist output" } });
      },
    );
    await captureAdapter.flush();
    const capturedPayloads = capturedRequests.flatMap(({ body }) =>
      body.events.map((event) => event.payload),
    );
    expect(JSON.stringify(capturedPayloads)).toContain("persist input");
    expect(JSON.stringify(capturedPayloads)).toContain("persist output");
  });

  it("retries failed delivery and drops the oldest events when the queue is full", async () => {
    let attempts = 0;
    const delivered: string[][] = [];
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "ktyx_test_key_secret",
      environment: "test",
      service: { name: "telemetry-test" },
      maxQueueSize: 2,
      flushIntervalMs: 60_000,
      fetch: async (_url, init) => {
        attempts += 1;
        if (attempts === 1) return new Response("offline", { status: 503 });
        const body = JSON.parse(String(init?.body)) as {
          events: Array<{ eventId: string }>;
        };
        delivered.push(body.events.map((item) => item.eventId));
        return new Response("{}", { status: 200 });
      },
    });

    await adapter.reporter?.emit([
      event("first"),
      event("second"),
      event("third"),
    ]);
    await adapter.flush();
    await adapter.flush();

    expect(attempts).toBe(2);
    expect(adapter.getDroppedEventCount()).toBe(1);
    expect(delivered).toEqual([["second", "third"]]);
  });

  it("drains events queued while a delivery request is in flight", async () => {
    let releaseFirstRequest: (() => void) | undefined;
    const firstRequestBlocked = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    let firstRequestStarted: (() => void) | undefined;
    const firstRequestReady = new Promise<void>((resolve) => {
      firstRequestStarted = resolve;
    });
    const delivered: string[][] = [];
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "ktyx_test_key_secret",
      environment: "test",
      service: { name: "telemetry-test" },
      flushIntervalMs: 60_000,
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          events: Array<{ eventId: string }>;
        };
        delivered.push(body.events.map((item) => item.eventId));
        if (delivered.length === 1) {
          firstRequestStarted?.();
          await firstRequestBlocked;
        }
        return new Response("{}", { status: 200 });
      },
    });

    await adapter.reporter?.emit([event("start")]);
    const firstFlush = adapter.flush();
    await firstRequestReady;
    await adapter.reporter?.emit([event("terminal")]);
    const secondFlush = adapter.flush();
    releaseFirstRequest?.();
    await Promise.all([firstFlush, secondFlush]);

    expect(delivered).toEqual([["start"], ["terminal"]]);
  });

  it("drops permanent 4xx delivery failures without retrying", async () => {
    let calls = 0;
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "key",
      environment: "test",
      service: { name: "app" },
      flushIntervalMs: 60_000,
      fetch: async () => {
        calls += 1;
        return new Response("bad key", { status: 401 });
      },
    });
    await adapter.reporter?.emit([event("permanent")]);
    await adapter.flush();
    await adapter.flush();
    expect(calls).toBe(1);
    expect(adapter.getPermanentDeliveryFailureCount()).toBe(1);
  });

  it("keeps interrupt facts when an older API rejects workflow.suspended", async () => {
    const accepted: string[] = [];
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "key",
      environment: "test",
      service: { name: "app" },
      flushIntervalMs: 60_000,
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          events: Array<{ eventId: string; type: string }>;
        };
        if (body.events.some((item) => item.type === "workflow.suspended"))
          return new Response("unsupported event type", { status: 400 });
        accepted.push(...body.events.map((item) => item.eventId));
        return new Response("{}", { status: 200 });
      },
    });
    await adapter.reporter?.emit([
      event("provider-ended"),
      { ...event("old-server-unsupported"), type: "workflow.suspended" },
      { ...event("interrupt-created"), type: "interrupt.created" },
    ]);

    await adapter.flush();

    expect(accepted).toEqual(["provider-ended", "interrupt-created"]);
    expect(adapter.getPermanentDeliveryFailureCount()).toBe(1);
  });

  it("keeps target workflow correlation isolated after a workflow transition", async () => {
    const batches: EventBatch[] = [];
    const adapter = createKortyxTelemetryAdapter({
      endpoint: "https://telemetry.example",
      apiKey: "key",
      environment: "test",
      service: { name: "app" },
      flushIntervalMs: 60_000,
      fetch: async (_url, init) => {
        batches.push({ body: JSON.parse(String(init?.body)) });
        return new Response("{}", { status: 200 });
      },
    });
    const source = {
      runId: "run",
      sessionId: "session",
      workflowId: "source",
      workflowRevisionId: "revision-a",
      topologyHash: "a".repeat(64),
    };
    const target = {
      runId: "run",
      sessionId: "session",
      workflowId: "target",
      workflowRevisionId: "revision-b",
      topologyHash: "b".repeat(64),
      nodeId: "target-node",
    };
    await adapter.trace?.withSpan?.(
      { name: "kortyx.run", attributes: source },
      async () => {
        await adapter.trace?.withSpan?.(
          {
            name: "kortyx.node",
            attributes: { ...source, nodeId: "source-node" },
          },
          async () => undefined,
        );
        await adapter.reporter?.emit([
          {
            ...event("transition"),
            correlation: source,
            type: "workflow.transitioned",
            payload: {
              sourceNodeId: "source-node",
              sourceWorkflowRevisionId: "revision-a",
              targetWorkflowId: "target",
              targetWorkflowRevisionId: "revision-b",
            },
          },
        ]);
        await adapter.trace?.withSpan?.(
          { name: "kortyx.node", attributes: target },
          async () => {
            await adapter.trace?.withSpan?.(
              {
                name: "runReasonEngine",
                attributes: {
                  ...target,
                  providerId: "google",
                  modelId: "gemini",
                },
              },
              async (span) => {
                span.addEvent?.("useReason.tool-call.complete", {
                  tool: "search",
                  toolCallId: "tool",
                });
                span.end?.({ usage: { total: 1 } });
              },
            );
          },
        );
      },
    );
    await adapter.flush();
    const events = batches.flatMap((batch) => batch.body.events);
    const targetEvents = events.filter(
      (item) => item.correlation.workflowId === "target",
    );
    expect(targetEvents).not.toHaveLength(0);
    expect(
      targetEvents.every(
        (item) =>
          item.correlation.workflowRevisionId === "revision-b" &&
          item.correlation.topologyHash === "b".repeat(64),
      ),
    ).toBe(true);
    expect(
      events.find((item) => item.type === "workflow.transitioned")?.payload,
    ).toMatchObject({
      sourceWorkflowRevisionId: "revision-a",
      targetWorkflowRevisionId: "revision-b",
    });
  });
});

it.each([
  undefined,
  "replace",
  "suppress",
  "throws",
])("captures error diagnostics automatically with optional %s projection", async (mode) => {
  const sent: SentEvent[] = [];
  const adapter = createKortyxTelemetryAdapter({
    endpoint: "https://telemetry.example",
    apiKey: "key",
    environment: "test",
    service: { name: "test" },
    flushIntervalMs: 60000,
    ...(mode
      ? {
          error: () => {
            if (mode === "throws") throw new Error("PRIVATE_PROJECTOR");
            return mode === "suppress"
              ? null
              : { type: "ProviderError", message: "Provider unavailable" };
          },
        }
      : {}),
    fetch: async (_url, init) => {
      sent.push(...JSON.parse(String(init?.body)).events);
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    },
  });
  const error = Object.assign(new TypeError("Provider connection refused"), {
    cause: new Error("PRIVATE_CAUSE"),
    body: "PRIVATE_BODY",
    apiKey: "PRIVATE_KEY",
  });
  await expect(
    adapter.trace?.withSpan?.(
      {
        name: "runReasonEngine",
        attributes: {
          runId: "run",
          workflowId: "workflow",
          providerId: "test",
          modelId: "model",
        },
        telemetry: { input: "PRIVATE_PROMPT", output: "PRIVATE_OUTPUT" },
      },
      async () => {
        throw error;
      },
    ),
  ).rejects.toBe(error);
  await adapter.flush();
  const failed = sent.find((e) => e.type === "span.failed");
  expect(failed?.payload.error).toMatchObject({
    name:
      mode === undefined
        ? "TypeError"
        : mode === "replace"
          ? "ProviderError"
          : "Error",
    message:
      mode === undefined
        ? "Provider connection refused"
        : mode === "replace"
          ? "Provider unavailable"
          : "An unexpected error occurred.",
  });
  if (mode === undefined) {
    expect(failed?.payload.error).toMatchObject({
      stack: expect.stringContaining("TypeError: Provider connection refused"),
      cause: { type: "Error", message: "PRIVATE_CAUSE" },
    });
  }
  expect(JSON.stringify(sent)).not.toMatch(
    /PRIVATE_BODY|PRIVATE_KEY|PRIVATE_PROMPT|PRIVATE_OUTPUT|PRIVATE_PROJECTOR/,
  );
});

it("reports a handled error on the active span without failing it", async () => {
  const sent: SentEvent[] = [];
  const adapter = createKortyxTelemetryAdapter({
    endpoint: "https://telemetry.example",
    apiKey: "key",
    environment: "test",
    service: { name: "test" },
    flushIntervalMs: 60_000,
    fetch: async (_url, init) => {
      sent.push(...JSON.parse(String(init?.body)).events);
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    },
  });
  const error = new TypeError("Candidate was not observed");

  await adapter.trace?.withSpan?.(
    {
      name: "kortyx.node",
      attributes: {
        runId: "run",
        workflowId: "workflow",
        nodeId: "resolve-brief",
      },
    },
    async () => {
      adapter.trace?.reportError?.(error, {
        severity: "warning",
        metadata: { candidateCount: 3, apiKey: "PRIVATE_KEY" },
        tags: ["brief"],
      });
      return "continued";
    },
  );
  await adapter.flush();

  expect(sent.map((event) => event.type)).toEqual([
    "span.started",
    "error.reported",
    "span.ended",
  ]);
  const reported = sent[1] as SentEvent & {
    context?: { metadata?: Record<string, unknown>; tags?: string[] };
  };
  expect(reported.payload).toMatchObject({
    handled: true,
    severity: "warning",
    error: {
      name: "TypeError",
      message: "Candidate was not observed",
      stack: expect.stringContaining("TypeError: Candidate was not observed"),
    },
  });
  expect(reported.correlation).toMatchObject({
    runId: "run",
    workflowId: "workflow",
    nodeId: "resolve-brief",
    traceId: expect.any(String),
    spanId: expect.any(String),
  });
  expect(reported.context).toEqual({
    tags: ["brief"],
    metadata: { candidateCount: 3 },
  });
  expect(JSON.stringify(sent)).not.toContain("PRIVATE_KEY");
});

it("ends expected suspension spans without emitting failures", async () => {
  const sent: SentEvent[] = [];
  const adapter = createKortyxTelemetryAdapter({
    endpoint: "https://telemetry.example",
    apiKey: "key",
    environment: "test",
    service: { name: "test" },
    flushIntervalMs: 60_000,
    fetch: async (_url, init) => {
      sent.push(...JSON.parse(String(init?.body)).events);
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    },
  });
  const interrupt = Object.assign(new Error("Execution paused"), {
    name: "GraphInterrupt",
  });

  await expect(
    adapter.trace?.withSpan?.(
      {
        name: "useReason",
        attributes: { runId: "run", workflowId: "workflow" },
      },
      async () => {
        throw interrupt;
      },
    ),
  ).rejects.toBe(interrupt);
  await adapter.flush();

  expect(sent.map((item) => item.type)).toEqual(["span.started", "span.ended"]);
  expect(sent[1]?.payload.attributes).toMatchObject({
    "kortyx.control_flow": true,
    "kortyx.suspended": true,
  });
});

it("exports failed-generation usage counts without raw usage or provider metadata", async () => {
  const sent: SentEvent[] = [];
  const adapter = createKortyxTelemetryAdapter({
    endpoint: "https://telemetry.example",
    apiKey: "key",
    environment: "test",
    service: { name: "test" },
    flushIntervalMs: 60000,
    fetch: async (_url, init) => {
      sent.push(...JSON.parse(String(init?.body)).events);
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    },
  });
  const span = adapter.trace?.startSpan({
    name: "runReasonEngine",
    attributes: { runId: "run", workflowId: "workflow" },
  });
  span?.fail?.(new Error("Provider unavailable"), {
    usage: {
      input: 17,
      output: 2,
      inputIncludesCacheRead: true,
      raw: { body: "PRIVATE_USAGE" },
    },
    providerMetadata: { body: "PRIVATE_METADATA" },
  });
  await adapter.flush();
  expect(JSON.stringify(sent)).not.toMatch(/PRIVATE_USAGE|PRIVATE_METADATA/);
  expect(
    sent.find((e) => e.type === "generation.completed")?.payload.usage,
  ).toEqual({ input: 17, output: 2, inputIncludesCacheRead: true });
});
