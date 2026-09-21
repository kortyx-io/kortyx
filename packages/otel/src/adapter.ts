import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ReasonTraceAdapter,
  ReasonTraceAttributes,
  ReasonTraceSpan,
  ReasonTraceSpanStartArgs,
} from "@kortyx/hooks";
import {
  exceptionDiagnostics,
  safeTelemetryMetadata,
} from "@kortyx/hooks/internal";
import { context, type Span, SpanKind, trace } from "@opentelemetry/api";
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
  const activeSpans = new AsyncLocalStorage<Span>();

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
    try {
      options.onSpanStart?.({
        name: args.name,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        attributes,
      });
    } catch {}
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
          try {
            options.onSpanStart?.({
              name: args.name,
              traceId: spanContext.traceId,
              spanId: spanContext.spanId,
              attributes,
            });
          } catch {}
          return activeSpans.run(span, async () => {
            try {
              const result = await fn(wrapped);
              if (!wrapped.ended) wrapped.end?.();
              return result;
            } catch (error) {
              try {
                wrapped.fail?.(error);
              } catch {
                /* Preserve the callback failure. */
              }
              throw error;
            }
          });
        },
      );
    },
    getActiveContext: () => {
      const span = activeSpans.getStore() ?? trace.getActiveSpan();
      if (!span) return undefined;
      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    },
    reportError: (error, reportOptions = {}) => {
      try {
        const span = activeSpans.getStore() ?? trace.getActiveSpan();
        if (!span) return;
        const diagnostic = exceptionDiagnostics(error, options.error);
        if (!diagnostic) return;
        span.recordException({
          name: diagnostic.type ?? "Error",
          message: diagnostic.message,
          ...(diagnostic.stack ? { stack: diagnostic.stack } : {}),
        });
        span.addEvent(
          "kortyx.error.reported",
          toAttributes({
            "exception.type": diagnostic.type ?? "Error",
            "exception.message": diagnostic.message,
            ...(diagnostic.stack
              ? { "exception.stacktrace": diagnostic.stack }
              : {}),
            ...(diagnostic.cause
              ? { "kortyx.error.cause": diagnostic.cause }
              : {}),
            "exception.escaped": false,
            "kortyx.error.handled": true,
            "kortyx.error.severity":
              reportOptions.severity === "warning" ? "warning" : "error",
            ...(reportOptions.tags?.length
              ? { "kortyx.trace.tags": reportOptions.tags }
              : {}),
            ...(reportOptions.metadata
              ? Object.fromEntries(
                  Object.entries(
                    safeTelemetryMetadata(reportOptions.metadata),
                  ).map(([key, value]) => [
                    `kortyx.error.metadata.${key}`,
                    value,
                  ]),
                )
              : {}),
          }),
        );
      } catch {
        // Error reporting is an observer and cannot change execution.
      }
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
