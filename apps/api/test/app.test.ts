import type { TelemetryDb } from "@kortyx/telemetry-db";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../src/app";

describe("Kortyx API app", () => {
  it("serves health checks", async () => {
    const app = createApiApp({
      db: {} as TelemetryDb,
      apiKeyPepper: "test-pepper",
    });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "kortyx-api",
    });
  });

  it("serves OpenAPI document", async () => {
    const app = createApiApp({
      db: {} as TelemetryDb,
      apiKeyPepper: "test-pepper",
    });

    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { info: { title: string } };
    expect(body.info.title).toBe("Kortyx Telemetry API");
  });

  it("documents telemetry ingestion and Studio read endpoints", async () => {
    const app = createApiApp({
      db: {} as TelemetryDb,
      apiKeyPepper: "test-pepper",
    });

    const response = await app.request("/openapi.json");
    const body = (await response.json()) as {
      paths: Record<string, unknown>;
    };

    expect(body.paths).toHaveProperty(
      "/v1/telemetry/workflow-revisions:ensure",
    );
    expect(body.paths).toHaveProperty("/v1/telemetry/events:batch");
    expect(body.paths).toHaveProperty("/v1/studio/runs");
    expect(body.paths).toHaveProperty("/v1/studio/runs/{runId}");
    expect(body.paths).toHaveProperty("/v1/studio/sessions");
    expect(body.paths).toHaveProperty("/v1/studio/sessions/{sessionId}");
    expect(body.paths).toHaveProperty("/v1/studio/interrupts");
    expect(body.paths).toHaveProperty("/v1/studio/interrupts/{interruptId}");
    expect(body.paths).toHaveProperty("/v1/studio/workflows");
    expect(body.paths).toHaveProperty("/v1/studio/catalogs");
    expect(body.paths).toHaveProperty("/v1/studio/changes");
  });

  it("protects the Studio change stream with Studio API-key auth", async () => {
    const app = createApiApp({
      db: {} as TelemetryDb,
      apiKeyPepper: "test-pepper",
    });

    const response = await app.request("/v1/studio/changes");

    expect(response.status).toBe(401);
  });
});
