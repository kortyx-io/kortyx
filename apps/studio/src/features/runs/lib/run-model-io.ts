import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";

export type ModelExchange = {
  id: string;
  opId: string | null;
  reasonId: string | null;
  reasonSpanId: string | null;
  invocationId: string | null;
  nodeId: string | null;
  workflowId: string;
  occurredAt: string;
  provider: string;
  model: string;
  emitted: boolean | null;
  streamed: boolean | null;
  format: "structured" | "text-delta" | "text" | "tool-calls" | "unknown";
  status: "completed" | "failed" | "incomplete";
  inputCaptured: boolean;
  input: unknown;
  outputCaptured: boolean;
  output: unknown;
  structuredOutputCaptured: boolean;
  structuredOutput: unknown;
  finishReason: unknown;
  durationMs: number | null;
};

export type ModelOperationStep =
  | { kind: "model"; occurredAt: string; exchange: ModelExchange }
  | {
      kind: "milestone";
      occurredAt: string;
      id: string;
      label: string;
    }
  | {
      kind: "tool";
      occurredAt: string;
      id: string;
      label: string;
      status: "completed" | "failed" | "waiting";
    };

export type ModelOperation = {
  id: string;
  reasonId: string | null;
  model: string;
  nodeId: string | null;
  workflowId: string;
  attempts: ModelExchange[];
  interruptCount: number;
  explicitInterruptCount: number;
  steps: ModelOperationStep[];
};

export type ModelInputSegment = {
  title: string;
  value: unknown;
};

export type ModelOperationEntry =
  | { kind: "payload"; id: string; title: string; value: unknown }
  | {
      kind: "milestone";
      id: string;
      occurredAt: string;
      label: string;
      status?: "completed" | "failed" | "waiting";
    };

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const string = (value: unknown, fallback: string): string =>
  typeof value === "string" && value ? value : fallback;

const boolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

/** Keep the exact provider messages while naming the earlier turns on replay. */
export function modelInputSegments(input: unknown): ModelInputSegment[] {
  if (!Array.isArray(input))
    return [{ title: "Model input · full messages", value: input }];
  const segments: ModelInputSegment[] = [];
  const initial: unknown[] = [];
  let sawHumanRequest = false;
  for (const message of input) {
    const item = record(message);
    const calls = Array.isArray(item.toolCalls) ? item.toolCalls : [];
    const humanRequest = calls.some((call) =>
      string(record(call).name, "").startsWith("kortyx_request_input__"),
    );
    const isPriorTurn = item.role === "assistant" || item.role === "tool";
    if (!isPriorTurn && segments.length === 0) {
      initial.push(message);
      continue;
    }
    if (initial.length > 0) {
      segments.push({ title: "Initial model input", value: [...initial] });
      initial.length = 0;
    }
    const title = humanRequest
      ? "Human input requested by model"
      : item.role === "tool"
        ? sawHumanRequest
          ? "Human response returned to model"
          : "Tool result returned to model"
        : calls.length > 0
          ? "Earlier model tool request"
          : item.role === "assistant"
            ? "Earlier model output"
            : "Follow-up model input";
    segments.push({ title, value: message });
    if (humanRequest) sawHumanRequest = true;
    else if (item.role === "tool") sawHumanRequest = false;
  }
  if (initial.length > 0)
    segments.push({ title: "Model input · full messages", value: initial });
  return segments;
}

const inputChanges = (previous: unknown, current: unknown): unknown => {
  if (!Array.isArray(previous) || !Array.isArray(current)) return current;
  if (
    previous.length > current.length ||
    previous.some(
      (message, index) =>
        JSON.stringify(message) !== JSON.stringify(current[index]),
    )
  )
    return current;
  return current.slice(previous.length);
};

