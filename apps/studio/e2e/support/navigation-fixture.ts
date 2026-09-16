import type { APIRequestContext } from "@playwright/test";
import { DRAWER_FIXTURE } from "./telemetry-fixture";

const apiUrl = (process.env.KORTYX_API_URL ?? "http://localhost:6400").replace(
  /\/$/,
  "",
);
const telemetryKey =
  process.env.KORTYX_TELEMETRY_API_KEY ??
  "ktyx_test_localtelemetry_oss-demo-telemetry-secret-change-me";
const studioKey =
  process.env.KORTYX_STUDIO_API_KEY ??
  "ktyx_test_localstudio_oss-demo-studio-secret-change-me";

export const NAVIGATION_FIXTURES = [
  { name: "colon", suffix: "owner:uuid" },
  { name: "delimiters", suffix: "path/segment?query=value#fragment" },
  { name: "percent", suffix: "literal%3A%25" },
  { name: "unicode", suffix: "café space+plus" },
].map(({ name, suffix }) => ({
  name,
  runId: `e2e-ktx25-link-run-${suffix}`,
  sessionId: `e2e-ktx25-link-session-${suffix}`,
  interruptId: `e2e-ktx25-link-interrupt-${suffix}`,
}));

export const CALL_LINK_FIXTURE = {
  name: "calls",
  runId: "e2e-ktx25-link-calls-run",
  sessionId: "e2e-ktx25-link-calls-session",
  interruptId: "e2e-ktx25-link-calls-interrupt-a",
  otherInterruptId: "e2e-ktx25-link-calls-interrupt-b",
  invocationId: "shared-parent-invocation",
} as const;

export async function seedNavigationFixtures(request: APIRequestContext) {
  const baseTime = Date.now() - 10_000;
  const events: Record<string, unknown>[] = [];
  const add = (
    fixture: { name: string; runId: string; sessionId: string },
    type: string,
    payload: Record<string, unknown>,
  ) => {
    const index = events.length;
    events.push({
      schemaVersion: 1,
      eventId: `e2e-ktx25-link-${fixture.name}-${index}`,
      occurredAt: new Date(baseTime + index).toISOString(),
      environment: "development",
      service: { name: "kortyx-studio-e2e", deploymentRef: "navigation" },
      correlation: {
        runId: fixture.runId,
        sessionId: fixture.sessionId,
        workflowId: DRAWER_FIXTURE.workflowId,
        nodeId: "chat",
        traceId: `e2e-ktx25-link-trace-${fixture.name}`,
        spanId: `e2e-ktx25-link-span-${fixture.name}`,
      },
      context: { userId: "e2e-link-user", tags: ["e2e", "navigation"] },
      type,
      payload,
    });
  };
  for (const fixture of NAVIGATION_FIXTURES) {
    add(fixture, "span.started", { name: "kortyx.run" });
    add(fixture, "interrupt.created", {
      interruptId: fixture.interruptId,
      kind: "choice",
      question: `Approve ${fixture.name} navigation?`,
    });
  }

  add(CALL_LINK_FIXTURE, "span.started", { name: "kortyx.run" });
  for (const branchId of ["branch-a", "branch-b"]) {
    const call = {
      invocationId: CALL_LINK_FIXTURE.invocationId,
      branchId,
      callId: "approval",
      // Keep the existing chat catalog call unexecuted for workflow-map tests.
      callerNodeId: "collectBrief",
      callerNodeExecutionId: `node-${branchId}`,
      parentInvocationId: null,
      sourceWorkflowId: DRAWER_FIXTURE.workflowId,
      targetWorkflowId: DRAWER_FIXTURE.workflowId,
    };
    add(CALL_LINK_FIXTURE, "workflow.call.started", { ...call, sequence: 1 });
    const nested = {
      ...call,
      invocationId: `nested-${branchId}`,
      parentInvocationId: CALL_LINK_FIXTURE.invocationId,
      callId: "nested-approval",
    };
    add(CALL_LINK_FIXTURE, "workflow.call.started", { ...nested, sequence: 2 });
    add(CALL_LINK_FIXTURE, "workflow.call.suspended", {
      ...nested,
      sequence: 3,
    });
    add(CALL_LINK_FIXTURE, "workflow.call.suspended", {
      ...call,
      sequence: 4,
      leaf: {
        invocationId: `nested-${branchId}`,
        workflowId: DRAWER_FIXTURE.workflowId,
        nodeId: "chat",
      },
    });
    add(CALL_LINK_FIXTURE, "interrupt.created", {
      interruptId:
        branchId === "branch-a"
          ? CALL_LINK_FIXTURE.interruptId
          : CALL_LINK_FIXTURE.otherInterruptId,
      branchId,
      kind: "choice",
      question: `Approve ${branchId}?`,
      workflowCall: {
        invocationId: `nested-${branchId}`,
        workflowId: DRAWER_FIXTURE.workflowId,
        nodeId: "chat",
      },
      workflowCallPath: [
        {
          invocationId: CALL_LINK_FIXTURE.invocationId,
          workflowId: DRAWER_FIXTURE.workflowId,
        },
        {
          invocationId: `nested-${branchId}`,
          workflowId: DRAWER_FIXTURE.workflowId,
        },
      ],
    });
  }

  const response = await request.post(`${apiUrl}/v1/telemetry/events:batch`, {
    headers: { authorization: `Bearer ${telemetryKey}` },
    data: { events },
  });
  if (!response.ok())
    throw new Error(`Navigation fixture failed: ${await response.text()}`);

  for (const fixture of [...NAVIGATION_FIXTURES, CALL_LINK_FIXTURE]) {
    for (const resource of ["runs", "sessions", "interrupts"] as const) {
      const id =
        fixture[
          resource === "runs"
            ? "runId"
            : resource === "sessions"
              ? "sessionId"
              : "interruptId"
        ];
      const detail = await request.get(
        `${apiUrl}/v1/studio/${resource}/${encodeURIComponent(id)}`,
        { headers: { authorization: `Bearer ${studioKey}` } },
      );
      if (!detail.ok())
        throw new Error(
          `Missing ${resource} navigation fixture: ${await detail.text()}`,
        );
    }
  }
}
