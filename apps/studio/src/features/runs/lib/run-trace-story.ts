import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import { formatDurationMs } from "@/lib/format";
import { isControlFlowCancellation } from "./run-event-story";

export type TraceStatus =
  | "denied"
  | "replayed"
  | "fault"
  | "completed"
  | "failed"
  | "interrupted"
  | "running"
  | "incomplete"
  | "resolved"
  | "waiting"
  | "expired"
  | "cancelled"
  | "event";

export type TraceKind =
  | "execution"
  | "node"
  | "generation"
  | "span"
  | "tool"
  | "transition"
  | "interrupt"
  | "checkpoint"
  | "wait"
  | "event";

export type TraceItem = {
  id: string;
  label: string;
  description: string;
  kind: TraceKind;
  status: TraceStatus;
  startedAt: string;
  durationMs: number | null;
  depth: number;
  phase: number | null;
  executionRole?: "initial" | "resumed" | "continued";
  timing?: GenerationTiming;
  modelCalls: number;
  event: StudioDetailEvent;
  inspectEvent: StudioDetailEvent;
  endEvent?: StudioDetailEvent;
};

export type GenerationTiming = {
  streaming: boolean;
  ttftMs: number | null;
  streamDurationMs: number | null;
  postStreamDurationMs: number | null;
};

export type TimelineGap = {
  startMs: number;
  endMs: number;
  actualDurationMs: number;
  displayDurationMs: number;
};

export type TimelineScale = {
  startMs: number;
  endMs: number;
  wallDurationMs: number;
  visibleDurationMs: number;
  gaps: TimelineGap[];
  toPercent: (timeMs: number) => number;
};

