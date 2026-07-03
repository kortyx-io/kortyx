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
  captureContent?: KortyxTelemetryConfig["captureContent"] | undefined;
  metadata?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
  flushIntervalMs?: number | undefined;
  maxQueueSize?: number | undefined;
  fetch?: typeof globalThis.fetch | undefined;
};

export type KortyxTelemetryAdapter = KortyxTelemetryConfig & {
  flush: () => Promise<void>;
  getDroppedEventCount: () => number;
  getPermanentDeliveryFailureCount: () => number;
};

/** Internal trace identifiers carried by the adapter's async context. */
export type SpanContext = {
  traceId: string;
  spanId: string;
};

export type ActiveSpan = SpanContext & {
  correlation: KortyxTelemetryEvent["correlation"];
};
