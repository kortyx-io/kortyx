import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import { formatCount, formatDurationMs } from "@/lib/format";

export function buildEventStory(
  events: StudioDetailEvent[],
  startedAt: string,
): EventStoryItem[] {
  const ordered = [...events].sort(
    (first, second) =>
      Date.parse(first.occurredAt) - Date.parse(second.occurredAt) ||
      eventOrder(first) - eventOrder(second),
  );
  const runStartMs = Date.parse(startedAt);
  const executions = ordered.filter(
    (event) =>
      event.type === "span.started" && event.payload.name === "kortyx.run",
  );
  const parentBySpan = new Map<string, string | null>();
  for (const event of ordered) {
    if (event.spanId && !parentBySpan.has(event.spanId)) {
      parentBySpan.set(event.spanId, event.parentSpanId);
    }
  }
  const depthBySpan = new Map<string, number>();

  const spanDepth = (
    spanId: string | null,
    seen = new Set<string>(),
  ): number => {
    if (!spanId || seen.has(spanId)) return 0;
    const cached = depthBySpan.get(spanId);
    if (cached !== undefined) return cached;
    seen.add(spanId);
    const depth = Math.min(
      5,
      spanDepth(parentBySpan.get(spanId) ?? null, seen) + 1,
    );
    depthBySpan.set(spanId, depth);
    return depth;
  };

  return ordered.map((event, index) => {
    const timeMs = Date.parse(event.occurredAt);
    let phase: number | null = null;
    for (const [phaseIndex, execution] of executions.entries()) {
      if (Date.parse(execution.occurredAt) <= timeMs) phase = phaseIndex + 1;
      else break;
    }
    const category = eventCategory(event);
    const state = eventState(event);
    const context = eventContext(event);
    return {
      event,
      index,
      phase,
      depth: Math.max(0, spanDepth(event.spanId) - 1),
      offsetMs: Math.max(0, timeMs - runStartMs),
      durationMs: numberValue(event.payload.durationMs),
      category,
      categoryLabel: CATEGORY_LABELS[category],
      state,
      stateLabel: STATE_LABELS[state],
      title: eventTitle(event, phase),
      description: context,
    };
  });
}

function eventTitle(event: StudioDetailEvent, phase: number | null): string {
  const name = asString(event.payload.name);
  const attributes = asRecord(event.payload.attributes);
  const model =
    asString(event.payload.model) ?? asString(attributes.modelId) ?? "Model";
  const tool = asString(event.payload.tool) ?? "Tool";

  if (event.type === "generation.completed")
    return `${model} response completed`;
  if (event.type === "tool.started") return `${tool} tool started`;
  if (event.type === "tool.completed") return `${tool} tool completed`;
  if (event.type === "tool.failed") return `${tool} tool failed`;
  if (event.type === "interrupt.created") return "Human input requested";
  if (event.type === "interrupt.resolved") return "Human input received";
  if (event.type === "interrupt.expired") return "Human input request expired";
  if (event.type === "interrupt.cancelled")
    return "Human input request cancelled";
  if (event.type === "session.checkpointed") return "Session checkpoint saved";
  if (event.type === "session.forked") return "Session forked";
  if (event.type === "session.rolled_back") return "Session rolled back";
  if (event.type === "run.cancelled") return "Run cancelled";
  if (event.type === "workflow.transitioned") {
    const source =
      asString(event.payload.sourceWorkflowId) ??
      asString(event.payload.from) ??
      event.workflowId;
    const target =
      asString(event.payload.targetWorkflowId) ??
      asString(event.payload.to) ??
      "next workflow";
    return `${source} → ${target}`;
  }

  const subject = spanSubject(event, name, model);
  if (event.type === "span.started") {
    if (name === "kortyx.run")
      return phase === 1 ? "Run execution started" : "Run execution resumed";
    return `${subject} started`;
  }
  if (event.type === "span.ended") return `${subject} completed`;
  if (event.type === "span.failed")
    return isControlFlowInterrupt(event)
      ? `${subject} paused`
      : `${subject} failed`;
  return humanize(event.type);
}

