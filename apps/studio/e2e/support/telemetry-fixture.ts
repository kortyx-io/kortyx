import { createHash } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import postgres from "postgres";

const FIXTURE_PREFIX = "e2e-ktx25";
const apiUrl = (process.env.KORTYX_API_URL ?? "http://localhost:6400").replace(
  /\/$/,
  "",
);
const telemetryApiKey =
  process.env.KORTYX_TELEMETRY_API_KEY ??
  "ktyx_test_localtelemetry_oss-demo-telemetry-secret-change-me";
const studioApiKey =
  process.env.KORTYX_STUDIO_API_KEY ??
  "ktyx_test_localstudio_oss-demo-studio-secret-change-me";

export const DRAWER_FIXTURE = {
  interruptId: `${FIXTURE_PREFIX}-interrupt`,
  runId: `${FIXTURE_PREFIX}-run`,
  sessionId: `${FIXTURE_PREFIX}-session`,
  workflowId: `${FIXTURE_PREFIX}-workflow`,
} as const;

export const LIVE_RUN_ID = `${FIXTURE_PREFIX}-live-run`;

const topology = {
  nodes: [
    { id: "chat", label: "Chat", type: "agent" },
    {
      id: "collectBrief",
      label: "Collect brief",
      type: "llm",
      provider: "openai",
      model: "gpt-4.1-mini",
    },
    { id: "publishBrief", label: "Publish brief", type: "tool" },
  ],
  edges: [
    { sourceNodeId: "__start__", targetNodeId: "chat" },
    { sourceNodeId: "chat", targetNodeId: "collectBrief" },
    { sourceNodeId: "collectBrief", targetNodeId: "publishBrief" },
    { sourceNodeId: "publishBrief", targetNodeId: "__end__" },
  ],
  transitions: [
    {
      sourceNodeId: "collectBrief",
      targetWorkflowId: DRAWER_FIXTURE.workflowId,
      intent: "resume after approval",
    },
  ],
};

const topologyHash = createHash("sha256")
  .update(JSON.stringify(topology))
  .digest("hex");

const bearer = (apiKey: string) => ({
  authorization: `Bearer ${apiKey}`,
  accept: "application/json",
});

