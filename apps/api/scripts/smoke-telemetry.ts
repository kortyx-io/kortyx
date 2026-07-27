import { createHash, randomUUID } from "node:crypto";

const apiUrl = process.env.KORTYX_API_URL ?? "http://localhost:6400";
const telemetryApiKey = process.env.KORTYX_TELEMETRY_API_KEY;
const studioApiKey = process.env.KORTYX_STUDIO_API_KEY;
const configuredRunId = process.env.KORTYX_SMOKE_RUN_ID;
const configuredSessionId = process.env.KORTYX_SMOKE_SESSION_ID;

const requireEnv = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const endpoint = (path: string): string =>
  `${apiUrl.replace(/\/$/, "")}${path}`;

const postJson = async <T>(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<T> => {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `${path} failed with ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
};

const getJson = async <T>(path: string, apiKey: string): Promise<T> => {
  const response = await fetch(endpoint(path), {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `${path} failed with ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
};

const topology = {
  nodes: [
    {
      id: "reason",
      label: "Reason",
      type: "llm",
      provider: "openai",
      model: "gpt-4.1-mini",
    },
  ],
  edges: [
    {
      sourceNodeId: "__start__",
      targetNodeId: "reason",
    },
    {
      sourceNodeId: "reason",
      targetNodeId: "__end__",
    },
  ],
};

const topologyHash = createHash("sha256")
  .update(JSON.stringify(topology))
  .digest("hex");

const main = async (): Promise<void> => {
  const telemetryKey = requireEnv("KORTYX_TELEMETRY_API_KEY", telemetryApiKey);
  const now = new Date();
  const runId = configuredRunId ?? `smoke-run-${randomUUID()}`;
  const sessionId = configuredSessionId ?? `smoke-session-${randomUUID()}`;

  const revision = await postJson<{
    workflowRevisionId: string;
    created: boolean;
  }>("/v1/telemetry/workflow-revisions:ensure", telemetryKey, {
    schemaVersion: 1,
    environment: "development",
    service: {
      name: "kortyx-smoke",
      deploymentRef: "local-smoke",
    },
    workflow: {
      id: "smoke-workflow",
      declaredVersion: "0.0.1",
      description: "Kortyx Studio smoke-test workflow.",
      tags: ["smoke"],
      topologyHash,
      ...topology,
    },
  });

  await postJson("/v1/telemetry/events:batch", telemetryKey, {
    events: [
      {
        schemaVersion: 1,
        eventId: `${runId}-started`,
        occurredAt: now.toISOString(),
        environment: "development",
        service: {
          name: "kortyx-smoke",
          deploymentRef: "local-smoke",
        },
        correlation: {
          runId,
          sessionId,
          workflowId: "smoke-workflow",
          workflowRevisionId: revision.workflowRevisionId,
          topologyHash,
          nodeId: "reason",
        },
        context: {
          userId: "smoke-user",
          tenantId: "smoke-tenant",
          tags: ["smoke"],
        },
        type: "span.started",
        payload: {
          message: "Smoke run started.",
        },
      },
      {
        schemaVersion: 1,
        eventId: `${runId}-generation`,
        occurredAt: new Date(now.getTime() + 500).toISOString(),
        environment: "development",
        service: {
          name: "kortyx-smoke",
          deploymentRef: "local-smoke",
        },
        correlation: {
          runId,
          sessionId,
          workflowId: "smoke-workflow",
          workflowRevisionId: revision.workflowRevisionId,
          topologyHash,
          nodeId: "reason",
        },
        context: {
          userId: "smoke-user",
          tenantId: "smoke-tenant",
          tags: ["smoke"],
        },
        type: "generation.completed",
        payload: {
          provider: "openai",
          model: "gpt-4.1-mini",
          usage: {
            input: 1_000,
            output: 250,
            total: 1_250,
          },
          result: "Smoke generation completed.",
        },
      },
      {
        schemaVersion: 1,
        eventId: `${runId}-ended`,
        occurredAt: new Date(now.getTime() + 1_000).toISOString(),
        environment: "development",
        service: {
          name: "kortyx-smoke",
          deploymentRef: "local-smoke",
        },
        correlation: {
          runId,
          sessionId,
          workflowId: "smoke-workflow",
          workflowRevisionId: revision.workflowRevisionId,
          topologyHash,
          nodeId: "reason",
        },
        context: {
          userId: "smoke-user",
          tenantId: "smoke-tenant",
          tags: ["smoke"],
        },
        type: "span.ended",
        payload: {
          result: "Smoke run completed.",
        },
      },
    ],
  });

  console.log(`Sent smoke telemetry run ${runId}.`);

  if (studioApiKey) {
    const runs = await getJson<{ runs: Array<{ id: string }> }>(
      "/v1/studio/runs",
      studioApiKey,
    );
    const found = runs.runs.some((run) => run.id === runId);
    if (!found) {
      throw new Error(
        `Smoke run ${runId} was not returned by /v1/studio/runs.`,
      );
    }
    console.log(`Verified smoke run ${runId} through Studio read API.`);
  }
};

void main();
