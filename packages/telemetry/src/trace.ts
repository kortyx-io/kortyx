import { AsyncLocalStorage } from "node:async_hooks";
import type {
  KortyxTelemetryConfig,
  KortyxTelemetryEvent,
  ReasonTraceAdapter,
  ReasonTraceSpan,
  ReasonTraceSpanEndArgs,
  ReasonTraceSpanStartArgs,
} from "@kortyx/hooks";
import type { createEventMapper } from "./event-mapper";
import type { ActiveSpan, SpanContext } from "./types";

/** Maps generic SDK trace calls to Kortyx Studio's span and generation facts. */
export const createTraceAdapter = (args: {
  captureContent?: KortyxTelemetryConfig["captureContent"] | undefined;
  createId: () => string;
  enqueue: (event: KortyxTelemetryEvent) => void;
  eventMapper: ReturnType<typeof createEventMapper>;
}): ReasonTraceAdapter => {
  const activeSpans = new AsyncLocalStorage<ActiveSpan>();

  const createSpan = (
    startArgs: ReasonTraceSpanStartArgs,
  ): { span: ReasonTraceSpan; active?: ActiveSpan | undefined } => {
    const parent = activeSpans.getStore();
    const span: SpanContext = {
      traceId: parent?.traceId ?? args.createId(),
      spanId: args.createId(),
    };
    const attributes = { ...(startArgs.attributes ?? {}) };
    const currentAttributes = { ...attributes };
    const correlation = args.eventMapper.correlationFrom(attributes, parent);
    const startedAt = Date.now();

    if (correlation) {
      args.enqueue(
        args.eventMapper.createEvent({
          type: "span.started",
          correlation,
          span,
          ...(parent ? { parentSpanId: parent.spanId } : {}),
          payload: {
            name: startArgs.name,
            attributes: currentAttributes,
            telemetry: args.eventMapper.telemetryPayload(startArgs.telemetry),
            ...(args.eventMapper.shouldCapture(
              startArgs.telemetry?.captureContent ?? args.captureContent,
              "input",
            )
              ? { input: startArgs.telemetry?.input }
              : {}),
          },
          context: args.eventMapper.spanContext(
            startArgs.telemetry,
            currentAttributes,
          ),
        }),
      );
    }

    let ended = false;
    const end = (endArgs?: ReasonTraceSpanEndArgs): void => {
      if (ended) return;
      ended = true;
      if (!correlation) return;

      const endAttributes = {
        ...currentAttributes,
        ...(endArgs?.attributes ?? {}),
      };
      const telemetry = endArgs?.telemetry ?? startArgs.telemetry;
      args.enqueue(
        args.eventMapper.createEvent({
          type: "span.ended",
          correlation,
          span,
          ...(parent ? { parentSpanId: parent.spanId } : {}),
          payload: {
            name: startArgs.name,
            attributes: endAttributes,
            durationMs: Date.now() - startedAt,
            telemetry: args.eventMapper.telemetryPayload(telemetry),
            ...(args.eventMapper.shouldCapture(
              endArgs?.telemetry?.captureContent ??
                startArgs.telemetry?.captureContent ??
                args.captureContent,
              "output",
            )
              ? { output: endArgs?.telemetry?.output }
              : {}),
          },
          context: args.eventMapper.spanContext(telemetry, endAttributes),
        }),
      );

      if (startArgs.name !== "runReasonEngine") return;
      args.enqueue(
        args.eventMapper.createEvent({
          type: "generation.completed",
          correlation,
          span,
          ...(parent ? { parentSpanId: parent.spanId } : {}),
          payload: {
            provider:
              args.eventMapper.stringValue(attributes.providerId) ?? "unknown",
            model:
              args.eventMapper.stringValue(attributes.modelId) ?? "unknown",
            ...(endArgs?.usage ? { usage: endArgs.usage } : {}),
            ...(endArgs?.finishReason
              ? { finishReason: endArgs.finishReason }
              : {}),
            ...(endArgs?.warnings ? { warnings: endArgs.warnings } : {}),
            ...(endArgs?.providerMetadata
              ? { providerMetadata: endArgs.providerMetadata }
              : {}),
          },
          context: args.eventMapper.spanContext(telemetry, currentAttributes),
        }),
      );
    };

    const traceSpan: ReasonTraceSpan = {
      setAttributes: (nextAttributes) => {
        Object.assign(currentAttributes, nextAttributes);
      },
      addEvent: (name, eventAttributes = {}) => {
        if (!correlation) return;
        const type =
          name === "useReason.tool-call.start"
            ? "tool.started"
            : name === "useReason.tool-call.complete"
              ? "tool.completed"
              : name === "useReason.tool-call.error"
                ? "tool.failed"
                : undefined;
        if (!type) return;
        args.enqueue(
          args.eventMapper.createEvent({
            type,
            correlation,
            span,
            ...(parent ? { parentSpanId: parent.spanId } : {}),
            payload: eventAttributes,
          }),
        );
      },
      end,
      fail: (error, endArgs) => {
        if (ended) return;
        if (correlation) {
          args.enqueue(
            args.eventMapper.createEvent({
              type: "span.failed",
              correlation,
              span,
              ...(parent ? { parentSpanId: parent.spanId } : {}),
              payload: {
                name: startArgs.name,
                error: args.eventMapper.asErrorPayload(error),
                durationMs: Date.now() - startedAt,
              },
            }),
          );
        }
        end(endArgs);
      },
    };

    return {
      span: traceSpan,
      ...(correlation ? { active: { ...span, correlation } } : {}),
    };
  };

  return {
    startSpan: (startArgs) => createSpan(startArgs).span,
    withSpan: async (startArgs, fn) => {
      const created = createSpan(startArgs);
      const run = async (): Promise<Awaited<ReturnType<typeof fn>>> => {
        try {
          const result = await fn(created.span);
          created.span.end?.();
          return result;
        } catch (error) {
          created.span.fail?.(error);
          throw error;
        }
      };
      return created.active ? activeSpans.run(created.active, run) : run();
    },
    getActiveContext: () => {
      const active = activeSpans.getStore();
      return active
        ? { traceId: active.traceId, spanId: active.spanId }
        : undefined;
    },
  };
};
