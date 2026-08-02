import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createInMemoryStudioChangeBus } from "../src/realtime/studio-change-bus";
import { registerStudioChangeRoutes } from "../src/routes/studio-changes";
import type { ApiEnv } from "../src/types";

const readChunk = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> => {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
};

describe("Studio change stream", () => {
  it("streams only requested project resources and sends proxy-safe headers", async () => {
    const app = new OpenAPIHono<ApiEnv>();
    const bus = createInMemoryStudioChangeBus();
    app.use("*", async (c, next) => {
      c.set("auth", {
        keyId: "key-1",
        organizationId: "org-1",
        projectId: "project-1",
        mode: "test",
        scopes: ["studio:read"],
      });
      await next();
    });
    registerStudioChangeRoutes(app, bus);
    const abort = new AbortController();

    const response = await app.request(
      new Request("http://localhost/v1/studio/changes?resources=runs", {
        signal: abort.signal,
      }),
    );
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    if (!reader) throw new Error("SSE response has no body.");

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await readChunk(reader)).toContain("event: ready");

    bus.publish({
      schemaVersion: 1,
      changeId: "ignored-project",
      emittedAt: "2026-01-01T00:00:00.000Z",
      organizationId: "org-1",
      projectId: "project-2",
      resources: ["runs"],
    });
    bus.publish({
      schemaVersion: 1,
      changeId: "ignored-resource",
      emittedAt: "2026-01-01T00:00:00.000Z",
      organizationId: "org-1",
      projectId: "project-1",
      resources: ["sessions"],
    });
    bus.publish({
      schemaVersion: 1,
      changeId: "accepted",
      emittedAt: "2026-01-01T00:00:00.000Z",
      organizationId: "org-1",
      projectId: "project-1",
      resources: ["runs"],
    });

    const chunk = await readChunk(reader);
    expect(chunk).toContain("event: change");
    expect(chunk).toContain("accepted");
    expect(chunk).not.toContain("ignored");

    abort.abort();
    await reader.cancel();
  });
});
