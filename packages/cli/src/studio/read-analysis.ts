import {
  projectWorkflowCalls,
  type StudioDetailEvent,
  type StudioInterrupt,
  type StudioRun,
  type StudioWorkflow,
} from "@kortyx/telemetry-contracts";
import { StudioReadError } from "./read-client";
import type { StudioTarget } from "./read-output";

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;
const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
const recordValue = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export type StudioTimelineItem = {
  step: number;
  eventId: string;
  at: string;
  kind: "model" | "tool" | "interrupt" | "resume" | "limit";
  nodeId: string | null;
  workflowId: string;
  durationMs?: number | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  finishReason?: unknown;
  toolName?: string | undefined;
  toolOutcome?: string | undefined;
  toolCallId?: string | undefined;
  input?: unknown;
  output?: unknown;
  interruptId?: string | undefined;
  interruptType?: string | undefined;
  interactionMode?: string | undefined;
  resumeOutcome?: string | undefined;
  limit?: string | undefined;
  consumed?: unknown;
  maximum?: unknown;
  question?: unknown;
};

const toolTerminalTypes = new Set([
  "tool.completed",
  "tool.failed",
  "tool.denied",
  "tool.cancelled",
  "tool.reused",
]);

/** A compact, non-duplicative execution story derived only from persisted facts. */
export const buildStudioTimeline = (
  events: StudioDetailEvent[],
  interrupts: StudioInterrupt[] = [],
): StudioTimelineItem[] => {
  const interruptById = new Map(interrupts.map((item) => [item.id, item]));
  const items: Omit<StudioTimelineItem, "step">[] = [];
  const ordered = [...events].sort(
    (left, right) =>
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
      Date.parse(left.receivedAt) - Date.parse(right.receivedAt) ||
      left.id.localeCompare(right.id),
  );
  for (const event of ordered) {
    const payload = event.payload;
    const base = {
      eventId: event.id,
      at: event.occurredAt,
      nodeId: event.nodeId,
      workflowId: event.workflowId,
    };
    if (event.type === "generation.completed") {
      items.push({
        ...base,
        kind: "model",
        ...(numberValue(payload.durationMs) !== undefined
          ? { durationMs: numberValue(payload.durationMs) }
          : {}),
        ...(stringValue(payload.provider)
          ? { provider: stringValue(payload.provider) }
          : {}),
        ...(stringValue(payload.model)
          ? { model: stringValue(payload.model) }
          : {}),
        ...(payload.finishReason !== undefined
          ? { finishReason: payload.finishReason }
          : {}),
      });
      continue;
    }
    if (toolTerminalTypes.has(event.type)) {
      const fallbackOutcome = event.type.slice("tool.".length);
      items.push({
        ...base,
        kind: "tool",
        ...(numberValue(payload.durationMs) !== undefined
          ? { durationMs: numberValue(payload.durationMs) }
          : {}),
        ...(stringValue(payload.name) || stringValue(payload.tool)
          ? { toolName: stringValue(payload.name) ?? stringValue(payload.tool) }
          : {}),
        toolOutcome:
          stringValue(payload.outcome) ??
          (fallbackOutcome === "completed" ? "success" : fallbackOutcome),
        ...(stringValue(payload.toolCallId)
          ? { toolCallId: stringValue(payload.toolCallId) }
          : {}),
        ...(payload.input !== undefined ? { input: payload.input } : {}),
        ...(payload.output !== undefined ? { output: payload.output } : {}),
      });
      continue;
    }
    if (event.type === "interrupt.created") {
      const id = stringValue(payload.interruptId);
      const interrupt = id ? interruptById.get(id) : undefined;
      items.push({
        ...base,
        kind: "interrupt",
        ...(id ? { interruptId: id } : {}),
        ...(interrupt?.type || stringValue(payload.kind)
          ? { interruptType: interrupt?.type ?? stringValue(payload.kind) }
          : {}),
        ...(interrupt?.interactionMode || stringValue(payload.interactionMode)
          ? {
              interactionMode:
                interrupt?.interactionMode ??
                stringValue(payload.interactionMode),
            }
          : {}),
        ...(interrupt?.question !== undefined && interrupt.question !== null
          ? { question: interrupt.question }
          : payload.question !== undefined
            ? { question: payload.question }
            : {}),
      });
      continue;
    }
    if (event.type === "interrupt.resolved") {
      items.push({
        ...base,
        kind: "resume",
        ...(stringValue(payload.interruptId)
          ? { interruptId: stringValue(payload.interruptId) }
          : {}),
        ...(stringValue(payload.resumeOutcome)
          ? { resumeOutcome: stringValue(payload.resumeOutcome) }
          : {}),
      });
      continue;
    }
    if (event.type === "run.limit_reached") {
      items.push({
        ...base,
        kind: "limit",
        ...(stringValue(payload.limit)
          ? { limit: stringValue(payload.limit) }
          : {}),
        ...(payload.consumed !== undefined
          ? { consumed: payload.consumed }
          : {}),
        ...(payload.maximum !== undefined ? { maximum: payload.maximum } : {}),
      });
    }
  }
  return items.map((item, index) => ({ step: index + 1, ...item }));
};

