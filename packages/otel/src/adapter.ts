import type {
  ReasonTraceAdapter,
  ReasonTraceAttributes,
  ReasonTraceSpan,
  ReasonTraceSpanStartArgs,
} from "@kortyx/hooks";
import { context, SpanKind, trace } from "@opentelemetry/api";
import {
  applyAttributeMapping,
  startAttributes,
  toAttributes,
} from "./attributes";
import { createSpanWrapper } from "./span-wrapper";
import type { OpenTelemetryTraceAdapterOptions } from "./types";

export function createOpenTelemetryTraceAdapter(
  options: OpenTelemetryTraceAdapterOptions = {},
): ReasonTraceAdapter {
  const tracer =
    options.tracer ??
    trace.getTracer(
      options.instrumentationName ?? "kortyx",
      options.instrumentationVersion,
    );

  const start = (args: ReasonTraceSpanStartArgs): ReasonTraceSpan => {
    const attributes = startAttributes(args, options);
    const span = tracer.startSpan(
      args.name,
      {
        kind: SpanKind.INTERNAL,
        attributes: spanStartOtelAttributes(args, attributes, options),
      },
      context.active(),
    );
    const spanContext = span.spanContext();
    options.onSpanStart?.({
      name: args.name,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      attributes,
    });
    return createSpanWrapper(span, args.name, options);
  };

  return {
    startSpan: start,
    withSpan: async (args, fn) => {
      const attributes = startAttributes(args, options);
      return tracer.startActiveSpan(
        args.name,
        {
          kind: SpanKind.INTERNAL,
          attributes: spanStartOtelAttributes(args, attributes, options),
        },
        async (span) => {
          const wrapped = createSpanWrapper(span, args.name, options);
          const spanContext = span.spanContext();
          options.onSpanStart?.({
            name: args.name,
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
            attributes,
          });
          try {
            const result = await fn(wrapped);
            if (!wrapped.ended) wrapped.end?.();
            return result;
          } catch (error) {
            wrapped.fail?.(error);
            throw error;
          }
        },
      );
    },
    getActiveContext: () => {
      const span = trace.getActiveSpan();
      if (!span) return undefined;
      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    },
  };
}

const spanStartOtelAttributes = (
  args: ReasonTraceSpanStartArgs,
  attributes: ReasonTraceAttributes,
  options: OpenTelemetryTraceAdapterOptions,
) =>
  toAttributes(
    applyAttributeMapping(args.name, attributes, options, {
      phase: "start",
      telemetry: args.telemetry,
    }),
  );