export async function cleanupDrawerFixture() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx";
  const sql = postgres(databaseUrl, { max: 1 });
  const idPattern = `${FIXTURE_PREFIX}-%`;

  try {
    await sql.begin(async (transaction) => {
      await transaction`
        delete from studio_interrupts
        where interrupt_id like ${idPattern}
      `;
      await transaction`
        delete from studio_runs
        where run_id like ${idPattern}
      `;
      await transaction`
        delete from studio_sessions
        where session_id like ${idPattern}
      `;
      await transaction`
        delete from telemetry_events
        where run_id like ${idPattern}
           or session_id like ${idPattern}
      `;
      await transaction`
        delete from workflow_revisions
        where workflow_id = ${DRAWER_FIXTURE.workflowId}
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function seedDrawerFixture(request: APIRequestContext) {
  const revisionResponse = await request.post(
    `${apiUrl}/v1/telemetry/workflow-revisions:ensure`,
    {
      headers: {
        ...bearer(telemetryApiKey),
        "content-type": "application/json",
      },
      data: {
        schemaVersion: 1,
        environment: "development",
        service: {
          name: "kortyx-studio-e2e",
          deploymentRef: "playwright",
        },
        workflow: {
          id: DRAWER_FIXTURE.workflowId,
          declaredVersion: "1.0.0-e2e",
          description: "Deterministic telemetry for drawer-stack tests.",
          tags: ["e2e", "ktx-25"],
          topologyHash,
          ...topology,
        },
      },
    },
  );
  assertResponse(revisionResponse.ok(), await revisionResponse.text());
  const revision = (await revisionResponse.json()) as {
    workflowRevisionId: string;
  };

  const baseTime = Date.now() - 10_000;
  const service = {
    name: "kortyx-studio-e2e",
    deploymentRef: "playwright",
  };
  const context = {
    userId: "e2e-user",
    tenantId: "e2e-tenant",
    tags: ["e2e", "ktx-25"],
    metadata: { fixture: FIXTURE_PREFIX },
  };
  const correlation = (
    nodeId: string,
    spanId?: string,
    parentSpanId?: string,
  ) => ({
    runId: DRAWER_FIXTURE.runId,
    sessionId: DRAWER_FIXTURE.sessionId,
    workflowId: DRAWER_FIXTURE.workflowId,
    workflowRevisionId: revision.workflowRevisionId,
    topologyHash,
    nodeId,
    traceId: `${FIXTURE_PREFIX}-trace`,
    ...(spanId ? { spanId } : {}),
    ...(parentSpanId ? { parentSpanId } : {}),
  });
  const event = (
    suffix: string,
    offsetMs: number,
    type: string,
    nodeId: string,
    payload: Record<string, unknown>,
    spanId?: string,
    parentSpanId?: string,
  ) => ({
    schemaVersion: 1,
    eventId: `${FIXTURE_PREFIX}-${suffix}`,
    occurredAt: new Date(baseTime + offsetMs).toISOString(),
    environment: "development",
    service,
    correlation: correlation(nodeId, spanId, parentSpanId),
    context,
    type,
    payload,
  });

  const events = [
    event(
      "execution-1-started",
      0,
      "span.started",
      "chat",
      { name: "kortyx.run", phase: 1 },
      `${FIXTURE_PREFIX}-execution-1`,
    ),
    event(
      "chat-started",
      100,
      "span.started",
      "chat",
      { name: "kortyx.node" },
      `${FIXTURE_PREFIX}-node-chat`,
      `${FIXTURE_PREFIX}-execution-1`,
    ),
    event(
      "generation-started",
      200,
      "span.started",
      "collectBrief",
      {
        name: "runReasonEngine",
        attributes: {
          providerId: "openai",
          modelId: "gpt-4.1-mini",
          stream: true,
        },
      },
      `${FIXTURE_PREFIX}-generation`,
      `${FIXTURE_PREFIX}-node-chat`,
    ),
    event(
      "generation-completed",
      700,
      "generation.completed",
      "collectBrief",
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        durationMs: 500,
        ttftMs: 120,
        streamDurationMs: 300,
        postStreamDurationMs: 80,
        usage: { input: 400, output: 120, reasoning: 30, total: 550 },
        result: "## Deterministic brief\n\n- Approved\n- Ready to publish",
        emptyString: "",
        emptyObject: {},
        nullable: null,
        nested: { empty: "", visible: "kept" },
      },
      `${FIXTURE_PREFIX}-generation`,
      `${FIXTURE_PREFIX}-node-chat`,
    ),
    event(
      "generation-ended",
      720,
      "span.ended",
      "collectBrief",
      { name: "runReasonEngine", durationMs: 520 },
      `${FIXTURE_PREFIX}-generation`,
      `${FIXTURE_PREFIX}-node-chat`,
    ),
    event(
      "interrupt-created",
      800,
      "interrupt.created",
      "collectBrief",
      {
        interruptId: DRAWER_FIXTURE.interruptId,
        requestId: `${FIXTURE_PREFIX}-request`,
        kind: "choice",
        nodeId: "collectBrief",
        question: "Which deterministic path should the test resume?",
        options: ["approve", "revise"],
        optionCount: 2,
        expiresAt: new Date(baseTime + 300_000).toISOString(),
      },
      `${FIXTURE_PREFIX}-execution-1`,
    ),
    event(
      "checkpointed",
      900,
      "session.checkpointed",
      "collectBrief",
      { nodes: ["chat", "collectBrief"], reason: "interrupt boundary" },
      `${FIXTURE_PREFIX}-execution-1`,
    ),
    event(
      "chat-ended",
      950,
      "span.ended",
      "chat",
      { name: "kortyx.node", durationMs: 850 },
      `${FIXTURE_PREFIX}-node-chat`,
      `${FIXTURE_PREFIX}-execution-1`,
    ),
    event(
      "execution-1-ended",
      1_000,
      "span.ended",
      "chat",
      { name: "kortyx.run", durationMs: 1_000 },
      `${FIXTURE_PREFIX}-execution-1`,
    ),
    event(
      "interrupt-resolved",
      1_200,
      "interrupt.resolved",
      "collectBrief",
      {
        interruptId: DRAWER_FIXTURE.interruptId,
        response: "approve",
        resolvedBy: "e2e-user",
        resolvedAt: new Date(baseTime + 1_200).toISOString(),
        resumeOutcome: "resumed",
      },
      `${FIXTURE_PREFIX}-execution-1`,
    ),
    event(
      "execution-2-started",
      1_300,
      "span.started",
      "publishBrief",
      { name: "kortyx.run", phase: 2 },
      `${FIXTURE_PREFIX}-execution-2`,
    ),
    event(
      "publish-started",
      1_400,
      "span.started",
      "publishBrief",
      { name: "kortyx.node" },
      `${FIXTURE_PREFIX}-node-publish`,
      `${FIXTURE_PREFIX}-execution-2`,
    ),
    event(
      "transitioned",
      1_500,
      "workflow.transitioned",
      "publishBrief",
      {
        sourceNodeId: "collectBrief",
        sourceWorkflowId: DRAWER_FIXTURE.workflowId,
        targetWorkflowId: DRAWER_FIXTURE.workflowId,
        condition: "approved",
      },
      `${FIXTURE_PREFIX}-execution-2`,
    ),
    event(
      "tool-started",
      1_600,
      "tool.started",
      "publishBrief",
      { name: "publishBrief", tool: "fixture.publisher" },
      `${FIXTURE_PREFIX}-tool`,
      `${FIXTURE_PREFIX}-node-publish`,
    ),
    event(
      "tool-completed",
      1_800,
      "tool.completed",
      "publishBrief",
      { name: "publishBrief", durationMs: 200, result: "published" },
      `${FIXTURE_PREFIX}-tool`,
      `${FIXTURE_PREFIX}-node-publish`,
    ),
    event(
      "publish-ended",
      1_900,
      "span.ended",
      "publishBrief",
      { name: "kortyx.node", durationMs: 500 },
      `${FIXTURE_PREFIX}-node-publish`,
      `${FIXTURE_PREFIX}-execution-2`,
    ),
    event(
      "execution-2-ended",
      2_000,
      "span.ended",
      "publishBrief",
      { name: "kortyx.run", durationMs: 700, result: "Completed" },
      `${FIXTURE_PREFIX}-execution-2`,
    ),
  ];

  const eventResponse = await request.post(
    `${apiUrl}/v1/telemetry/events:batch`,
    {
      headers: {
        ...bearer(telemetryApiKey),
        "content-type": "application/json",
      },
      data: { events },
    },
  );
  assertResponse(eventResponse.ok(), await eventResponse.text());

  await pollForProjection(request, "sessions", DRAWER_FIXTURE.sessionId);
  await pollForProjection(request, "runs", DRAWER_FIXTURE.runId);
  await pollForProjection(request, "interrupts", DRAWER_FIXTURE.interruptId);
}

export async function emitLiveRunChange(request: APIRequestContext) {
  const response = await request.post(`${apiUrl}/v1/telemetry/events:batch`, {
    headers: {
      ...bearer(telemetryApiKey),
      "content-type": "application/json",
    },
    data: {
      events: [
        {
          schemaVersion: 1,
          eventId: `${FIXTURE_PREFIX}-live-event`,
          occurredAt: new Date().toISOString(),
          environment: "development",
          service: {
            name: "kortyx-studio-e2e",
            deploymentRef: "playwright-live",
          },
          correlation: {
            runId: LIVE_RUN_ID,
            workflowId: DRAWER_FIXTURE.workflowId,
            topologyHash,
            nodeId: "chat",
            traceId: `${FIXTURE_PREFIX}-live-trace`,
            spanId: `${FIXTURE_PREFIX}-live-span`,
          },
          context: {
            userId: "e2e-live-user",
            tenantId: "e2e-tenant",
            tags: ["e2e", "ktx-18"],
          },
          type: "span.started",
          payload: { name: "kortyx.run" },
        },
      ],
    },
  });
  assertResponse(response.ok(), await response.text());
}

async function pollForProjection(
  request: APIRequestContext,
  resource: "sessions" | "runs" | "interrupts",
  id: string,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await request.get(
      `${apiUrl}/v1/studio/${resource}/${encodeURIComponent(id)}`,
      { headers: bearer(studioApiKey) },
    );
    if (response.ok()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for the ${resource}/${id} projection.`);
}

function assertResponse(ok: boolean, responseBody: string) {
  if (!ok) throw new Error(`Fixture API request failed: ${responseBody}`);
}
