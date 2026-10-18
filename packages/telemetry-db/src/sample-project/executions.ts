import { createHash } from "node:crypto";
import {
  EnsureWorkflowTopologyRequestSchema,
  type KortyxTelemetryEvent,
  SAMPLE_PROJECT as sample,
  TelemetryEventSchema,
  ToolObservationSchema,
} from "@kortyx/telemetry-contracts";
import type { TelemetryEventRecord, WorkflowRevision } from "../schema";

const date = (offset: number) =>
  new Date(Date.parse(sample.recordedAt) + offset);
const scope = {
  organizationId: "10000000-0000-4000-8000-000000000010",
  projectId: "10000000-0000-4000-8000-000000000011",
};
const topology = {
  nodes: [
    {
      id: "answer",
      label: "Support assistant",
      type: "llm",
      provider: "openai",
      model: "gpt-4.1-mini",
    },
    {
      id: "lookupOrder",
      label: "Look up order",
      type: "tool",
      tools: [
        {
          name: "lookupOrder",
          description: "Read an order",
          callingMode: "model" as const,
          provenance: "source" as const,
        },
      ],
    },
    { id: "approveRefund", label: "Approve refund", type: "interrupt" },
  ],
  edges: [
    { sourceNodeId: "__start__", targetNodeId: "answer" },
    { sourceNodeId: "answer", targetNodeId: "lookupOrder" },
    {
      sourceNodeId: "lookupOrder",
      targetNodeId: "approveRefund",
      condition: "refund requested",
    },
    {
      sourceNodeId: "lookupOrder",
      targetNodeId: "__end__",
      condition: "question answered",
    },
    { sourceNodeId: "approveRefund", targetNodeId: "__end__" },
  ],
};
const topologyHash = createHash("sha256")
  .update(JSON.stringify(topology))
  .digest("hex");
const revision = EnsureWorkflowTopologyRequestSchema.parse({
  schemaVersion: 1,
  environment: "sample",
  service: { name: "sample-support" },
  workflow: {
    id: sample.workflowId,
    declaredVersion: "1.0.0",
    topologyHash,
    description:
      "A support assistant that looks up orders and requests refund approval.",
    tags: ["sample", "support"],
    ...topology,
  },
});

// Deliberately narrow authoring contracts. A new event kind requires an explicit
// builder contract; the permissive telemetry envelope alone is not enough.
type Payloads = {
  "span.started": { name: string; input?: string };
  "span.ended": { name: string; durationMs: number; output?: string };
  "span.failed": { name: string; error: { name: string; message: string } };
  "generation.completed": {
    provider: string;
    model: string;
    durationMs: number;
    usage: { input: number; output: number; total: number };
    input: string;
    output: string;
  };
  "tool.started": {
    version: 1;
    name: string;
    toolCallId: string;
    attemptId: string;
    callingMode: "model";
    executed: boolean;
  };
  "tool.completed": Payloads["tool.started"] & {
    outcome: "success";
    durationMs: number;
  };
  "interrupt.created": {
    interruptId: string;
    kind: "choice";
    question: string;
    options: Array<{ id: string; label: string }>;
    optionCount: number;
    interactionMode: "static-options";
  };
  "interrupt.resolved": {
    interruptId: string;
    response: string;
    responseValue: string;
    responseCaptured: boolean;
    resumeOutcome: "resumed";
    resolvedBy: string;
  };
};
function scenario(
  kind: keyof typeof sample.runs,
  offset: number,
): KortyxTelemetryEvent[] {
  const events: KortyxTelemetryEvent[] = [];
  function event<K extends keyof Payloads>(
    type: K,
    suffix: string,
    ms: number,
    nodeId: string,
    payload: Payloads[K],
    spanId = "run",
    parentSpanId?: string,
  ) {
    if (type.startsWith("tool.")) ToolObservationSchema.strict().parse(payload);
    events.push(
      TelemetryEventSchema.parse({
        schemaVersion: 1,
        eventId: `${sample.runs[kind]}-${suffix}`,
        occurredAt: date(offset + ms).toISOString(),
        environment: "sample",
        service: { name: "sample-support", deploymentRef: "sample-v1" },
        correlation: {
          runId: sample.runs[kind],
          sessionId: sample.sessions[kind],
          workflowId: sample.workflowId,
          workflowRevisionId: sample.revisionId,
          topologyHash,
          nodeId,
          traceId: `${sample.runs[kind]}-trace`,
          spanId: `${sample.runs[kind]}-${spanId}`,
          ...(parentSpanId
            ? { parentSpanId: `${sample.runs[kind]}-${parentSpanId}` }
            : {}),
        },
        context: { userId: "sample-customer", tags: ["sample", kind] },
        type,
        payload,
      }),
    );
  }
  event("span.started", "start", 0, "answer", {
    name: "kortyx.run",
    input:
      kind === "approval"
        ? "Can I get a refund for order SAMPLE-42?"
        : kind === "followUp"
          ? "Will order SAMPLE-42 need a signature?"
          : "Where is order SAMPLE-42?",
  });
  event(
    "span.started",
    "reason-start",
    10,
    "answer",
    { name: "runReasonEngine" },
    "reason",
    "run",
  );
  if (kind === "failure") {
    event(
      "span.failed",
      "reason-failed",
      800,
      "answer",
      {
        name: "runReasonEngine",
        error: {
          name: "ProviderTimeout",
          message: "The model request timed out. Retry the request.",
        },
      },
      "reason",
      "run",
    );
    event("span.failed", "failed", 810, "answer", {
      name: "kortyx.run",
      error: {
        name: "ProviderTimeout",
        message: "The model request timed out. Retry the request.",
      },
    });
    return events;
  }
  event(
    "generation.completed",
    "generation",
    400,
    "answer",
    {
      provider: "openai",
      model: "gpt-4.1-mini",
      durationMs: 390,
      usage: { input: 240, output: 60, total: 300 },
      input:
        kind === "followUp"
          ? "Check whether order SAMPLE-42 needs a signature."
          : "Find the status of order SAMPLE-42.",
      output: "I will look up your order.",
    },
    "reason",
    "run",
  );
  event(
    "span.ended",
    "reason-end",
    410,
    "answer",
    { name: "runReasonEngine", durationMs: 400 },
    "reason",
    "run",
  );
  const tool = {
    version: 1 as const,
    name: "lookupOrder",
    toolCallId: `${sample.runs[kind]}-lookup`,
    attemptId: `${sample.runs[kind]}-attempt`,
    callingMode: "model" as const,
    executed: true,
  };
  event("tool.started", "tool-start", 420, "lookupOrder", tool, "tool", "run");
  event(
    "tool.completed",
    "tool-end",
    600,
    "lookupOrder",
    { ...tool, outcome: "success", durationMs: 180 },
    "tool",
    "run",
  );
  if (kind === "approval") {
    event("interrupt.created", "approval", 650, "approveRefund", {
      interruptId: sample.interruptId,
      kind: "choice",
      question: "Approve the $24 refund?",
      options: [
        { id: "approve", label: "Approve refund" },
        { id: "deny", label: "Decline refund" },
      ],
      optionCount: 2,
      interactionMode: "static-options",
    });
    event("interrupt.resolved", "approved", 2000, "approveRefund", {
      interruptId: sample.interruptId,
      response: "Approve refund",
      responseValue: "approve",
      responseCaptured: true,
      resumeOutcome: "resumed",
      resolvedBy: "Sample reviewer",
    });
  }
  event(
    "span.ended",
    "complete",
    kind === "approval" ? 2100 : 900,
    kind === "approval" ? "approveRefund" : "answer",
    {
      name: "kortyx.run",
      durationMs: kind === "approval" ? 2100 : 900,
      output:
        kind === "approval"
          ? "Your refund was approved."
          : kind === "baseline"
            ? "I cannot tell you when the order arrives."
            : kind === "followUp"
              ? "Your order does not need a signature."
              : "Order SAMPLE-42 is on its way and arrives tomorrow.",
    },
  );
  return events;
}