export function buildTraceStory(
  events: StudioDetailEvent[],
  runFinished = false,
): TraceItem[] {
  const ordered = [...events].sort(
    (first, second) =>
      Date.parse(first.occurredAt) - Date.parse(second.occurredAt),
  );
  const terminals = terminalEvents(ordered);
  const generationsBySpan = new Map(
    ordered
      .filter((event) => event.type === "generation.completed" && event.spanId)
      .map((event) => [event.spanId as string, event]),
  );
  const actualStarts = ordered.filter(
    (event) => event.type === "span.started" || event.type === "tool.started",
  );
  const observedKeys = new Set(
    actualStarts
      .filter((event) => event.type === "tool.started")
      .map(lifecycleKey),
  );
  const starts = [
    ...actualStarts,
    ...ordered.filter(
      (event) =>
        event.type.startsWith("tool.") &&
        event.type !== "tool.started" &&
        !observedKeys.has(lifecycleKey(event)) &&
        terminals.get(lifecycleKey(event))?.id === event.id,
    ),
  ];
  const executions = starts.filter(
    (event) => event.payload.name === "kortyx.run",
  );
  const phaseNumberAt = (occurredAt: string): number | null => {
    const time = Date.parse(occurredAt);
    let result: number | null = null;
    for (const [index, execution] of executions.entries()) {
      if (Date.parse(execution.occurredAt) <= time) result = index + 1;
      else break;
    }
    return result;
  };
  const laterExecutionExists = (event: StudioDetailEvent) =>
    executions.some(
      (execution) =>
        Date.parse(execution.occurredAt) > Date.parse(event.occurredAt),
    );
  const previousNodeByPhase = new Map<number, string>();
  const items: TraceItem[] = [];

  for (const event of starts) {
    const name =
      asString(event.payload.name) ??
      (event.type.startsWith("tool.")
        ? asString(event.payload.tool)
        : undefined) ??
      event.nodeId ??
      "span";
    const isExecution = name === "kortyx.run";
    const isNode = name === "kortyx.node";
    const isGeneration = name === "runReasonEngine";
    const isTool = event.type.startsWith("tool.");
    const terminal = terminals.get(lifecycleKey(event));
    const isReasonFailure =
      name === "useReason" &&
      terminal?.type === "span.failed" &&
      asRecord(terminal.payload.error).controlFlow !== true &&
      !isControlFlowInterrupt(terminal) &&
      !isControlFlowCancellation(terminal) &&
      !ordered.some(
        (candidate) =>
          candidate.type === "span.failed" &&
          candidate.parentSpanId === event.spanId &&
          candidate.payload.name === "runReasonEngine",
      );
    if (
      !isExecution &&
      !isNode &&
      !isGeneration &&
      !isTool &&
      !isReasonFailure &&
      INTERNAL_SPANS.has(name)
    )
      continue;

    const durationMs =
      isTool && event.payload.executed === false
        ? null
        : eventDuration(event, terminal);
    const phase = phaseNumberAt(event.occurredAt);
    const baseStatus = spanStatus(
      terminal,
      laterExecutionExists(event) || runFinished,
    );

    if (isExecution) {
      const phaseNumber = executions.indexOf(event) + 1;
      const interruptInExecution = findInterruptInsideSpan(
        ordered,
        event,
        terminal,
      );
      const resolutionBefore = [...ordered]
        .reverse()
        .find(
          (candidate) =>
            candidate.type === "interrupt.resolved" &&
            Date.parse(candidate.occurredAt) <= Date.parse(event.occurredAt) &&
            Date.parse(event.occurredAt) - Date.parse(candidate.occurredAt) <
              2_000,
        );
      const executionRole =
        phaseNumber === 1
          ? "initial"
          : resolutionBefore
            ? "resumed"
            : "continued";
      items.push({
        id: event.id,
        label:
          executionRole === "initial"
            ? "Run started"
            : executionRole === "resumed"
              ? "Run resumed"
              : "Execution continued",
        description: interruptInExecution
          ? `Paused for human input at ${interruptInExecution.nodeId ?? "an unknown node"}`
          : resolutionBefore
            ? `Continued after human input at ${resolutionBefore.nodeId ?? "the interrupted node"}`
            : phaseNumber === 1
              ? "Initial execution"
              : "Additional execution phase",
        kind: "execution",
        status:
          baseStatus === "cancelled"
            ? "cancelled"
            : interruptInExecution
              ? "interrupted"
              : baseStatus,
        startedAt: event.occurredAt,
        durationMs,
        depth: 0,
        phase: phaseNumber,
        executionRole,
        modelCalls: 0,
        event,
        inspectEvent:
          terminal?.type.endsWith("failed") && terminal ? terminal : event,
      });
      continue;
    }

    if (isGeneration) {
      const generation = event.spanId
        ? generationsBySpan.get(event.spanId)
        : undefined;
      const attributes = asRecord(event.payload.attributes);
      const provider =
        asString(generation?.payload.provider) ??
        asString(attributes.providerId) ??
        "unknown provider";
      const model =
        asString(generation?.payload.model) ??
        asString(attributes.modelId) ??
        "unknown model";
      const totalDurationMs =
        numberValue(generation?.payload.durationMs) ?? durationMs;
      const timing = generationTiming(generation, attributes);
      items.push({
        id: event.id,
        label: model,
        description: generationDescription(
          provider,
          totalDurationMs,
          timing,
          baseStatus,
          generation,
        ),
        kind: "generation",
        status: baseStatus,
        startedAt: event.occurredAt,
        durationMs: totalDurationMs,
        depth: 2,
        phase,
        timing,
        modelCalls: 0,
        event: generation ?? event,
        inspectEvent:
          terminal?.type === "span.failed"
            ? terminal
            : (generation ?? terminal ?? event),
      });
      continue;
    }

    const nodeName = event.nodeId ?? name;
    if (isNode) {
      const phaseNumber = phase ?? 1;
      const previousNode = previousNodeByPhase.get(phaseNumber);
      previousNodeByPhase.set(phaseNumber, nodeName);
      const modelCalls = countModelCalls(ordered, event, terminal);
      items.push({
        id: event.id,
        label: nodeName,
        description:
          baseStatus === "interrupted"
            ? `Paused here${modelCalls ? ` after ${modelCalls} model call${modelCalls === 1 ? "" : "s"}` : ""}`
            : previousNode
              ? `${previousNode} → ${nodeName}`
              : `Entered ${nodeName}`,
        kind: "node",
        status: baseStatus,
        startedAt: event.occurredAt,
        durationMs,
        depth: 1,
        phase,
        modelCalls,
        event,
        inspectEvent:
          terminal?.type.endsWith("failed") && terminal ? terminal : event,
      });
      continue;
    }

    items.push({
      id: event.id,
      label: isReasonFailure ? "Model reasoning" : name,
      description: isReasonFailure
        ? "Model decision or output processing failed"
        : isTool
          ? `${event.payload.callingMode === "direct" ? "Direct call" : event.payload.callingMode === "model" ? "Model-selected call" : "Tool call"} from ${event.nodeId ?? "workflow"}${terminal?.payload.denialCode ? ` · ${terminal.payload.denialCode}` : ""}${baseStatus === "replayed" ? ` · cached ${terminal?.payload.outcome ?? "result"}, not executed` : ""}`
          : "Nested operation",
      kind: isTool ? "tool" : "span",
      status: baseStatus,
      startedAt: event.occurredAt,
      durationMs,
      depth: isTool ? 2 : 2,
      phase,
      modelCalls: 0,
      event,
      inspectEvent: isTool
        ? (terminal ?? event)
        : terminal?.type.endsWith("failed") && terminal
          ? terminal
          : event,
      ...(isTool && terminal ? { endEvent: terminal } : {}),
    });
  }

  appendInterrupts(items, ordered, phaseNumberAt);
  appendNarrativeEvents(items, ordered, phaseNumberAt);
  appendUnobservedWaits(items, ordered, phaseNumberAt);

  return items.sort(
    (first, second) =>
      Date.parse(first.startedAt) - Date.parse(second.startedAt) ||
      kindOrder(first.kind) - kindOrder(second.kind),
  );
}