const selectedValue = (
  event: StudioDetailEvent,
  key: "branch" | "call",
): string[] => {
  const payload = event.payload;
  if (key === "branch")
    return [stringValue(payload.branchId)].filter((value): value is string =>
      Boolean(value),
    );
  return [
    stringValue(payload.callId),
    stringValue(payload.invocationId),
  ].filter((value): value is string => Boolean(value));
};

/** Applies only selectors with execution semantics; UI layout selectors stay contextual. */
export const focusStudioEvents = (
  events: StudioDetailEvent[],
  target: StudioTarget,
): { events: StudioDetailEvent[]; applied: Record<string, string> } => {
  const selection = target.selection ?? {};
  const applied = Object.fromEntries(
    ["event", "trace", "node", "branch", "call"]
      .filter((key) => Boolean(selection[key]))
      .map((key) => [key, selection[key] as string]),
  );
  if (Object.keys(applied).length === 0)
    throw new StudioReadError(
      "selection_not_focusable",
      "The URL has no event, trace, node, branch, or call selector to focus.",
    );
  const callEventIds = new Set(
    selection.call
      ? projectWorkflowCalls(events)
          .filter(
            (call) =>
              call.id === selection.call ||
              call.callId === selection.call ||
              call.invocationId === selection.call,
          )
          .flatMap((call) => call.events.map((event) => event.id))
      : [],
  );
  const focused = events.filter((event) =>
    Object.entries(applied).every(([key, value]) => {
      if (key === "event") return event.id === value;
      if (key === "trace") return event.traceId === value;
      if (key === "node") return event.nodeId === value;
      if (key === "branch")
        return selectedValue(event, "branch").includes(value);
      return (
        callEventIds.has(event.id) ||
        selectedValue(event, "call").includes(value)
      );
    }),
  );
  if (focused.length === 0)
    throw new StudioReadError(
      "selection_not_found",
      "The pasted URL selector did not match any returned Studio events.",
    );
  return { events: focused, applied };
};

export type StudioDiagnosticFinding = {
  code: string;
  severity: "error" | "warning" | "context";
  message: string;
  eventIds: string[];
  evidence?: unknown;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  return value;
};

