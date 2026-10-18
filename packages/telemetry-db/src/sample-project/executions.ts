import { createHash } from "node:crypto";
import {
  EnsureWorkflowTopologyRequestSchema,
  type KortyxTelemetryEvent,
  SAMPLE_PROJECT as sample,
  TelemetryEventSchema,
  ToolObservationSchema,
} from "@kortyx/telemetry-contracts";
import type { TelemetryEventRecord, WorkflowRevision } from "../schema";
import { SAMPLE_SUPPORT_CONVERSATIONS, type SampleTurn } from "./scenarios";

const date = (offset: number) =>
  new Date(Date.parse(sample.recordedAt) + offset);
const scope = {
  organizationId: "10000000-0000-4000-8000-000000000010",
  projectId: "10000000-0000-4000-8000-000000000011",
};
const tools = {
  research: [
    {
      name: "readParcel",
      description:
        "Find a fictional order by its receipt reference and return shipment facts.",
    },
    {
      name: "readDeliveryNote",
      description:
        "Read signature requirements and the location of the delivery note for a verified order.",
    },
  ],
  resolution: [
    {
      name: "checkReturnWindow",
      description:
        "Read the recorded return options for a verified fictional order; does not create a credit.",
    },
    {
      name: "prepareCredit",
      description:
        "Create one credit for an explicitly approved review; reject duplicate reviews.",
    },
  ],
};
const definitions = [
  {
    id: sample.workflowId,
    revisionId: sample.revisionId,
    description:
      "A support coordinator that delegates order research and resolution reviews to two returning specialists.",
    nodes: [
      {
        id: "answer",
        label: "Support coordinator",
        type: "llm",
        provider: "openai",
        model: "gpt-4.1-mini",
      },
    ],
    edges: [
      { sourceNodeId: "__start__", targetNodeId: "answer" },
      { sourceNodeId: "answer", targetNodeId: "__end__" },
    ],
    calls: Object.values(sample.specialistWorkflowIds).map(
      (targetWorkflowId) => ({ sourceNodeId: "answer", targetWorkflowId }),
    ),
  },
  ...(["research", "resolution"] as const).map((kind) => ({
    id: sample.specialistWorkflowIds[kind],
    revisionId: sample.specialistRevisionIds[kind],
    description:
      kind === "research"
        ? "Read shipment facts and delivery notes; return verified references to the coordinator."
        : "Check resolution options, pause for review, and return the approved or declined outcome.",
    nodes: [
      {
        id: kind,
        label: kind === "research" ? "Research order" : "Review resolution",
        type: "llm",
        provider: "openai",
        model: "gpt-4.1-mini",
        tools: tools[kind].map((tool) => ({
          ...tool,
          callingMode: "model" as const,
          provenance: "source" as const,
        })),
      },
      ...(kind === "resolution"
        ? [{ id: "approveRefund", label: "Review credit", type: "interrupt" }]
        : []),
    ],
    edges: [
      { sourceNodeId: "__start__", targetNodeId: kind },
      ...(kind === "resolution"
        ? [
            {
              sourceNodeId: kind,
              targetNodeId: "approveRefund",
              condition: "credit needs review",
            },
            {
              sourceNodeId: "approveRefund",
              targetNodeId: kind,
              condition: "review answered",
            },
          ]
        : []),
      { sourceNodeId: kind, targetNodeId: "__end__" },
    ],
    calls: [],
  })),
].map((definition) => {
  const nodes = definition.nodes.map((node) => ({
    ...node,
    toolDiscovery: { status: "complete", publishedAt: sample.recordedAt },
  }));
  const topologyHash = createHash("sha256")
    .update(
      JSON.stringify({
        nodes,
        edges: definition.edges,
        calls: definition.calls,
      }),
    )
    .digest("hex");
  const request = EnsureWorkflowTopologyRequestSchema.parse({
    schemaVersion: 1,
    environment: "sample",
    service: { name: "sample-support" },
    workflow: {
      id: definition.id,
      declaredVersion: "1.0.0",
      topologyHash,
      description: definition.description,
      tags: ["sample", "support"],
      nodes,
      edges: definition.edges,
      calls: definition.calls,
    },
  });
  return { ...request.workflow, revisionId: definition.revisionId };
});
const root = required(definitions[0]);
type ToolObservation = ReturnType<typeof ToolObservationSchema.parse>;
const definitionFor = (kind: "research" | "resolution") =>
  required(
    definitions.find((item) => item.id === sample.specialistWorkflowIds[kind]),
  );