export function createSampleExecutionRecords(): {
  events: TelemetryEventRecord[];
  revisions: WorkflowRevision[];
} {
  const scenarios = {
    success: scenario("success", 0),
    failure: scenario("failure", 60_000),
    approval: scenario("approval", 120_000),
    followUp: scenario("followUp", 180_000),
    baseline: scenario("baseline", -60_000),
  } satisfies Record<keyof typeof sample.runs, KortyxTelemetryEvent[]>;
  const canonical = Object.values(scenarios).flat();
  if (
    new Set(canonical.map((event) => event.eventId)).size !== canonical.length
  )
    throw new Error("Duplicate sample event identity.");
  const events = canonical.map(
    (event, index): TelemetryEventRecord => ({
      ...scope,
      id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      eventId: event.eventId,
      schemaVersion: event.schemaVersion,
      type: event.type,
      occurredAt: new Date(event.occurredAt),
      receivedAt: new Date(event.occurredAt),
      environment: event.environment,
      serviceName: event.service.name,
      deploymentRef: event.service.deploymentRef ?? null,
      runId: event.correlation.runId,
      sessionId: event.correlation.sessionId ?? null,
      workflowId: event.correlation.workflowId,
      workflowRevisionId: sample.revisionId,
      topologyHash,
      traceId: event.correlation.traceId ?? null,
      spanId: event.correlation.spanId ?? null,
      parentSpanId: event.correlation.parentSpanId ?? null,
      nodeId: event.correlation.nodeId ?? null,
      userId: event.context?.userId ?? null,
      tenantId: null,
      contextTags: event.context?.tags ?? [],
      contextMetadata: { sample: true, datasetVersion: sample.version },
      payload: event.payload,
    }),
  );
  const workflow = revision.workflow;
  return {
    events,
    revisions: [
      {
        ...scope,
        id: sample.revisionId,
        environment: "sample",
        workflowId: workflow.id,
        declaredVersion: workflow.declaredVersion,
        topologyHash,
        serviceName: "sample-support",
        deploymentRef: "sample-v1",
        description: workflow.description ?? null,
        tags: workflow.tags ?? [],
        nodes: workflow.nodes,
        edges: workflow.edges,
        workflowTransitions: [],
        createdAt: date(0),
      },
    ],
  };
}
