import type { KortyxTelemetryEvent } from "@kortyx/hooks";
import {
  createUsageTelemetry,
  type UsageRecord,
} from "@kortyx/usage-telemetry";
import { configureUsageTelemetry } from "@kortyx/usage-telemetry/node";
import { expect, it, vi } from "vitest";
import { createDelivery, TelemetryHttpError } from "../src/delivery";

it("measures exporter attempts and retry recovery separately without execution payloads", async () => {
  const records: UsageRecord[] = [];
  const usage = createUsageTelemetry({
    context: { product: "sdk", component: "telemetry", version: "1.0.0" },
    identity: () => crypto.randomUUID(),
    transport: async (batch) => {
      records.push(...batch);
    },
  });
  configureUsageTelemetry("exporter", usage);
  const send = vi
    .fn()
    .mockRejectedValueOnce(new TelemetryHttpError(503))
    .mockResolvedValue(undefined);
  const delivery = createDelivery({
    maxQueueSize: 5,
    flushIntervalMs: 60000,
    send,
  });
  delivery.enqueue({
    customerContent: "private-secret",
  } as unknown as KortyxTelemetryEvent);
  try {
    await delivery.flush();
    await delivery.flush();
    await usage.flush();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      outcome: "failed",
      properties: {
        measurement_kind: "attempt",
        error_code: "HTTP_SERVER_ERROR",
        retry_attempt: "1",
        retried: false,
        batch_size: "1",
      },
    });
    expect(records[1]).toMatchObject({
      outcome: "success",
      properties: { retried: true, recovered: true, retry_attempt: "2-5" },
    });
    expect(JSON.stringify(records)).not.toContain("private-secret");
  } finally {
    usage.dispose();
  }
});