type Span = {
  name: string;
  input?: unknown;
  output?: unknown;
  durationMs?: number;
  error?: { name: string; message: string };
  handled?: boolean;
};
type Call = {
  branchId: string;
  invocationId: string;
  parentInvocationId: string | null;
  callId: string;
  callerNodeId: string;
  callerNodeExecutionId: string;
  sourceWorkflowId: string;
  targetWorkflowId: string;
  targetVersion: string;
  sequence: number;
  input?: unknown;
  output?: unknown;
  leaf?: { workflowId: string; nodeId: string; invocationId: string };
  error?: { name: string; message: string };
};
type Payloads = {
  "span.started": Span;
  "span.ended": Span;
  "span.failed": Span;
  "generation.completed": {
    provider: string;
    model: string;
    durationMs: number;
    usage: { input: number; output: number; total: number };
    input: unknown;
    output: string;
    pricing: { source: "provider"; currency: "USD"; actualCostMicros: number };
  };
  "tool.started": ToolObservation;
  "tool.completed": ToolObservation;
  "tool.failed": ToolObservation;
  "tool.denied": ToolObservation;
  "tool.cancelled": ToolObservation;
  "tool.reused": ToolObservation;
  "workflow.call.started": Call;
  "workflow.call.completed": Call;
  "workflow.call.failed": Call;
  "workflow.call.suspended": Call;
  "workflow.call.resumed": Call;
  "workflow.call.reused": Call;
  "interrupt.created": {
    interruptId: string;
    kind: "choice";
    question: string;
    options: Array<{ id: string; label: string; description?: string }>;
    optionCount: number;
    interactionMode: "static-options";
    schemaId: string;
    schemaVersion: string;
    request: { orderReference: string; amount?: number; currency?: string };
    requestCaptured: boolean;
  };
  "interrupt.resolved": {
    interruptId: string;
    response: string;
    responseValue: string;
    responseCaptured: boolean;
    resumeOutcome: "resumed" | "failed";
    resolvedBy: string;
    resumeError?: string;
  };
  "interrupt.expired": { interruptId: string };
  "interrupt.cancelled": { interruptId: string };
  "workflow.suspended": { interruptId: string; reason: string };
  "workflow.resumed": { interruptId: string };
  "run.cancelled": { reason: string; branchId: string };
  "run.limit_reached": { limit: string; maximum: number; consumed: number };
};

