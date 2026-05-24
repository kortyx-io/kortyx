import type {
  KortyxTraceMetadata,
  ReasonTraceAttributes,
  ReasonTraceSpanEndArgs,
  ReasonTraceSpanStartArgs,
} from "@kortyx/hooks";
import type { Attributes } from "@opentelemetry/api";
import { type ContentCaptureSide, shouldCapture } from "./content";
import type { OpenTelemetryTraceAdapterOptions } from "./types";

type OpenTelemetryAttributeValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

export const toAttributeValue = (
  value: unknown,
): OpenTelemetryAttributeValue | undefined => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      return value as string[];
    }
    if (value.every((item) => typeof item === "number")) {
      return value as number[];
    }
    if (value.every((item) => typeof item === "boolean")) {
      return value as boolean[];
    }
  }
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const toAttributes = (attributes: ReasonTraceAttributes): Attributes => {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    const attributeValue = toAttributeValue(value);
    if (attributeValue !== undefined) result[key] = attributeValue;
  }
  return result;
};

export const normalizeKnownAttributes = (
  attributes: ReasonTraceAttributes,
): ReasonTraceAttributes => {
  const normalized: ReasonTraceAttributes = { ...attributes };

  if (typeof attributes.providerId === "string") {
    normalized["gen_ai.provider.name"] = attributes.providerId;
    normalized["kortyx.provider.id"] = attributes.providerId;
  }
  if (typeof attributes.modelId === "string") {
    normalized["gen_ai.request.model"] = attributes.modelId;
    normalized["kortyx.model.id"] = attributes.modelId;
  }
  if (typeof attributes.stream === "boolean") {
    normalized["gen_ai.request.stream"] = attributes.stream;
  }
  if (typeof attributes.operation === "string") {
    normalized["gen_ai.operation.name"] = attributes.operation;
    normalized["kortyx.operation.name"] = attributes.operation;
  }
  if (typeof attributes.nodeId === "string") {
    normalized["kortyx.node.id"] = attributes.nodeId;
  }
  if (typeof attributes.workflowId === "string") {
    normalized["kortyx.workflow.id"] = attributes.workflowId;
  }
  if (typeof attributes.runId === "string") {
    normalized["kortyx.run.id"] = attributes.runId;
  }
  if (typeof attributes.sessionId === "string") {
    normalized["session.id"] = attributes.sessionId;
    normalized["gen_ai.conversation.id"] = attributes.sessionId;
    normalized["kortyx.session.id"] = attributes.sessionId;
  }
  if (typeof attributes.userId === "string") {
    normalized["user.id"] = attributes.userId;
  }
  if (typeof attributes.tenantId === "string") {
    normalized["kortyx.tenant.id"] = attributes.tenantId;
  }
  if (typeof attributes.promptName === "string") {
    normalized["gen_ai.prompt.name"] = attributes.promptName;
    normalized["kortyx.prompt.name"] = attributes.promptName;
  }
  if (attributes.promptVersion !== undefined) {
    normalized["gen_ai.prompt.version"] = attributes.promptVersion;
    normalized["kortyx.prompt.version"] = attributes.promptVersion;
  }
  if (typeof attributes.promptType === "string") {
    normalized["gen_ai.prompt.type"] = attributes.promptType;
    normalized["kortyx.prompt.type"] = attributes.promptType;
  }

  return normalized;
};

export const telemetryAttributes = (
  telemetry: KortyxTraceMetadata | undefined,
  options: OpenTelemetryTraceAdapterOptions,
  side?: ContentCaptureSide,
): ReasonTraceAttributes => {
  const attributes: ReasonTraceAttributes = {};
  if (!telemetry) return attributes;

  if (telemetry.operation) {
    attributes.operation = telemetry.operation;
    attributes["gen_ai.operation.name"] = telemetry.operation;
  }

  if (telemetry.prompt) {
    const prompt = telemetry.prompt;
    if (prompt.name) attributes["gen_ai.prompt.name"] = prompt.name;
    if (prompt.name) attributes["kortyx.prompt.name"] = prompt.name;
    if (prompt.version !== undefined) {
      attributes["gen_ai.prompt.version"] = prompt.version;
      attributes["kortyx.prompt.version"] = prompt.version;
    }
    if (prompt.type) attributes["gen_ai.prompt.type"] = prompt.type;
    if (prompt.type) attributes["kortyx.prompt.type"] = prompt.type;
    if (prompt.source) attributes["kortyx.prompt.source"] = prompt.source;
    Object.assign(attributes, options.mapPromptMetadata?.(prompt) ?? {});
  }

  if (telemetry.tags?.length) {
    attributes["kortyx.trace.tags"] = telemetry.tags;
  }

  if (telemetry.metadata) {
    for (const [key, value] of Object.entries(telemetry.metadata)) {
      attributes[`kortyx.trace.metadata.${key}`] = value;
    }
  }

  if (
    side === "input" &&
    shouldCapture(telemetry.captureContent ?? options.captureContent, "input")
  ) {
    attributes["gen_ai.prompt"] = telemetry.input;
    attributes["kortyx.trace.input"] = telemetry.input;
  }
  if (
    side === "output" &&
    shouldCapture(telemetry.captureContent ?? options.captureContent, "output")
  ) {
    attributes["gen_ai.completion"] = telemetry.output;
    attributes["kortyx.trace.output"] = telemetry.output;
  }

  return attributes;
};

export const usageAttributes = (
  args: ReasonTraceSpanEndArgs | undefined,
): ReasonTraceAttributes => {
  const usage = args?.usage;
  if (!usage) return {};
  return {
    ...(usage.input !== undefined
      ? { "gen_ai.usage.input_tokens": usage.input }
      : {}),
    ...(usage.output !== undefined
      ? { "gen_ai.usage.output_tokens": usage.output }
      : {}),
    ...(usage.total !== undefined
      ? { "gen_ai.usage.total_tokens": usage.total }
      : {}),
    ...(usage.reasoning !== undefined
      ? { "gen_ai.usage.reasoning.output_tokens": usage.reasoning }
      : {}),
    ...(usage.cacheRead !== undefined
      ? { "gen_ai.usage.cache_read.input_tokens": usage.cacheRead }
      : {}),
    ...(usage.cacheWrite !== undefined
      ? { "gen_ai.usage.cache_creation.input_tokens": usage.cacheWrite }
      : {}),
    ...(args.finishReason?.unified
      ? { "gen_ai.response.finish_reasons": [args.finishReason.unified] }
      : {}),
    ...(args.finishReason?.raw
      ? { "kortyx.finish_reason.raw": args.finishReason.raw }
      : {}),
    ...(args.warnings?.length
      ? { "kortyx.warning.count": args.warnings.length }
      : {}),
  };
};

export const startAttributes = (
  args: ReasonTraceSpanStartArgs,
  options: OpenTelemetryTraceAdapterOptions,
): ReasonTraceAttributes => ({
  ...(options.defaultAttributes ?? {}),
  ...(args.attributes ?? {}),
  ...telemetryAttributes(args.telemetry, options, "input"),
});

export const applyAttributeMapping = (
  name: string,
  attributes: ReasonTraceAttributes,
  options: OpenTelemetryTraceAdapterOptions,
  args: Omit<
    Parameters<
      NonNullable<OpenTelemetryTraceAdapterOptions["mapAttributes"]>
    >[0],
    "name" | "attributes"
  >,
): ReasonTraceAttributes => {
  const mapped =
    options.mapAttributes?.({
      ...args,
      name,
      attributes,
    }) ?? {};
  return normalizeKnownAttributes({ ...attributes, ...mapped });
};