/** One readable sequence for a reason loop, preserving the provider payloads. */
export function buildModelOperationEntries(
  operation: ModelOperation,
): ModelOperationEntry[] {
  const entries: ModelOperationEntry[] = [];
  const attempts = [...operation.attempts].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const markers = operation.steps.filter((step) => step.kind !== "model");
  const addPayload = (id: string, segment: ModelInputSegment) => {
    entries.push({ kind: "payload", id, ...segment });
  };

  for (const [index, attempt] of attempts.entries()) {
    if (index === 0 && attempt.inputCaptured) {
      for (const [part, segment] of modelInputSegments(attempt.input).entries())
        addPayload(`${attempt.id}:input:${part}`, segment);
    }
    if (attempt.outputCaptured && attempt.output !== "") {
      addPayload(`${attempt.id}:output`, {
        title:
          index === attempts.length - 1 ? "Raw model output" : "Model output",
        value: attempt.output,
      });
    }

    const next = attempts[index + 1];
    if (!next) {
      if (attempt.structuredOutputCaptured)
        addPayload(`${attempt.id}:structured`, {
          title: "Validated structured result",
          value: attempt.structuredOutput,
        });
      continue;
    }
    const added = next.inputCaptured
      ? modelInputSegments(
          attempt.inputCaptured
            ? inputChanges(attempt.input, next.input)
            : next.input,
        )
      : [];
    const requests = added.filter(
      (segment) =>
        segment.title === "Human input requested by model" ||
        segment.title === "Earlier model tool request",
    );
    const responses = added.filter((segment) => !requests.includes(segment));
    for (const [part, segment] of requests.entries())
      addPayload(`${next.id}:request:${part}`, segment);
    const between = markers.filter(
      (step) =>
        Date.parse(step.occurredAt) > Date.parse(attempt.occurredAt) &&
        Date.parse(step.occurredAt) < Date.parse(next.occurredAt),
    );
    for (const step of between) {
      if (
        (step.kind === "milestone" &&
          step.label === "Human input requested" &&
          requests.some(
            (segment) => segment.title === "Human input requested by model",
          )) ||
        (step.kind === "milestone" &&
          step.label === "Human input received" &&
          responses.some(
            (segment) => segment.title === "Human response returned to model",
          ))
      )
        continue;
      entries.push({
        kind: "milestone",
        id: step.id,
        occurredAt: step.occurredAt,
        label:
          step.kind === "tool"
            ? `${step.label} tool ${step.status}`
            : step.label,
        ...(step.kind === "tool" ? { status: step.status } : {}),
      });
    }
    for (const [part, segment] of responses.entries())
      addPayload(`${next.id}:response:${part}`, segment);
  }

  if (entries.every((entry) => entry.kind !== "payload")) {
    entries.push({
      kind: "milestone",
      id: `${operation.id}:uncaptured`,
      occurredAt: attempts[0]?.occurredAt ?? "",
      label: "Model content was not captured for this operation.",
    });
  }
  return entries;
}