function scenario(
  turn: SampleTurn,
  sessionId: string,
  index: number,
): KortyxTelemetryEvent[] {
  const events: KortyxTelemetryEvent[] = [];
  const offset = -1_500_000 + index * 40_000;
  let clock = 0;
  let sequence = 0;
  const branchId = turn.id;
  const conversation = required(
    SAMPLE_SUPPORT_CONVERSATIONS.find((item) => item.id === sessionId),
  );
  const orderReference =
    turn.input.match(/SAMPLE-\d+/)?.[0] ??
    conversation.turns[0]?.input.match(/SAMPLE-\d+/)?.[0] ??
    "SAMPLE-42";
  const shipment = {
    orderReference,
    found: orderReference !== "SAMPLE-99",
    ...(orderReference === "SAMPLE-99"
      ? { matches: [] }
      : {
          shipmentState:
            orderReference === "SAMPLE-73" ? "At local depot" : "In transit",
          estimatedDelivery:
            orderReference === "SAMPLE-57" ? "Friday" : "Tomorrow",
          estimateConfirmed: false,
        }),
  };
  function emit<K extends keyof Payloads>(
    type: K,
    nodeId: string,
    payload: Payloads[K],
    options: {
      definition?: typeof root;
      invocationId?: string;
      span?: string;
      parent?: string;
      advance?: number;
    } = {},
  ) {
    clock += options.advance ?? 35;
    const definition = options.definition ?? root;
    const invocationId = options.invocationId;
    const scoped: Record<string, unknown> = {
      ...payload,
      ...(invocationId ? { invocationId } : {}),
      branchId,
    };
    if (type === "interrupt.created") {
      scoped.contract = scoped.schemaId;
      scoped.workflowCall = { workflowId: definition.id, nodeId, invocationId };
      scoped.workflowCallPath = [{ workflowId: definition.id, invocationId }];
      if (turn.behavior === "expired")
        scoped.expiresAt = date(offset + clock + 10_000).toISOString();
    }
    if (type.startsWith("tool.")) ToolObservationSchema.strict().parse(scoped);
    events.push(
      TelemetryEventSchema.parse({
        schemaVersion: 1,
        eventId: `${turn.id}-event-${events.length + 1}`,
        occurredAt: date(offset + clock).toISOString(),
        environment: "sample",
        service: {
          name: "sample-support",
          deploymentRef: `sample-prompts-${index < 15 ? 1 : index < 30 ? 2 : 3}`,
        },
        correlation: {
          runId: turn.id,
          sessionId,
          workflowId: definition.id,
          workflowRevisionId: definition.revisionId,
          topologyHash: definition.topologyHash,
          nodeId,
          traceId: `${turn.id}-trace`,
          spanId: `${turn.id}-${options.span ?? "run"}`,
          ...(options.parent
            ? { parentSpanId: `${turn.id}-${options.parent}` }
            : {}),
          invocationId,
          branchId,
        },
        context: {
          userId: `sample-visitor-${String(SAMPLE_SUPPORT_CONVERSATIONS.findIndex((item) => item.id === sessionId) + 1).padStart(2, "0")}`,
          tags: ["sample", turn.behavior],
        },
        type,
        payload: scoped,
      }),
    );
  }
  function generation(
    node: string,
    input: unknown,
    output: string,
    options: Parameters<typeof emit>[3] = {},
  ) {
    const tokensIn = 650 + index * 47 + events.length * 23;
    const tokensOut = 45 + Math.floor(output.length / 3);
    emit(
      "generation.completed",
      node,
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        durationMs: 800 + index * 19,
        usage: {
          input: tokensIn,
          output: tokensOut,
          total: tokensIn + tokensOut,
        },
        input,
        output,
        pricing: {
          source: "provider",
          currency: "USD",
          actualCostMicros: Math.round(tokensIn * 0.4 + tokensOut * 1.6),
        },
      },
      { ...options, advance: 800 + index * 19 },
    );
  }
  emit("span.started", "answer", { name: "kortyx.run", input: turn.input });
  emit(
    "span.started",
    "answer",
    { name: "kortyx.node", input: turn.input },
    { span: "answer-node", parent: "run" },
  );
  emit(
    "span.started",
    "answer",
    { name: "runReasonEngine", input: turn.input },
    { span: "reason", parent: "run" },
  );
  if (turn.behavior === "timeout") {
    const error = { name: "ProviderTimeout", message: turn.output };
    emit(
      "span.failed",
      "answer",
      { name: "runReasonEngine", error },
      { span: "reason", parent: "run", advance: 12_000 },
    );
    emit("span.failed", "answer", { name: "kortyx.run", error });
    return events;
  }
  generation(
    "answer",
    {
      question: turn.input,
      orderReference,
      history: conversation.turns
        .slice(0, conversation.turns.indexOf(turn))
        .map((previous) => ({
          user: previous.input,
          assistant: previous.output || "No terminal response was captured.",
        })),
    },
    "I will check the order evidence and route any resolution review to the appropriate specialist.",
    { span: "reason", parent: "run" },
  );
  emit(
    "span.ended",
    "answer",
    { name: "runReasonEngine", durationMs: clock - 70 },
    { span: "reason", parent: "run" },
  );
  for (const kind of turn.specialists) {
    const definition = definitionFor(kind);
    const invocationId = `${turn.id}-${kind}`;
    const call: Omit<Call, "sequence"> = {
      branchId,
      invocationId,
      parentInvocationId: null,
      callId: `delegate-${kind}`,
      callerNodeId: "answer",
      callerNodeExecutionId: `${turn.id}-answer`,
      sourceWorkflowId: root.id,
      targetWorkflowId: definition.id,
      targetVersion: definition.declaredVersion,
    };
    const child = { definition, invocationId, span: kind, parent: "run" };
    const callEvent = (
      type:
        | "workflow.call.started"
        | "workflow.call.completed"
        | "workflow.call.failed"
        | "workflow.call.suspended"
        | "workflow.call.resumed"
        | "workflow.call.reused",
      extra: Partial<Call> = {},
    ) =>
      emit(
        type,
        "answer",
        { ...call, sequence: ++sequence, ...extra },
        { invocationId },
      );
    callEvent("workflow.call.started", {
      input: { question: turn.input, orderReference },
    });
    emit(
      "span.started",
      kind,
      { name: "kortyx.node", input: turn.input },
      child,
    );
    generation(
      kind,
      {
        question: turn.input,
        instruction:
          kind === "research"
            ? "Read facts; distinguish estimates from confirmations."
            : "Review the exact proposal; create nothing before approval.",
      },
      "I am checking the recorded facts.",
      child,
    );
    const toolName =
      kind === "research"
        ? turn.input.toLowerCase().includes("signature") ||
          turn.input.toLowerCase().includes("note")
          ? "readDeliveryNote"
          : "readParcel"
        : "checkReturnWindow";
    const tool: ToolObservation = {
      version: 1,
      name: toolName,
      toolCallId: `${invocationId}-lookup`,
      attemptId: `${invocationId}-attempt-1`,
      callingMode: "model",
      executed: true,
      workflowId: definition.id,
      nodeId: kind,
      runId: turn.id,
      invocationId,
      branchId,
    };
    const toolScope = { ...child, span: `${kind}-tool`, parent: kind };
    emit(
      "span.started",
      kind,
      { name: `tool:${toolName}`, input: { orderReference } },
      toolScope,
    );
    emit("tool.started", kind, tool, toolScope);
    if (turn.behavior === "running" || turn.behavior === "incomplete")
      return events;
    if (turn.behavior === "cancelled") {
      emit(
        "tool.cancelled",
        kind,
        { ...tool, outcome: "cancelled", durationMs: 250 },
        { ...toolScope, advance: 250 },
      );
      emit(
        "span.ended",
        kind,
        {
          name: `tool:${toolName}`,
          durationMs: 285,
          output: "Cancelled before returning a result.",
        },
        toolScope,
      );
      if (kind === "resolution") {
        const interruptId = `${turn.id}-review`;
        emit(
          "interrupt.created",
          "approveRefund",
          {
            interruptId,
            kind: "choice",
            question: "Keep this order unchanged?",
            options: [{ id: "keep", label: "Keep unchanged" }],
            optionCount: 1,
            interactionMode: "static-options",
            schemaId: "sample.credit-review",
            schemaVersion: "1",
            request: { orderReference: "SAMPLE-86" },
            requestCaptured: true,
          },
          child,
        );
        emit("interrupt.cancelled", "approveRefund", { interruptId }, child);
      }
      emit(
        "run.cancelled",
        kind,
        { reason: "User stopped the request.", branchId },
        child,
      );
      return events;
    }
    if (turn.behavior === "invalid-response" || turn.behavior === "retry") {
      const error = {
        name:
          turn.behavior === "retry"
            ? "CarrierUnavailable"
            : "CarrierResponseInvalid",
        message:
          turn.behavior === "retry"
            ? "The fictional carrier is temporarily unavailable."
            : "The fictional carrier response did not match the shipment schema.",
      };
      emit(
        "tool.failed",
        kind,
        {
          ...tool,
          outcome: "fault",
          durationMs: 900,
          errorType: error.name,
          errorMessage: error.message,
        },
        { ...toolScope, advance: 900 },
      );
      emit(
        "span.failed",
        kind,
        { name: `tool:${toolName}`, error, handled: turn.behavior === "retry" },
        toolScope,
      );
      if (turn.behavior === "invalid-response") {
        callEvent("workflow.call.failed", { error });
        emit("span.failed", "answer", { name: "kortyx.run", error });
        return events;
      }
      const retryTool = { ...tool, attemptId: `${invocationId}-attempt-2` };
      emit(
        "span.started",
        kind,
        { name: `tool:${toolName}`, input: { retry: 1 } },
        { ...toolScope, span: `${kind}-retry` },
      );
      emit("tool.started", kind, retryTool, {
        ...toolScope,
        span: `${kind}-retry`,
      });
      emit(
        "tool.completed",
        kind,
        { ...retryTool, outcome: "success", durationMs: 340 },
        { ...toolScope, span: `${kind}-retry`, advance: 340 },
      );
      emit(
        "span.ended",
        kind,
        {
          name: `tool:${toolName}`,
          durationMs: 375,
          output: {
            shipmentState: "At local depot",
            source: "fresh carrier scan",
          },
        },
        { ...toolScope, span: `${kind}-retry` },
      );
    } else {
      emit(
        "tool.completed",
        kind,
        { ...tool, outcome: "success", durationMs: 180 + index * 7 },
        { ...toolScope, advance: 180 + index * 7 },
      );
      emit(
        "span.ended",
        kind,
        {
          name: `tool:${toolName}`,
          durationMs: 215 + index * 7,
          output:
            kind === "resolution"
              ? {
                  orderReference,
                  creditAvailable: true,
                  amount: 24,
                  currency: "USD",
                  creditCreated: false,
                }
              : toolName === "readDeliveryNote"
                ? {
                    orderReference,
                    signatureRequired: orderReference === "SAMPLE-64",
                    location: "Order > Delivery > Delivery note",
                  }
                : shipment,
        },
        toolScope,
      );
    }
    if (turn.behavior === "pending-choice" && kind === "research") {
      emit(
        "interrupt.created",
        kind,
        {
          interruptId: sample.pendingChoiceId,
          kind: "choice",
          question: turn.output,
          options: [
            {
              id: "parcel-a",
              label: "Parcel",
              description: "Reference not verified",
            },
            {
              id: "parcel-b",
              label: "Parcel",
              description: "Reference not verified",
            },
          ],
          optionCount: 2,
          interactionMode: "static-options",
          schemaId: "sample.parcel-choice",
          schemaVersion: "1",
          request: { orderReference: "SAMPLE-99" },
          requestCaptured: true,
        },
        child,
      );
      callEvent("workflow.call.suspended", {
        leaf: { workflowId: definition.id, nodeId: kind, invocationId },
      });
      emit(
        "workflow.suspended",
        kind,
        { interruptId: sample.pendingChoiceId, reason: "waiting-for-input" },
        child,
      );
      return events;
    }
    if (
      kind === "resolution" &&
      [
        "approved",
        "declined",
        "expired",
        "resume-failed",
        "pending-approval",
      ].includes(turn.behavior)
    ) {
      const interruptId =
        turn.id === sample.runs.approval
          ? sample.interruptId
          : turn.behavior === "pending-approval"
            ? sample.pendingApprovalId
            : `${turn.id}-review`;
      emit(
        "interrupt.created",
        "approveRefund",
        {
          interruptId,
          kind: "choice",
          question:
            turn.behavior === "pending-approval"
              ? turn.output
              : `Approve the $24 credit for ${orderReference}?`,
          options: [
            { id: "approve", label: "Approve credit" },
            { id: "deny", label: "Decline credit" },
          ],
          optionCount: 2,
          interactionMode: "static-options",
          schemaId: "sample.credit-review",
          schemaVersion: "1",
          request: {
            orderReference,
            ...(turn.behavior === "pending-approval"
              ? {}
              : { amount: 24, currency: "USD" }),
          },
          requestCaptured: true,
        },
        child,
      );
      callEvent("workflow.call.suspended", {
        leaf: {
          workflowId: definition.id,
          nodeId: "approveRefund",
          invocationId,
        },
      });
      emit(
        "workflow.suspended",
        "approveRefund",
        { interruptId, reason: "waiting-for-input" },
        child,
      );
      if (turn.behavior === "pending-approval") return events;
      if (turn.behavior === "expired") {
        emit(
          "interrupt.expired",
          "approveRefund",
          { interruptId },
          { ...child, advance: 10_000 },
        );
        return events;
      }
      const failed = turn.behavior === "resume-failed";
      emit(
        "interrupt.resolved",
        "approveRefund",
        {
          interruptId,
          response:
            turn.behavior === "declined" ? "Decline credit" : "Approve credit",
          responseValue: turn.behavior === "declined" ? "deny" : "approve",
          responseCaptured: true,
          resumeOutcome: failed ? "failed" : "resumed",
          resolvedBy: "Sample reviewer",
          ...(failed ? { resumeError: turn.output } : {}),
        },
        { ...child, advance: 7_000 },
      );
      emit("workflow.resumed", "approveRefund", { interruptId }, child);
      if (turn.specialists.includes("research")) {
        emit(
          "workflow.call.reused",
          "answer",
          {
            ...call,
            invocationId: `${turn.id}-research`,
            callId: "delegate-research",
            targetWorkflowId: sample.specialistWorkflowIds.research,
            sequence: ++sequence,
            output: { orderReference, verified: true },
          },
          { invocationId: `${turn.id}-research` },
        );
      }
      callEvent("workflow.call.resumed");
      emit(
        "tool.reused",
        kind,
        {
          ...tool,
          executed: false,
          observationKind: "reused",
          outcome: "success",
          source: { toolCallId: tool.toolCallId, attemptId: tool.attemptId },
        },
        child,
      );
      if (failed) {
        emit(
          "run.limit_reached",
          kind,
          { limit: "toolCalls", maximum: 1, consumed: 1 },
          child,
        );
        const error = { name: "ExecutionLimitReached", message: turn.output };
        callEvent("workflow.call.failed", { error });
        emit("span.failed", "answer", { name: "kortyx.run", error });
        return events;
      }
      if (turn.behavior === "approved") {
        const credit = {
          ...tool,
          name: "prepareCredit",
          toolCallId: `${invocationId}-credit`,
          attemptId: `${invocationId}-credit-attempt`,
        };
        emit(
          "span.started",
          kind,
          {
            name: "tool:prepareCredit",
            input: {
              orderReference: "SAMPLE-81",
              amount: 24,
              reviewId: interruptId,
            },
          },
          { ...toolScope, span: "credit" },
        );
        emit("tool.started", kind, credit, { ...toolScope, span: "credit" });
        emit(
          "tool.completed",
          kind,
          { ...credit, outcome: "success", durationMs: 290 },
          { ...toolScope, span: "credit", advance: 290 },
        );
        emit(
          "span.ended",
          kind,
          {
            name: "tool:prepareCredit",
            durationMs: 325,
            output: {
              creditReference: "SAMPLE-CREDIT-24",
              amount: 24,
              currency: "USD",
            },
          },
          { ...toolScope, span: "credit" },
        );
      }
    }
    if (turn.behavior === "denied" && kind === "resolution") {
      emit(
        "tool.denied",
        kind,
        {
          ...tool,
          name: "prepareCredit",
          toolCallId: `${invocationId}-duplicate`,
          attemptId: `${invocationId}-duplicate-attempt`,
          executed: false,
          outcome: "denied",
          denialCode: "DUPLICATE_REVIEW",
        },
        child,
      );
    }
    if (turn.behavior === "limit" && kind === "resolution") {
      emit(
        "run.limit_reached",
        kind,
        { limit: "toolCalls", maximum: 2, consumed: 2 },
        child,
      );
      const error = { name: "ExecutionLimitReached", message: turn.output };
      callEvent("workflow.call.failed", { error });
      emit("span.failed", "answer", { name: "kortyx.run", error });
      return events;
    }
    const specialistOutput =
      kind === "research" && turn.specialists.includes("resolution")
        ? `Order ${orderReference} was verified. A $24 credit can be reviewed; no credit has been created.`
        : turn.output;
    generation(
      kind,
      "Summarize the verified tool evidence for the coordinator.",
      specialistOutput,
      child,
    );
    emit(
      "span.ended",
      kind,
      { name: "kortyx.node", output: specialistOutput, durationMs: clock },
      child,
    );
    callEvent("workflow.call.completed", {
      output: { summary: specialistOutput, orderReference },
    });
  }
  emit(
    "span.started",
    "answer",
    {
      name: "runReasonEngine",
      input:
        "Compose a concise answer from the specialist's verified evidence.",
    },
    { span: "compose", parent: "run" },
  );
  generation(
    "answer",
    "Use the verified specialist results; preserve uncertainty and review outcomes.",
    turn.output,
    { span: "compose", parent: "run" },
  );
  emit(
    "span.ended",
    "answer",
    {
      name: "runReasonEngine",
      durationMs: 800 + index * 19,
      output: turn.output,
    },
    { span: "compose", parent: "run" },
  );
  emit(
    "span.ended",
    "answer",
    { name: "kortyx.node", output: turn.output, durationMs: clock },
    { span: "answer-node", parent: "run" },
  );
  emit("span.ended", "answer", {
    name: "kortyx.run",
    durationMs: clock,
    output: turn.output,
  });
  return events;
}