function appendInterrupts(
  items: TraceItem[],
  events: StudioDetailEvent[],
  phaseNumberAt: (occurredAt: string) => number | null,
) {
  const createdById = new Map<string, StudioDetailEvent>();
  const terminalById = new Map<string, StudioDetailEvent>();
  for (const event of events) {
    const id = asString(event.payload.interruptId);
    if (!id) continue;
    if (event.type === "interrupt.created") createdById.set(id, event);
    if (INTERRUPT_TERMINALS.has(event.type)) terminalById.set(id, event);
  }

  for (const [id, created] of createdById) {
    const terminal = terminalById.get(id);
    const contract = asString(created.payload.contract);
    const durationMs = terminal
      ? Math.max(
          0,
          Date.parse(terminal.occurredAt) - Date.parse(created.occurredAt),
        )
      : null;
    const status = interruptStatus(terminal?.type);
    items.push({
      id: created.id,
      label: `Human input · ${contract ?? created.nodeId ?? "unknown node"}`,
      description:
        status === "resolved" && durationMs !== null
          ? `${contract && created.nodeId ? `${created.nodeId} · ` : ""}Resolved after ${formatDurationMs(durationMs)}`
          : status === "waiting"
            ? `${contract && created.nodeId ? `${created.nodeId} · ` : ""}Waiting for a response`
            : `${statusLabel(status)} after ${formatDurationMs(durationMs ?? 0)}`,
      kind: "interrupt",
      status,
      startedAt: created.occurredAt,
      durationMs,
      depth: 1,
      phase: phaseNumberAt(created.occurredAt),
      modelCalls: 0,
      event: created,
      inspectEvent: terminal ?? created,
      ...(terminal ? { endEvent: terminal } : {}),
    });
  }

  for (const [id, terminal] of terminalById) {
    if (createdById.has(id)) continue;
    const status = interruptStatus(terminal.type);
    items.push({
      id: terminal.id,
      label: `Human input ${statusLabel(status).toLowerCase()} · ${terminal.nodeId ?? "unknown node"}`,
      description:
        "The request began before the captured telemetry in this run",
      kind: "interrupt",
      status,
      startedAt: terminal.occurredAt,
      durationMs: null,
      depth: 0,
      phase: phaseNumberAt(terminal.occurredAt),
      modelCalls: 0,
      event: terminal,
      inspectEvent: terminal,
    });
  }
}

