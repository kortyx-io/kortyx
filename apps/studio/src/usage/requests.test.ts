import {
  createUsageTelemetry,
  type UsageRecord,
} from "@kortyx/usage-telemetry";
import { afterEach, expect, it, vi } from "vitest";
import { evalRequest } from "@/features/evals/api/client";
import { promptRequest } from "@/features/prompts/api/client";
import { configureStudioUsage } from "./client";

vi.mock("@/lib/studio-fetch", () => ({
  studioFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
const config = {
  enabled: true,
  debug: false,
  product: "oss_studio",
  version: "1.0.0",
  environment: "production" as const,
  key: "phc_public",
  host: "https://eu.i.posthog.com",
};
afterEach(() => {
  configureStudioUsage({ ...config, enabled: false });
  vi.unstubAllGlobals();
});
function fixture() {
  const records: UsageRecord[] = [];
  const client = createUsageTelemetry({
    context: {
      product: "oss_studio",
      component: "studio_ui",
      version: "1.0.0",
    },
    identity: () => crypto.randomUUID(),
    transport: async (batch) => {
      records.push(...batch);
    },
  });
  configureStudioUsage(config, client);
  return { client, records };
}
it("preserves malformed HTTP response errors while classifying the HTTP failure before parsing", async () => {
  const f = fixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("not-json", { status: 502 })),
  );
  await expect(promptRequest("private-id")).rejects.toBeInstanceOf(Error);
  await f.client.flush();
  expect(f.records[0]).toMatchObject({
    outcome: "failed",
    operation: "studio.prompt",
    properties: { phase: "http", http_status: "502" },
  });
  expect(JSON.stringify(f.records)).not.toContain("private-id");
});
it("treats aborted browser reads as cancellation and rethrows the original fetch error", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  const error = new DOMException("private-message", "AbortError");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw error;
    }),
  );
  await expect(
    evalRequest("private-id", undefined, controller.signal),
  ).rejects.toBe(error);
  await f.client.flush();
  expect(f.records[0]?.outcome).toBe("cancelled");
  expect(JSON.stringify(f.records)).not.toContain("private-");
});
