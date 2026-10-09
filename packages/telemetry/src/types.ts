import type {
  KortyxTelemetryConfig,
  KortyxTelemetryEvent,
  KortyxTelemetryService,
} from "@kortyx/hooks";

export type CreateKortyxTelemetryAdapterOptions = {
  endpoint: string;
  apiKey: string;
  environment: string;
  service: KortyxTelemetryService;
  /** Optional replacement or suppression of captured error diagnostics. */
  error?: import("@kortyx/hooks").KortyxTraceErrorProjection;
  /** Opt in to complete redacted diagnostics stored by Studio's diagnostic API. */
  diagnostics?: {
    enabled: boolean;
    /** Optional secure persistent queue for Node process-restart recovery. */
    spoolDirectory?: string;
    maxQueueBytes?: number;
  };
  captureContent?: KortyxTelemetryConfig["captureContent"] | undefined;
  metadata?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
  flushIntervalMs?: number | undefined;
  maxQueueSize?: number | undefined;
  fetch?: typeof globalThis.fetch | undefined;
};

export type KortyxTelemetryAdapter = KortyxTelemetryConfig & {
  flush: () => Promise<void>;
  flushDiagnostics: (timeoutMs?: number) => Promise<{
    timedOut: boolean;
    pending: number;
    pendingBytes: number;
    dropped: number;
    states: Record<string, import("./diagnostics").DiagnosticDeliveryState>;
  }>;
  getDroppedEventCount: () => number;
  getPermanentDeliveryFailureCount: () => number;
  getDiagnosticDeliveryState: (
    id: string,
  ) => import("./diagnostics").DiagnosticDeliveryState | undefined;
  getDroppedDiagnosticCount: () => number;
};

/** Internal trace identifiers carried by the adapter's async context. */
export type SpanContext = {
  traceId: string;
  spanId: string;
};

export type ActiveSpan = SpanContext & {
  name?: string | undefined;
  correlation: KortyxTelemetryEvent["correlation"];
};
