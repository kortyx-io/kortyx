import type { TelemetryDb } from "@kortyx/telemetry-db";
import {
  createUsageTelemetry,
  type UsageRecord,
} from "@kortyx/usage-telemetry";
import { expect, it } from "vitest";
import { createApiApp } from "../src/app";

it("records rejected API operations independently of health probes without customer URLs or credentials", async () => {
  const records: UsageRecord[] = [];
  const usage = createUsageTelemetry({
    context: { product: "oss_studio", component: "api", version: "1.0.0" },
    identity: () => crypto.randomUUID(),
    transport: async (batch) => {
      records.push(...batch);
    },
  });
  const app = createApiApp({
    db: {} as TelemetryDb,
    apiKeyPepper: "private-pepper",
    usage,
  });
  expect((await app.request("/health")).status).toBe(200);
  expect(
    (
      await app.request(
        "/v1/studio/runs/private-customer-id?search=private-query",
      )
    ).status,
  ).toBe(401);
  await usage.flush();
  usage.dispose();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    operation: "studio.read",
    outcome: "failed",
    properties: {
      origin: "server",
      resource: "runs",
      http_status: "401",
      error_code: "HTTP_UNAUTHORIZED",
      error_category: "request",
      retryable: false,
    },
    count: 1,
  });
  expect(JSON.stringify(records)).not.toContain("private-");
});
