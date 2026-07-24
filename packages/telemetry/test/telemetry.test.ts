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
              providerId: "google",
              modelId: "gemini",
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
        event.payload.provider === "google",
    );
    if (!root || !generation) {
      throw new Error(
        "Expected correlated root and generation telemetry events.",
      );
    }
    expect(generation.correlation.traceId).toBe(root.correlation.traceId);
    expect(generation.correlation.parentSpanId).toBe(root.correlation.spanId);
    expect(generation.payload).toMatchObject({
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
