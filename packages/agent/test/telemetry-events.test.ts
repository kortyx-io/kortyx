import type { KortyxTelemetryEvent } from "@kortyx/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitTelemetryEvent } from "../src/telemetry/events";

afterEach(() => {
  vi.doUnmock("node:crypto");
});

describe("emitTelemetryEvent", () => {
  it("enriches lifecycle events with trusted context and runtime correlation", async () => {
    const events: KortyxTelemetryEvent[] = [];
    emitTelemetryEvent({
      config: {
        context: { userId: "server-user", tenantId: "tenant-1" },
        telemetry: {
          environment: "test",
          service: { name: "app", deploymentRef: "sha" },
          tags: ["integration"],
          metadata: { region: "eu" },
          correlation: {
            runId: "run-1",
            sessionId: "session-1",
            workflowId: "workflow-1",
            topologyHash: "hash-1",
            nodeId: "base-node",
          },
          reporter: {
            ensureWorkflowTopology: async () => ({
              workflowRevisionId: "revision-1",
              created: false,
            }),
            emit: async (items: KortyxTelemetryEvent[]) => {
              events.push(...items);
            },
          },
        },
      },
      type: "interrupt.cancelled",
      correlation: { nodeId: "node-1" },
      payload: { interruptId: "interrupt-1" },
    });
    await Promise.resolve();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      environment: "test",
      service: { name: "app", deploymentRef: "sha" },
      correlation: {
        runId: "run-1",
        sessionId: "session-1",
        workflowId: "workflow-1",
        topologyHash: "hash-1",
        nodeId: "node-1",
      },
      context: {
        userId: "server-user",
        tenantId: "tenant-1",
        tags: ["integration"],
        metadata: { region: "eu" },
      },
    });
  });

  it("never lets broken custom reporters interrupt workflow execution", () => {
    expect(() =>
      emitTelemetryEvent({
        config: {
          telemetry: {
            environment: "test",
            service: { name: "app" },
            correlation: { runId: "run-1", workflowId: "workflow-1" },
            reporter: {
              ensureWorkflowTopology: () => {
                throw new Error("broken ensure");
              },
              emit: () => {
                throw new Error("broken emit");
              },
            },
          },
        },
        type: "run.cancelled",
        payload: {},
      }),
    ).not.toThrow();
  });

  it("ignores invalid trusted context and swallowed async delivery failures", async () => {
    emitTelemetryEvent({
      config: {
        context: { userId: 123, tenantId: false },
        telemetry: {
          environment: "test",
          service: { name: "app" },
          correlation: { runId: "run-1", workflowId: "workflow-1" },
          reporter: {
            ensureWorkflowTopology: async () => ({
              workflowRevisionId: "revision",
              created: false,
            }),
            emit: async () => {
              throw new Error("delivery failed");
            },
          },
        },
      },
      type: "run.cancelled",
      payload: {},
    });

    await Promise.resolve();
    await Promise.resolve();
  });

  it("falls back to a process-local event id when crypto UUID generation fails", async () => {
    vi.resetModules();
    vi.doMock("node:crypto", () => ({
      randomUUID: () => {
        throw new Error("crypto unavailable");
      },
    }));
    const now = vi.spyOn(Date, "now").mockReturnValue(123);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { emitTelemetryEvent: emitWithFallbackId } = await import(
      "../src/telemetry/events"
    );
    const events: KortyxTelemetryEvent[] = [];

    emitWithFallbackId({
      config: {
        telemetry: {
          environment: "test",
          service: { name: "app" },
          correlation: { runId: "run-1", workflowId: "workflow-1" },
          reporter: {
            ensureWorkflowTopology: async () => ({
              workflowRevisionId: "revision",
              created: false,
            }),
            emit: async (items: KortyxTelemetryEvent[]) => {
              events.push(...items);
            },
          },
        },
      },
      type: "run.cancelled",
      payload: {},
    });
    await Promise.resolve();

    expect(events[0]?.eventId).toBe("123-i");
    now.mockRestore();
    random.mockRestore();
  });
});