export const analyzeStudioDiagnostics = (
  events: StudioDetailEvent[],
  run?: StudioRun | null,
  interrupts: StudioInterrupt[] = [],
): StudioDiagnosticFinding[] => {
  const findings: StudioDiagnosticFinding[] = [];
  const terminalTools = events.filter((event) =>
    toolTerminalTypes.has(event.type),
  );
  for (let index = 1; index < terminalTools.length; index++) {
    const previous = terminalTools[index - 1];
    const current = terminalTools[index];
    if (!previous || !current) continue;
    const previousName =
      stringValue(previous.payload.name) ?? stringValue(previous.payload.tool);
    const currentName =
      stringValue(current.payload.name) ?? stringValue(current.payload.tool);
    if (
      previousName &&
      previousName === currentName &&
      previous.payload.input !== undefined &&
      current.payload.input !== undefined &&
      JSON.stringify(stableValue(previous.payload.input)) ===
        JSON.stringify(stableValue(current.payload.input))
    ) {
      findings.push({
        code: "repeated_tool_input",
        severity: "warning",
        message: `Tool ${currentName} was called consecutively with the same captured input.`,
        eventIds: [previous.id, current.id],
        evidence: { toolName: currentName, input: current.payload.input },
      });
    }
  }

  let lastInterrupt: StudioDetailEvent | undefined;
  for (const event of events) {
    if (toolTerminalTypes.has(event.type)) lastInterrupt = undefined;
    if (event.type !== "interrupt.created") continue;
    if (lastInterrupt)
      findings.push({
        code: "consecutive_human_interrupts",
        severity: "warning",
        message:
          "Human input was requested again without an intervening terminal tool event.",
        eventIds: [lastInterrupt.id, event.id],
      });
    lastInterrupt = event;
  }

  for (const event of events.filter(
    (item) => item.type === "run.limit_reached",
  ))
    findings.push({
      code: "tool_step_limit_reached",
      severity: "warning",
      message: "The runtime reported that an execution limit was reached.",
      eventIds: [event.id],
      evidence: event.payload,
    });

  const schemaFailures = events.filter((event) => {
    if (event.type !== "span.failed") return false;
    const error = recordValue(event.payload.error);
    const failure = recordValue(event.payload.failure);
    const haystack = [
      error.code,
      error.message,
      failure.code,
      failure.message,
      event.payload.code,
      event.payload.message,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    return /MODEL_OUTPUT_SCHEMA|INVALID_OUTPUT|output (?:schema|validation)|schema validation/i.test(
      haystack,
    );
  });
  for (const failure of schemaFailures) {
    const laterGeneration = events.find(
      (event) =>
        event.type === "generation.completed" &&
        Date.parse(event.occurredAt) > Date.parse(failure.occurredAt),
    );
    findings.push({
      code: laterGeneration ? "output_schema_retry" : "output_schema_failure",
      severity: laterGeneration ? "warning" : "error",
      message: laterGeneration
        ? "An output-schema failure was followed by another model generation."
        : "The runtime reported an output-schema validation failure.",
      eventIds: [failure.id, ...(laterGeneration ? [laterGeneration.id] : [])],
      evidence: failure.payload,
    });
  }

  const pending = interrupts.filter((item) => item.status === "pending");
  if (run?.status === "interrupted" && pending.length > 0)
    findings.push({
      code: "unresolved_interrupt",
      severity: "warning",
      message: "The workflow is suspended with unresolved human input.",
      eventIds: events
        .filter(
          (event) =>
            event.type === "interrupt.created" &&
            pending.some((item) => item.id === event.payload.interruptId),
        )
        .map((event) => event.id),
      evidence: { interruptIds: pending.map((item) => item.id) },
    });
  return findings;
};

export type CatalogDrift = {
  status: "current" | "drift" | "not-published" | "unavailable";
  workflows: Array<{
    workflowId: string;
    executedRevisionId: string | null;
    executedVersion: string | null;
    activeRevisionId: string | null;
    activeVersion: string | null;
    drift: boolean;
  }>;
  reason?: string;
};

export const compareCatalogRuntime = (
  run: StudioRun,
  workflows: StudioWorkflow[],
): CatalogDrift => {
  const rootReferences = run.workflowRefs.filter(
    (reference) => reference.workflowId === run.workflowId,
  );
  const rows = rootReferences.length
    ? rootReferences
    : [
        {
          workflowId: run.workflowId,
          workflowRevisionId: run.workflowRevisionId,
          declaredVersion: run.declaredVersion,
        },
      ];
  const compared = rows.map((reference) => {
    const workflow = workflows.find((item) => item.id === reference.workflowId);
    return {
      workflowId: reference.workflowId,
      executedRevisionId: reference.workflowRevisionId,
      executedVersion: reference.declaredVersion,
      activeRevisionId: workflow?.activeRevisionId ?? null,
      activeVersion: workflow?.activeVersion ?? null,
      drift: Boolean(
        (workflow?.activeRevisionId &&
          reference.workflowRevisionId &&
          workflow.activeRevisionId !== reference.workflowRevisionId) ||
          (!reference.workflowRevisionId &&
            workflow?.activeVersion &&
            reference.declaredVersion &&
            workflow.activeVersion !== reference.declaredVersion),
      ),
    };
  });
  const published = compared.some((item) => item.activeRevisionId);
  return {
    status: !published
      ? "not-published"
      : compared.some((item) => item.drift)
        ? "drift"
        : "current",
    workflows: compared,
  };
};

export const compareRunAnalysis = (
  left: {
    run: StudioRun;
    timeline: StudioTimelineItem[];
    catalog: CatalogDrift;
    deploymentRefs?: string[];
  },
  right: {
    run: StudioRun;
    timeline: StudioTimelineItem[];
    catalog: CatalogDrift;
    deploymentRefs?: string[];
  },
) => {
  const metadataFields = [
    "workflowId",
    "workflowRevisionId",
    "declaredVersion",
    "environment",
    "provider",
    "model",
    "status",
    "result",
  ] as const;
  const metadata: Array<{ field: string; left: unknown; right: unknown }> =
    metadataFields.flatMap((field) =>
      JSON.stringify(left.run[field]) === JSON.stringify(right.run[field])
        ? []
        : [{ field, left: left.run[field], right: right.run[field] }],
    );
  if (
    JSON.stringify(left.deploymentRefs ?? []) !==
    JSON.stringify(right.deploymentRefs ?? [])
  )
    metadata.push({
      field: "deploymentRefs",
      left: left.deploymentRefs ?? [],
      right: right.deploymentRefs ?? [],
    });
  const signature = (item: StudioTimelineItem) =>
    `${item.kind}:${item.toolName ?? item.interruptType ?? item.limit ?? ""}`;
  const length = Math.max(left.timeline.length, right.timeline.length);
  const comparable = (item: StudioTimelineItem) => {
    const { step: _step, eventId: _eventId, at: _at, ...rest } = item;
    return rest;
  };
  const timeline = Array.from({ length }, (_, index) => {
    const leftItem = left.timeline[index] ?? null;
    const rightItem = right.timeline[index] ?? null;
    return {
      index: index + 1,
      status:
        leftItem && rightItem
          ? JSON.stringify(comparable(leftItem)) ===
            JSON.stringify(comparable(rightItem))
            ? "same"
            : signature(leftItem) === signature(rightItem)
              ? "changed"
              : "diverged"
          : leftItem
            ? "removed"
            : "added",
      left: leftItem,
      right: rightItem,
    };
  });
  return {
    metadata,
    timeline,
    firstDivergence:
      timeline.find((item) => item.status !== "same")?.index ?? null,
    different:
      metadata.length > 0 || timeline.some((item) => item.status !== "same"),
  };
};
