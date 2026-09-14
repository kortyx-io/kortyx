import { isControlFlowError, serializeFailure } from "@kortyx/core/errors";
import type { ReasonTraceSpan, ReasonTraceSpanEndArgs } from "@kortyx/hooks";
import { type Span, SpanStatusCode } from "@opentelemetry/api";
import {
  applyAttributeMapping,
  normalizeKnownAttributes,
  telemetryAttributes,
  toAttributes,
  usageAttributes,
} from "./attributes";
import type { OpenTelemetryTraceAdapterOptions } from "./types";

export type OpenTelemetryReasonSpan = ReasonTraceSpan & { ended: boolean };

export const createSpanWrapper = (
  span: Span,
  name: string,
  options: OpenTelemetryTraceAdapterOptions,
): OpenTelemetryReasonSpan => {
  const wrapper: OpenTelemetryReasonSpan = {
    ended: false,
    setAttributes: (attributes) => {
      span.setAttributes(toAttributes(normalizeKnownAttributes(attributes)));
    },
    addEvent: (eventName, attributes) => {
      span.addEvent(
        eventName,
        toAttributes(
          applyAttributeMapping(name, attributes ?? {}, options, {
            phase: "event",
          }),
        ),
      );
    },
    end: (args) => {
      if (wrapper.ended) return;
      const attributes = spanEndAttributes(args, options);
      span.setAttributes(
        toAttributes(
          applyAttributeMapping(name, attributes, options, {
            phase: "end",
            telemetry: args?.telemetry,
            end: args,
          }),
        ),
      );
      wrapper.ended = true;
      span.end();
      const spanContext = span.spanContext();
      options.onSpanEnd?.({
        name,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      });
    },
    fail: (error, args) => {
      if (isControlFlowError(error)) {
        span.setAttribute("kortyx.control_flow", true);
        wrapper.end?.(args);
        return;
      }
      const failure = serializeFailure(error);
      const message = failure.message;
      span.recordException({ name: failure.code, message });
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      const attributes = spanErrorAttributes(error, args);
      span.setAttributes(
        toAttributes(
          applyAttributeMapping(name, attributes, options, {
            phase: "error",
            telemetry: args?.telemetry,
            end: args,
            error,
          }),
        ),
      );
      wrapper.end?.(args);
    },
  };
  return wrapper;
};

const spanEndAttributes = (
  args: ReasonTraceSpanEndArgs | undefined,
  options: OpenTelemetryTraceAdapterOptions,
) => ({
  ...(args?.attributes ?? {}),
  ...usageAttributes(args),
  ...telemetryAttributes(args?.telemetry, options, "output"),
});

const spanErrorAttributes = (
  error: unknown,
  args: ReasonTraceSpanEndArgs | undefined,
) => {
  const failure = serializeFailure(error);
  const message = failure.message;
  return {
    ...(args?.attributes ?? {}),
    "error.type": failure.code,
    "kortyx.error.category": failure.category,
    "error.message": message,
    ...usageAttributes(args),
  };
};
