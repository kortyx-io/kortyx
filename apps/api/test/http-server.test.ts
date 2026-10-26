import assert from "node:assert/strict";
import { once } from "node:events";
import { Agent, createServer, get, Server } from "node:http";
import type { Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { startApiHttpServer } from "../src/http-server";
import { createInMemoryStudioChangeBus } from "../src/realtime/studio-change-bus";
import { registerHealthRoutes } from "../src/routes/health";
import { registerStudioChangeRoutes } from "../src/routes/studio-changes";
import { drainServer } from "../src/shutdown";
import type { ApiEnv } from "../src/types";

async function start(app: OpenAPIHono<ApiEnv>) {
  const server = startApiHttpServer({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: 0,
  });
  assert(server instanceof Server);
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function request(url: string, agent: Agent) {
  return new Promise<{
    status: number | undefined;
    body: string;
    socket: Socket | null;
    reused: boolean;
  }>((resolve, reject) => {
    const req = get(
      url,
      { agent, signal: AbortSignal.timeout(2_000) },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            body,
            socket: req.socket,
            reused: req.reusedSocket,
          }),
        );
      },
    );
    req.on("error", reject);
  });
}

describe("API HTTP adapter", () => {
  it("reuses the same connection beyond Node's former default idle cutoff and drains it promptly", async () => {
    const app = new OpenAPIHono<ApiEnv>();
    let ready = true;
    registerHealthRoutes(app, async () => {
      if (!ready) throw new Error("Draining");
    });
    const { server, origin } = await start(app);
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      expect(server.keepAliveTimeout).toBe(70_000);
      const defaults = createServer();
      expect(server.requestTimeout).toBe(defaults.requestTimeout);
      expect(server.headersTimeout).toBe(defaults.headersTimeout);
      expect(server.timeout).toBe(defaults.timeout);
      const first = await request(`${origin}/ready`, agent);
      assert(first.socket);
      expect(first.status).toBe(200);
      expect(JSON.parse(first.body)).toEqual({
        status: "ok",
        service: "kortyx-api",
      });

      // Real time and sockets: Node 22.19+ normally closes at 5s + its 1s buffer.
      // An agent silently opening a replacement connection must not pass this test.
      await delay(7_500);
      const second = await request(`${origin}/ready`, agent);
      expect(second.status).toBe(200);
      expect(second.socket).toBe(first.socket);
      expect(second.reused).toBe(true);

      ready = false;
      expect((await request(`${origin}/ready`, agent)).status).toBe(503);
      expect((await request(`${origin}/live`, agent)).status).toBe(200);
      // Shutdown must reap idle keep-alive sockets without waiting 70 seconds.
      await expect(drainServer(server, 1_000)).resolves.toBeUndefined();
    } finally {
      agent.destroy();
      await close(server);
    }
  }, 20_000);

  it("keeps an active Studio SSE stream usable during HTTP draining", async () => {
    const app = new OpenAPIHono<ApiEnv>();
    const bus = createInMemoryStudioChangeBus();
    app.use("*", async (c, next) => {
      c.set("principal", {
        kind: "api-key",
        keyId: "test-key",
        organizationId: "org",
        projectId: "project",
        mode: "test",
        scopes: ["studio:read"],
      });
      c.set("revalidateStreamAccess", async () => {});
      await next();
    });
    registerStudioChangeRoutes(app, bus);
    const { server, origin } = await start(app);
    const abort = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let draining: Promise<void> | undefined;
    try {
      const response = await fetch(
        `${origin}/v1/studio/changes?resources=runs`,
        { signal: abort.signal },
      );
      assert(response.body);
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      expect(decoder.decode((await reader.read()).value)).toContain(
        "event: ready",
      );
      let drained = false;
      draining = drainServer(server, 2_000).then(() => {
        drained = true;
      });
      // Attach a rejection handler immediately; still await the original below.
      void draining.catch(() => {});
      await delay(25);
      expect(drained).toBe(false);
      bus.publish({
        schemaVersion: 1,
        changeId: "during-drain",
        emittedAt: new Date().toISOString(),
        organizationId: "org",
        projectId: "project",
        resources: ["runs"],
      });
      expect(decoder.decode((await reader.read()).value)).toContain(
        "during-drain",
      );
      abort.abort();
      await reader.cancel().catch(() => {});
      await expect(draining).resolves.toBeUndefined();
    } finally {
      abort.abort();
      await reader?.cancel().catch(() => {});
      await close(server);
      await draining?.catch(() => {});
    }
  });
});