function appendNarrativeEvents(
  items: TraceItem[],
  events: StudioDetailEvent[],
  phaseNumberAt: (occurredAt: string) => number | null,
) {
  for (const event of events) {
    if (event.type === "workflow.transitioned") {
      const source = asString(event.payload.sourceWorkflowId) ?? "workflow";
      const target =
        asString(event.payload.targetWorkflowId) ?? event.workflowId;
      const sourceNode = asString(event.payload.sourceNodeId) ?? event.nodeId;
      items.push({
        id: event.id,
        label: `${source} → ${target}`,
        description: `Workflow handoff${sourceNode ? ` from ${sourceNode}` : ""}`,
        kind: "transition",
        status: "event",
        startedAt: event.occurredAt,
        durationMs: null,
        depth: 1,
        phase: phaseNumberAt(event.occurredAt),
        modelCalls: 0,
        event,
        inspectEvent: event,
      });
    }
    if (event.type === "session.checkpointed") {
      const phase = phaseNumberAt(event.occurredAt);
      const execution = items.find(
        (item) => item.kind === "execution" && item.phase === phase,
      );
      items.push({
        id: event.id,
        label: "Checkpoint saved",
        description:
          execution?.status === "interrupted"
            ? "Session state persisted at the pause boundary"
            : execution?.executionRole === "resumed"
              ? "Session state persisted after resumed execution"
              : "Session state persisted after execution",
        kind: "checkpoint",
        status: "event",
        startedAt: event.occurredAt,
        durationMs: null,
        depth: 1,
        phase,
        modelCalls: 0,
        event,
        inspectEvent: event,
      });
    }
    if (
      event.type === "session.forked" ||
      event.type === "session.rolled_back" ||
      event.type === "run.cancelled" ||
      event.type === "run.limit_reached"
    ) {
      items.push({
        id: event.id,
        label: friendlyEventLabel(event.type),
        description:
          event.type === "run.limit_reached"
            ? `${event.payload.limit}: ${event.payload.consumed}/${event.payload.maximum}`
            : event.nodeId
              ? `At ${event.nodeId}`
              : "Run lifecycle event",
        kind: "event",
        status:
          event.type === "run.cancelled"
            ? "cancelled"
            : event.type === "run.limit_reached"
              ? "interrupted"
              : "event",
        startedAt: event.occurredAt,
        durationMs: null,
        depth: 1,
        phase: phaseNumberAt(event.occurredAt),
        modelCalls: 0,
        event,
        inspectEvent: event,
      });
    }
  }
}

function appendUnobservedWaits(
  items: TraceItem[],
  events: StudioDetailEvent[],
  phaseNumberAt: (occurredAt: string) => number | null,
) {
  for (const { previous, current, durationMs: gap } of idleGaps(events)) {
    const interruptId = asString(current.payload.interruptId);
    const pairedInterrupt =
      current.type === "interrupt.resolved" &&
      interruptId &&
      events.some(
        (event) =>
          event.type === "interrupt.created" &&
          event.payload.interruptId === interruptId,
      );
    if (pairedInterrupt) continue;

    items.push({
      id: `wait-${previous.id}-${current.id}`,
      label: "Unobserved wait",
      description: `${formatDurationMs(gap)} without telemetry before ${friendlyEventLabel(current.type).toLowerCase()}`,
      kind: "wait",
      status: "waiting",
      startedAt: previous.occurredAt,
      durationMs: gap,
      depth: 0,
      phase: phaseNumberAt(previous.occurredAt),
      modelCalls: 0,
      event: previous,
      inspectEvent: current,
    });
  }
}

function lifecycleKey(event: StudioDetailEvent): string {
  if (event.type.startsWith("tool.") && event.payload.toolCallId)
    return JSON.stringify([
      event.runId,
      event.workflowId,
      event.nodeId,
      event.payload.invocationId,
      event.payload.branchId,
      event.payload.toolCallId,
      event.payload.attemptId ?? "legacy",
    ]);
  return event.spanId ?? event.id;
}

function terminalEvents(events: StudioDetailEvent[]) {
  const terminals = new Map<string, StudioDetailEvent>();
  for (const event of events) {
    if (!event.spanId || !SPAN_TERMINALS.has(event.type)) continue;
    const key = lifecycleKey(event);
    const current = terminals.get(key);
    if (!current?.type.endsWith("failed") || event.type.endsWith("failed")) {
      terminals.set(key, event);
    }
  }
  return terminals;
}

function eventDuration(
  start: StudioDetailEvent,
  terminal: StudioDetailEvent | undefined,
) {
  if (!terminal) return null;
  return typeof terminal.payload.durationMs === "number"
    ? Math.max(0, terminal.payload.durationMs)
    : Math.max(
        0,
        Date.parse(terminal.occurredAt) - Date.parse(start.occurredAt),
      );
}

function spanStatus(
  terminal: StudioDetailEvent | undefined,
  hasLaterExecution: boolean,
): TraceStatus {
  if (!terminal) return hasLaterExecution ? "incomplete" : "running";
  if (terminal.type === "tool.reused") return "replayed";
  if (terminal.type === "tool.waiting" || terminal.type === "tool.suspended")
    return "waiting";
  if (terminal.type === "tool.denied" || terminal.payload.outcome === "denied")
    return "denied";
  if (
    terminal.type === "tool.cancelled" ||
    terminal.payload.outcome === "cancelled"
  )
    return "cancelled";
  if (
    terminal.type === "tool.failed" ||
    (terminal.type.startsWith("tool.") && terminal.payload.isError === true)
  )
    return "fault";
  if (!terminal.type.endsWith("failed")) return "completed";
  if (isControlFlowCancellation(terminal)) return "cancelled";
  return isControlFlowInterrupt(terminal) ? "interrupted" : "failed";
}

