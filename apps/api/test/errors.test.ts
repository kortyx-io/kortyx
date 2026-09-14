import { TelemetryNotFoundError } from "@kortyx/telemetry-db";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { apiErrorHandler } from "../src/errors";
import type { ApiEnv } from "../src/types";

it("keeps not-found and internal failures distinct with request correlation", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const app = new Hono<ApiEnv>();
    app.use("*", async (context, next) => {
      context.set("requestId", "request-test");
      await next();
    });
    app.onError(apiErrorHandler);
    app.get("/missing", () => {
      throw new TelemetryNotFoundError("Run not found.");
    });
    app.get("/failed", () => {
      throw new Error("private database URI");
    });
    const missing = await app.request("/missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      requestId: "request-test",
      message: "Run not found.",
    });
    const failed = await app.request("/failed");
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({
      error: "INTERNAL_SERVER_ERROR",
      requestId: "request-test",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private database URI",
    );
  } finally {
    log.mockRestore();
  }
});