export function buildModelExchanges(
  events: StudioDetailEvent[],
): ModelExchange[] {
  const starts = events.filter((event) => event.type === "span.started");
  const startsBySpan = new Map(
    starts
      .filter((event) => event.spanId)
      .map((event) => [event.spanId, event]),
  );
  const endsBySpan = new Map(
    events
      .filter((event) => event.type === "span.ended" && event.spanId)
      .map((event) => [event.spanId, event]),
  );
  const failuresBySpan = new Map(
    events
      .filter((event) => event.type === "span.failed" && event.spanId)
      .map((event) => [event.spanId, event]),
  );
  const generationsBySpan = new Map(
    events
      .filter((event) => event.type === "generation.completed" && event.spanId)
      .map((event) => [event.spanId, event]),
  );
  const modelStarts = starts.filter(
    (event) => event.payload.name === "runReasonEngine",
  );
  const reasonByModel = new Map<string, StudioDetailEvent>();
  for (const start of modelStarts) {
    const visited = new Set<string>();
    let parentId = start.parentSpanId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = startsBySpan.get(parentId);
      if (!parent) break;
      if (parent.payload.name === "useReason") {
        reasonByModel.set(start.id, parent);
        break;
      }
      parentId = parent.parentSpanId;
    }
  }
  const lastModelByReason = new Map<string, string>();
  for (const start of modelStarts) {
    const reason = reasonByModel.get(start.id);
    if (reason?.spanId) lastModelByReason.set(reason.spanId, start.id);
  }

  return modelStarts.map((start) => {
    const end = start.spanId ? endsBySpan.get(start.spanId) : undefined;
    const failure = failuresBySpan.get(start.spanId);
    const generation = generationsBySpan.get(start.spanId);
    const reason = reasonByModel.get(start.id);
    const reasonEnd = reason?.spanId
      ? endsBySpan.get(reason.spanId)
      : undefined;
    const attributes = record(start.payload.attributes);
    const reasonAttributes = record(reason?.payload.attributes);
    const finishReason = generation?.payload.finishReason;
    const finish = record(finishReason);
    const isToolCall =
      finish.unified === "tool-calls" ||
      finish.reason === "tool-calls" ||
      finish.raw === "tool_calls";
    const isStructured =
      reasonAttributes.hasOutputSchema === true ||
      reasonAttributes.hasStructured === true;
    const hasOutput = Boolean(end && Object.hasOwn(end.payload, "output"));
    const hasStructuredOutput = Boolean(
      reasonEnd &&
        reason?.spanId &&
        lastModelByReason.get(reason.spanId) === start.id &&
        Object.hasOwn(reasonEnd.payload, "output") &&
        isStructured,
    );
    return {
      id: start.spanId ?? start.id,
      opId: string(reasonAttributes.opId ?? attributes.opId, "") || null,
      reasonId: string(reasonAttributes.id ?? attributes.id, "") || null,
      reasonSpanId: reason?.spanId ?? null,
      invocationId: string(start.payload.invocationId, "") || null,
      nodeId: start.nodeId,
      workflowId: start.workflowId,
      occurredAt: start.occurredAt,
      provider: string(attributes.providerId, "Unknown provider"),
      model: string(attributes.modelId, "Unknown model"),
      emitted: boolean(reasonAttributes.emit ?? attributes.emit),
      streamed: boolean(attributes.stream),
      format: isToolCall
        ? "tool-calls"
        : isStructured
          ? "structured"
          : hasOutput
            ? attributes.stream === true
              ? "text-delta"
              : "text"
            : "unknown",
      status: failure ? "failed" : end ? "completed" : "incomplete",
      inputCaptured: Object.hasOwn(start.payload, "input"),
      input: start.payload.input,
      outputCaptured: hasOutput,
      output: end?.payload.output,
      structuredOutputCaptured: hasStructuredOutput,
      structuredOutput: hasStructuredOutput
        ? reasonEnd?.payload.output
        : undefined,
      finishReason,
      durationMs:
        typeof generation?.payload.durationMs === "number"
          ? generation.payload.durationMs
          : typeof end?.payload.durationMs === "number"
            ? end.payload.durationMs
            : null,
    };
  });
}