function countModelCalls(
  events: StudioDetailEvent[],
  start: StudioDetailEvent,
  terminal: StudioDetailEvent | undefined,
) {
  const started = Date.parse(start.occurredAt);
  const ended = terminal
    ? Date.parse(terminal.occurredAt)
    : Number.POSITIVE_INFINITY;
  return events.filter(
    (event) =>
      event.type === "generation.completed" &&
      event.nodeId === start.nodeId &&
      Date.parse(event.occurredAt) >= started &&
      Date.parse(event.occurredAt) <= ended,
  ).length;
}

function findInterruptInsideSpan(
  events: StudioDetailEvent[],
  start: StudioDetailEvent,
  terminal: StudioDetailEvent | undefined,
) {
  if (!terminal) return undefined;
  const started = Date.parse(start.occurredAt);
  const ended = Date.parse(terminal.occurredAt);
  return events.find(
    (event) =>
      event.type === "interrupt.created" &&
      Date.parse(event.occurredAt) >= started &&
      Date.parse(event.occurredAt) <= ended,
  );
}

export function buildTimelineScale(
  events: StudioDetailEvent[],
  fallbackStart: string,
): TimelineScale {
  const orderedTimes = events
    .map((event) => Date.parse(event.occurredAt))
    .filter(Number.isFinite)
    .sort((first, second) => first - second);
  const startMs = orderedTimes[0] ?? Date.parse(fallbackStart);
  const endMs = orderedTimes.at(-1) ?? startMs + 1;
  const gaps: TimelineGap[] = idleGaps(events).map(
    ({ previous, current, durationMs }) => ({
      startMs: Date.parse(previous.occurredAt),
      endMs: Date.parse(current.occurredAt),
      actualDurationMs: durationMs,
      displayDurationMs: COMPRESSED_WAIT_MS,
    }),
  );
  const wallDurationMs = Math.max(1, endMs - startMs);
  const visibleDurationMs = Math.max(
    1,
    wallDurationMs -
      gaps.reduce(
        (total, gap) => total + gap.actualDurationMs - gap.displayDurationMs,
        0,
      ),
  );
  const toVisibleTime = (timeMs: number) => {
    const clamped = Math.min(endMs, Math.max(startMs, timeMs));
    let visible = clamped - startMs;
    for (const gap of gaps) {
      if (clamped <= gap.startMs) break;
      if (clamped >= gap.endMs) {
        visible -= gap.actualDurationMs - gap.displayDurationMs;
        continue;
      }
      const progress = (clamped - gap.startMs) / gap.actualDurationMs;
      visible -= clamped - gap.startMs - progress * gap.displayDurationMs;
      break;
    }
    return visible;
  };
  return {
    startMs,
    endMs,
    wallDurationMs,
    visibleDurationMs,
    gaps,
    toPercent: (timeMs) =>
      Math.min(
        100,
        Math.max(0, (toVisibleTime(timeMs) / visibleDurationMs) * 100),
      ),
  };
}

function idleGaps(events: StudioDetailEvent[]) {
  const ordered = [...events].sort(
    (first, second) =>
      Date.parse(first.occurredAt) - Date.parse(second.occurredAt),
  );
  const terminals = terminalEvents(ordered);
  const activeIntervals = ordered.flatMap((event) => {
    if (event.type !== "span.started" && event.type !== "tool.started") {
      return [];
    }
    if (event.payload.name === "kortyx.run" || !event.spanId) return [];
    const terminal = terminals.get(event.spanId);
    if (!terminal) return [];
    return [
      {
        startMs: Date.parse(event.occurredAt),
        endMs: Date.parse(terminal.occurredAt),
      },
    ];
  });
  const gaps: Array<{
    previous: StudioDetailEvent;
    current: StudioDetailEvent;
    durationMs: number;
  }> = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!previous || !current) continue;
    const previousMs = Date.parse(previous.occurredAt);
    const currentMs = Date.parse(current.occurredAt);
    const durationMs = currentMs - previousMs;
    if (durationMs <= WAIT_GAP_THRESHOLD_MS) continue;
    const coveredByActiveOperation = activeIntervals.some(
      (interval) =>
        interval.startMs <= previousMs && interval.endMs >= currentMs,
    );
    if (coveredByActiveOperation) continue;
    gaps.push({ previous, current, durationMs });
  }
  return gaps;
}