export function createSampleExecutionRecords(): {
  events: TelemetryEventRecord[];
  revisions: WorkflowRevision[];
} {
  let index = 0;
  const canonical = SAMPLE_SUPPORT_CONVERSATIONS.flatMap((session) =>
    session.turns.flatMap((turn) => scenario(turn, session.id, index++)),
  );
  if (
    new Set(canonical.map((event) => event.eventId)).size !== canonical.length
  )
    throw new Error("Duplicate sample event identity.");
  return {
    events: canonical.map(
      (event, eventIndex): TelemetryEventRecord => ({
        ...scope,
        id: `20000000-0000-4000-8000-${String(eventIndex).padStart(12, "0")}`,
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
        workflowRevisionId: event.correlation.workflowRevisionId ?? null,
        topologyHash: event.correlation.topologyHash ?? null,
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
    ),
    revisions: definitions.map((definition) => ({
      ...scope,
      id: definition.revisionId,
      environment: "sample",
      workflowId: definition.id,
      declaredVersion: definition.declaredVersion,
      topologyHash: definition.topologyHash,
      serviceName: "sample-support",
      deploymentRef: "sample-prompts-3",
      description: definition.description ?? null,
      tags: definition.tags ?? [],
      nodes: definition.nodes,
      edges: definition.edges,
      workflowTransitions: (definition.calls ?? []).map((call) => ({
        ...call,
        kind: "call" as const,
      })),
      createdAt: date(-1_600_000),
    })),
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Incomplete sample fixture relationship.");
  return value;
}
