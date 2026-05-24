import type {
  KortyxTelemetryPrompt,
  KortyxTraceMetadata,
  ReasonTraceAttributes,
  ReasonTraceSpanEndArgs,
} from "@kortyx/hooks";
import type { Tracer } from "@opentelemetry/api";

export type OpenTelemetryTracePhase = "start" | "end" | "event" | "error";

export interface OpenTelemetryMapAttributesArgs {
  phase: OpenTelemetryTracePhase;
  name: string;
  attributes: ReasonTraceAttributes;
  telemetry?: KortyxTraceMetadata | undefined;
  end?: ReasonTraceSpanEndArgs | undefined;
  error?: unknown;
}

export interface OpenTelemetrySpanStartInfo {
  name: string;
  traceId: string;
  spanId: string;
  attributes: ReasonTraceAttributes;
}

export interface OpenTelemetrySpanEndInfo {
  name: string;
  traceId: string;
  spanId: string;
}

export interface OpenTelemetryTraceAdapterOptions {
  tracer?: Tracer | undefined;
  instrumentationName?: string | undefined;
  instrumentationVersion?: string | undefined;
  defaultAttributes?: ReasonTraceAttributes | undefined;
  captureContent?:
    | boolean
    | {
        input?: boolean | undefined;
        output?: boolean | undefined;
      }
    | undefined;
  mapAttributes?:
    | ((
        args: OpenTelemetryMapAttributesArgs,
      ) => ReasonTraceAttributes | undefined)
    | undefined;
  mapPromptMetadata?:
    | ((prompt: KortyxTelemetryPrompt) => ReasonTraceAttributes | undefined)
    | undefined;
  onSpanStart?: ((args: OpenTelemetrySpanStartInfo) => void) | undefined;
  onSpanEnd?: ((args: OpenTelemetrySpanEndInfo) => void) | undefined;
}
