import { randomUUID } from "node:crypto";
import type {
  EnsureWorkflowTopologyResponse,
  KortyxTelemetryEvent,
} from "@kortyx/hooks";
import { createDelivery, TelemetryHttpError } from "./delivery";
import { createEventMapper } from "./event-mapper";
import { createTopologyResolver } from "./topology";
import { createTraceAdapter } from "./trace";
import type {
  CreateKortyxTelemetryAdapterOptions,
  KortyxTelemetryAdapter,
} from "./types";

export type {
  CreateKortyxTelemetryAdapterOptions,
  KortyxTelemetryAdapter,
} from "./types";

const DEFAULT_FLUSH_INTERVAL_MS = 250;
const DEFAULT_MAX_QUEUE_SIZE = 1_000;

const createId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const endpointFor = (endpoint: string, path: string): string =>
  `${endpoint.replace(/\/$/, "")}${path}`;

/**
 * Creates the optional Kortyx Studio HTTP adapter. Execution paths only enqueue
 * telemetry; delivery remains best-effort and cannot fail a workflow.
 */
export function createKortyxTelemetryAdapter(
  options: CreateKortyxTelemetryAdapterOptions,
): KortyxTelemetryAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "createKortyxTelemetryAdapter requires a fetch implementation.",
    );
  }

  const send = async (path: string, body: unknown): Promise<Response> => {
    const response = await fetchImpl(endpointFor(options.endpoint, path), {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new TelemetryHttpError(response.status);
    return response;
  };

  const delivery = createDelivery({
    maxQueueSize: options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
    flushIntervalMs: options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    send: async (events) => {
      await send("/v1/telemetry/events:batch", { events });
    },
  });
  const eventMapper = createEventMapper({
    environment: options.environment,
    service: options.service,
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.tags ? { tags: options.tags } : {}),
    createId,
  });
  const topology = createTopologyResolver({
    ensure: async (snapshot) => {
      const response = await send(
        "/v1/telemetry/workflow-revisions:ensure",
        snapshot,
      );
      return (await response.json()) as EnsureWorkflowTopologyResponse;
    },
  });
  const trace = createTraceAdapter({
    ...(options.captureContent
      ? { captureContent: options.captureContent }
      : {}),
    createId,
    enqueue: delivery.enqueue,
    eventMapper,
  });
  const emit = async (events: KortyxTelemetryEvent[]): Promise<void> => {
    for (const event of events) delivery.enqueue(event);
  };

  return {
    trace,
    reporter: {
      ensureWorkflowTopology: topology.ensureWorkflowTopology,
      emit,
      getWorkflowRevisionId: topology.getWorkflowRevisionId,
    },
    environment: options.environment,
    service: options.service,
    ...(options.captureContent
      ? { captureContent: options.captureContent }
      : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.tags ? { tags: options.tags } : {}),
    flush: delivery.flush,
    getDroppedEventCount: delivery.getDroppedEventCount,
    getPermanentDeliveryFailureCount: delivery.getPermanentDeliveryFailureCount,
  };
}