export function buildModelOperations(
  events: StudioDetailEvent[],
  exchanges: ModelExchange[] = buildModelExchanges(events),
): ModelOperation[] {
  const groups = new Map<string, ModelOperation>();
  for (const exchange of exchanges) {
    const key = exchange.opId
      ? `${exchange.workflowId}:${exchange.invocationId ?? ""}:${exchange.opId}`
      : (exchange.reasonSpanId ?? exchange.id);
    let group = groups.get(key);
    if (!group) {
      group = {
        id: key,
        reasonId: exchange.reasonId,
        model: exchange.model,
        nodeId: exchange.nodeId,
        workflowId: exchange.workflowId,
        attempts: [],
        interruptCount: 0,
        explicitInterruptCount: 0,
        steps: [],
      };
      groups.set(key, group);
    }
    group.attempts.push(exchange);
    group.steps.push({
      kind: "model",
      occurredAt: exchange.occurredAt,
      exchange,
    });
  }

  const reasonEnds = events.filter(
    (event) =>
      event.type === "span.ended" && event.payload.name === "useReason",
  );
  const toolStarts = events.filter((event) => event.type === "tool.started");
  const toolTerminals = new Map(
    events
      .filter(
        (event) =>
          event.type === "tool.completed" ||
          event.type === "tool.failed" ||
          event.type === "tool.denied" ||
          event.type === "tool.cancelled",
      )
      .filter((event) => event.spanId)
      .map((event) => [event.spanId, event]),
  );
  const checkpoints = events.filter(
    (event) => event.type === "session.checkpointed",
  );
  const resumes = events.filter(
    (event) =>
      event.type === "workflow.call.resumed" ||
      event.type === "interrupt.resolved" ||
      (event.type === "span.started" &&
        event.payload.name === "kortyx.run" &&
        event.payload.attributes &&
        record(event.payload.attributes).resume === true),
  );

  for (const group of groups.values()) {
    const reasonSpans = new Set(
      group.attempts.map((attempt) => attempt.reasonSpanId).filter(Boolean),
    );
    const interruptEvents = events.filter((event) => {
      if (event.type !== "interrupt.created") return false;
      if (reasonSpans.has(event.parentSpanId)) return true;
      const path = Array.isArray(event.payload.workflowCallPath)
        ? event.payload.workflowCallPath
        : [];
      const calls = [event.payload.workflowCall, ...path].map(record);
      if (
        calls.some((call) =>
          group.attempts.some(
            (attempt) =>
              attempt.invocationId &&
              call.invocationId === attempt.invocationId,
          ),
        )
      )
        return true;
      return (
        event.workflowId === group.workflowId && event.nodeId === group.nodeId
      );
    });
    group.explicitInterruptCount = interruptEvents.length;
    group.interruptCount = Math.max(
      interruptEvents.length,
      0,
      ...reasonEnds
        .filter((event) => event.spanId && reasonSpans.has(event.spanId))
        .map(
          (event) =>
            Number(record(event.payload.attributes).interruptCount) || 0,
        ),
    );
    const orderedAttempts = [...group.attempts].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
    );
    const reasonStarts = orderedAttempts.map((attempt) =>
      Date.parse(attempt.occurredAt),
    );
    const first = reasonStarts[0] ?? 0;
    const last = Math.max(
      ...orderedAttempts.map(
        (attempt) => Date.parse(attempt.occurredAt) + (attempt.durationMs ?? 0),
      ),
    );
    for (const event of toolStarts) {
      if (!reasonSpans.has(event.parentSpanId)) continue;
      const terminal = event.spanId
        ? toolTerminals.get(event.spanId)
        : undefined;
      group.steps.push({
        kind: "tool",
        occurredAt: event.occurredAt,
        id: event.id,
        label: string(event.payload.name ?? event.payload.tool, "Tool"),
        status: !terminal
          ? "waiting"
          : terminal.type === "tool.completed" &&
              terminal.payload.isError !== true &&
              terminal.payload.outcome !== "fault"
            ? "completed"
            : "failed",
      });
    }
    if (orderedAttempts.length > 1) {
      for (const event of interruptEvents) {
        group.steps.push({
          kind: "milestone",
          occurredAt: event.occurredAt,
          id: event.id,
          label: "Human input requested",
        });
      }
      for (const event of checkpoints) {
        const time = Date.parse(event.occurredAt);
        if (time > first && time < last) {
          group.steps.push({
            kind: "milestone",
            occurredAt: event.occurredAt,
            id: event.id,
            label: "Execution checkpoint saved",
          });
        }
      }
      for (const event of resumes) {
        const time = Date.parse(event.occurredAt);
        if (time <= first || time >= last) continue;
        const matchingInvocation = group.attempts.some(
          (attempt) =>
            attempt.invocationId &&
            attempt.invocationId === event.payload.invocationId,
        );
        if (event.type === "workflow.call.resumed" && !matchingInvocation)
          continue;
        group.steps.push({
          kind: "milestone",
          occurredAt: event.occurredAt,
          id: event.id,
          label:
            event.type === "interrupt.resolved"
              ? "Human input received"
              : "Execution resumed",
        });
      }
    }
    group.steps.sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
    );
  }
  return [...groups.values()].sort(
    (a, b) =>
      Date.parse(a.steps[0]?.occurredAt ?? "") -
      Date.parse(b.steps[0]?.occurredAt ?? ""),
  );
}