function spanSubject(
  event: StudioDetailEvent,
  name: string | undefined,
  model: string,
) {
  if (name === "kortyx.run") return event.workflowId;
  if (name === "kortyx.node") return event.nodeId ?? "Workflow node";
  if (name === "runReasonEngine") return `${model} provider call`;
  if (name === "useReason") return "Reasoning hook";
  return name ? humanize(name) : (event.nodeId ?? "Span");
}

function eventContext(event: StudioDetailEvent): string {
  const attributes = asRecord(event.payload.attributes);
  const parts: string[] = [];
  if (event.nodeId) parts.push(event.nodeId);
  if (!event.nodeId || event.workflowId !== event.nodeId)
    parts.push(event.workflowId);

  if (event.type === "generation.completed") {
    const provider = asString(event.payload.provider);
    if (provider) parts.push(provider);
    const usage = asRecord(event.payload.usage);
    const tokens = numberValue(usage.total);
    if (tokens !== null)
      parts.push(`${formatCount(tokens, { compact: false })} tokens`);
    const ttft = numberValue(event.payload.ttftMs);
    if (ttft !== null) parts.push(`TTFT ${formatDurationMs(ttft)}`);
  }
  if (event.type.startsWith("tool.")) {
    const callId = asString(event.payload.toolCallId);
    if (callId) parts.push(`call ${shortId(callId)}`);
  }
  if (event.payload.name === "runReasonEngine") {
    const provider = asString(attributes.providerId);
    const model = asString(attributes.modelId);
    if (provider) parts.push(provider);
    if (model) parts.push(model);
  }
  return parts
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(" · ");
}

function eventCategory(event: StudioDetailEvent): EventCategory {
  if (event.type === "generation.completed") return "model";
  if (event.type.startsWith("tool.")) return "tool";
  if (event.type.startsWith("interrupt.")) return "interrupt";
  if (event.type.startsWith("session.")) return "session";
  if (event.type === "workflow.transitioned") return "workflow";
  if (event.type === "run.cancelled" || event.payload.name === "kortyx.run")
    return "run";
  if (event.payload.name === "kortyx.node") return "node";
  if (event.payload.name === "runReasonEngine") return "model";
  return "span";
}

function eventState(event: StudioDetailEvent): EventState {
  const { type } = event;
  if (type === "span.failed" && isControlFlowInterrupt(event))
    return "interrupted";
  if (type.endsWith(".started") || type === "interrupt.created")
    return "started";
  if (type.endsWith(".failed")) return "failed";
  if (type.endsWith(".resolved")) return "resolved";
  if (type.endsWith(".expired")) return "expired";
  if (type.endsWith(".cancelled")) return "cancelled";
  if (type.endsWith(".ended") || type.endsWith(".completed"))
    return "completed";
  return "recorded";
}

function humanize(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isControlFlowInterrupt(event: StudioDetailEvent): boolean {
  const error = event.payload.error;
  return (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "GraphInterrupt"
  );
}

function eventOrder(event: StudioDetailEvent): number {
  if (event.type === "interrupt.resolved") return 0;
  if (event.type.endsWith(".started") || event.type === "interrupt.created")
    return 1;
  if (event.type === "generation.completed") return 2;
  if (event.type.endsWith(".ended") || event.type.endsWith(".completed"))
    return 3;
  if (event.type.endsWith(".failed")) return 4;
  return 5;
}

export type EventCategory =
  | "run"
  | "node"
  | "model"
  | "tool"
  | "interrupt"
  | "session"
  | "workflow"
  | "span";

export type EventState =
  | "started"
  | "completed"
  | "failed"
  | "interrupted"
  | "resolved"
  | "expired"
  | "cancelled"
  | "recorded";

export type EventStoryItem = {
  event: StudioDetailEvent;
  index: number;
  phase: number | null;
  depth: number;
  offsetMs: number;
  durationMs: number | null;
  category: EventCategory;
  categoryLabel: string;
  state: EventState;
  stateLabel: string;
  title: string;
  description: string;
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  run: "Run",
  node: "Node",
  model: "Model",
  tool: "Tool",
  interrupt: "Interrupt",
  session: "Session",
  workflow: "Workflow",
  span: "Operation",
};

const STATE_LABELS: Record<EventState, string> = {
  started: "Started",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
  resolved: "Resolved",
  expired: "Expired",
  cancelled: "Cancelled",
  recorded: "Recorded",
};
