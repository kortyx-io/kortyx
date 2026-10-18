import type { TelemetryDb } from "@kortyx/telemetry-db";
import { expect, it } from "vitest";
import { createApiApp } from "../src/app";

it("documents prompt serving, mutation and detail routes", () => {
  const app = createApiApp({ db: {} as TelemetryDb, apiKeyPepper: "test" });
  const document = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "test", version: "1" },
  });
  expect(document.paths).toHaveProperty("/v1/prompts/resolve");
  expect(document.paths).toHaveProperty("/v1/studio/prompts/actions");
});
