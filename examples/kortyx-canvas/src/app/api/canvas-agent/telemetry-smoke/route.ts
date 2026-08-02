import { createHash, randomUUID } from "node:crypto";
import {
  getCanvasTelemetryAdapter,
  isCanvasTelemetryConfigured,
} from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const topology = {
  nodes: [
    {
      id: "general-chat",
      label: "General Chat",
      type: "llm",
      provider: "google",
      model: "gemini-2.5-flash",
    },
    {
      id: "canvas-create",
      label: "Create Discovery Canvas",
      type: "workflow",
    },
  ],
  edges: [
    {
      sourceNodeId: "__start__",
      targetNodeId: "general-chat",
    },
    {
      sourceNodeId: "general-chat",
      targetNodeId: "canvas-create",
      condition: "user asks to build a discovery canvas",
    },
    {
      sourceNodeId: "canvas-create",
      targetNodeId: "__end__",
    },
  ],
};

const topologyHash = createHash("sha256")
  .update(JSON.stringify(topology))
  .digest("hex");

export async function POST(): Promise<Response> {
  if (!isCanvasTelemetryConfigured()) {
    return Response.json(
      {
        error:
          "Canvas telemetry is not configured. Set KORTYX_TELEMETRY_API_URL or KORTYX_API_URL, plus KORTYX_TELEMETRY_API_KEY.",
      },
      { status: 503 },
    );
  }

  const telemetry = getCanvasTelemetryAdapter();
  if (!telemetry?.reporter || !telemetry.environment || !telemetry.service) {
    return Response.json(
      { error: "Canvas telemetry adapter is not available." },
      { status: 503 },
    );
  }

  const now = new Date();
  const runId = `canvas-smoke-run-${randomUUID()}`;
  const sessionId = `canvas-smoke-session-${randomUUID()}`;
  const revision = await telemetry.reporter.ensureWorkflowTopology({
    schemaVersion: 1,
    environment: telemetry.environment,
    service: telemetry.service,
    workflow: {
      id: "canvas-example-smoke",
      declaredVersion: "0.0.1",
      description: "Kortyx Canvas example telemetry smoke workflow.",
      tags: ["canvas-example", "smoke"],
      topologyHash,
      ...topology,
    },
  });

  await telemetry.reporter.emit([
    {
      schemaVersion: 1,
      eventId: `${runId}-started`,
      occurredAt: now.toISOString(),
      environment: telemetry.environment,
      service: telemetry.service,
      correlation: {
        runId,
        sessionId,
        workflowId: "canvas-example-smoke",
        workflowRevisionId: revision.workflowRevisionId,
        topologyHash,
        nodeId: "general-chat",
      },
      context: {
        userId: "canvas-demo-user",
        tenantId: "canvas-demo-tenant",
        tags: ["canvas-example", "smoke"],
      },
      type: "span.started",
      payload: {
        name: "kortyx.run",
        source: "examples/kortyx-canvas",
      },
    },
    {
      schemaVersion: 1,
      eventId: `${runId}-generation`,
      occurredAt: new Date(now.getTime() + 500).toISOString(),
      environment: telemetry.environment,
      service: telemetry.service,
      correlation: {
        runId,
        sessionId,
        workflowId: "canvas-example-smoke",
        workflowRevisionId: revision.workflowRevisionId,
        topologyHash,
        nodeId: "general-chat",
      },
      context: {
        userId: "canvas-demo-user",
        tenantId: "canvas-demo-tenant",
        tags: ["canvas-example", "smoke"],
      },
      type: "generation.completed",
      payload: {
        provider: "google",
        model: "gemini-2.5-flash",
        usage: {
          input: 1200,
          output: 450,
          total: 1650,
        },
        pricing: {
          source: "custom",
          currency: "USD",
          pricingRef: "canvas-smoke-custom-gemini-rate",
          unitPrices: [
            {
              usageType: "input",
              unit: "token",
              unitQuantity: 1_000_000,
              priceMicros: 100_000,
              label: "input tokens",
            },
            {
              usageType: "output",
              unit: "token",
              unitQuantity: 1_000_000,
              priceMicros: 400_000,
              label: "output tokens",
            },
          ],
        },
        result: "Canvas telemetry smoke generation completed.",
      },
    },
    {
      schemaVersion: 1,
      eventId: `${runId}-ended`,
      occurredAt: new Date(now.getTime() + 1000).toISOString(),
      environment: telemetry.environment,
      service: telemetry.service,
      correlation: {
        runId,
        sessionId,
        workflowId: "canvas-example-smoke",
        workflowRevisionId: revision.workflowRevisionId,
        topologyHash,
        nodeId: "canvas-create",
      },
      context: {
        userId: "canvas-demo-user",
        tenantId: "canvas-demo-tenant",
        tags: ["canvas-example", "smoke"],
      },
      type: "span.ended",
      payload: {
        name: "kortyx.run",
        result: "Canvas telemetry smoke run completed.",
      },
    },
  ]);
  await telemetry.flush();

  return Response.json({
    ok: true,
    runId,
    workflowRevisionId: revision.workflowRevisionId,
    created: revision.created,
  });
}