export function isControlFlowInterrupt(event: StudioDetailEvent): boolean {
  const error = event.payload.error;
  return (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "name" in error &&
    (error.name === "GraphInterrupt" ||
      error.name === "ExecutionLimitReachedError")
  );
}

function interruptStatus(
  type: StudioDetailEvent["type"] | undefined,
): TraceStatus {
  if (type === "interrupt.resolved") return "resolved";
  if (type === "interrupt.expired") return "expired";
  if (type === "interrupt.cancelled") return "cancelled";
  return "waiting";
}

export function statusLabel(status: TraceStatus) {
  if (status === "denied") return "Denied";
  if (status === "replayed") return "Replayed";
  if (status === "fault") return "Fault";
  if (status === "event") return "recorded";
  return status;
}

function kindOrder(kind: TraceKind) {
  if (kind === "execution") return 0;
  if (kind === "node") return 1;
  if (kind === "generation" || kind === "span" || kind === "tool") return 2;
  return 3;
}

export function isPointEvent(item: TraceItem) {
  return (
    item.kind === "event" ||
    item.kind === "transition" ||
    item.kind === "checkpoint"
  );
}

function friendlyEventLabel(type: StudioDetailEvent["type"]) {
  const labels: Partial<Record<StudioDetailEvent["type"], string>> = {
    "interrupt.created": "Interrupt requested",
    "interrupt.resolved": "Interrupt resolved",
    "interrupt.expired": "Interrupt expired",
    "interrupt.cancelled": "Interrupt cancelled",
    "session.checkpointed": "Checkpoint saved",
    "session.forked": "Session forked",
    "session.rolled_back": "Session rolled back",
    "run.cancelled": "Run cancelled",
    "workflow.suspended": "Workflow suspended",
    "workflow.resumed": "Workflow resumed",
    "run.limit_reached": "Limit reached — Continue?",
    "workflow.transitioned": "Workflow transitioned",
  };
  return labels[type] ?? type;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function generationTiming(
  generation: StudioDetailEvent | undefined,
  attributes: Record<string, unknown>,
): GenerationTiming {
  const streaming = attributes.stream !== false;
  return {
    streaming,
    ttftMs: streaming ? numberValue(generation?.payload.ttftMs) : null,
    streamDurationMs: numberValue(generation?.payload.streamDurationMs),
    postStreamDurationMs: numberValue(generation?.payload.postStreamDurationMs),
  };
}

function generationDescription(
  provider: string,
  durationMs: number | null,
  timing: GenerationTiming,
  status: TraceStatus,
  generation?: StudioDetailEvent,
) {
  if (status === "failed") return `${provider} provider call failed`;
  if (status === "cancelled") return `${provider} provider call cancelled`;
  if (status === "incomplete")
    return `${provider} provider call · completion not captured`;
  if (!timing.streaming)
    return `${provider} non-streaming call${durationMs === null ? "" : ` · ${formatDurationMs(durationMs)}`}`;
  if (timing.ttftMs === null) {
    const reason = asRecord(generation?.payload.finishReason);
    const detail =
      reason.unified === "tool-calls"
        ? "tool call · no text TTFT"
        : durationMs === null
          ? "awaiting first text chunk"
          : "no text TTFT";
    return `${provider} provider call${durationMs === null ? "" : ` · ${formatDurationMs(durationMs)}`} · ${detail}`;
  }
  return `TTFT ${formatDurationMs(timing.ttftMs)} · output stream ${formatDurationMs(timing.streamDurationMs ?? 0)}${timing.postStreamDurationMs ? ` · finalize ${formatDurationMs(timing.postStreamDurationMs)}` : ""}`;
}

const INTERNAL_SPANS = new Set(["useReason", "runReasonEngine"]);
const SPAN_TERMINALS = new Set<StudioDetailEvent["type"]>([
  "span.ended",
  "span.failed",
  "tool.completed",
  "tool.failed",
  "tool.denied",
  "tool.cancelled",
  "tool.reused",
  "tool.waiting",
  "tool.suspended",
]);
const INTERRUPT_TERMINALS = new Set<StudioDetailEvent["type"]>([
  "interrupt.resolved",
  "interrupt.expired",
  "interrupt.cancelled",
]);
const WAIT_GAP_THRESHOLD_MS = 5_000;
const COMPRESSED_WAIT_MS = 1_200;
