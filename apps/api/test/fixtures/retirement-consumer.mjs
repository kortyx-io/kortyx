// Deterministic, disposable consumer for the local container proof. No providers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as pause } from "node:timers/promises";

const published = process.env.FIXTURE_SDK === "published";
const require = createRequire(
  published ? "/published/package.json" : "/app/apps/api/package.json",
);
const sdk = require(published ? "kortyx" : "@kortyx/agent");
const version = (name) =>
  JSON.parse(
    readFileSync(resolve(dirname(require.resolve(name)), "../package.json")),
  ).version;
if (published) {
  assert.equal(version("kortyx"), "0.32.0");
  assert.equal(version("@kortyx/agent"), "0.39.0");
  assert.equal(version("@kortyx/runtime"), "0.25.0");
}
const key = "disposable-container-retirement-service-key";
const calls = [];
const cleaned = [];
const gates = new Map();
const suites = ["held", "queued"].map((id) => ({
  id,
  cases: [0, 1].map((index) => ({
    id: `${id}-${index}`,
    steps: [{ message: `${id}-${index}`, expect: { type: "answer" } }],
  })),
}));
const handler = sdk.createEvalRouteHandler({
  serviceKey: key,
  maxActiveRuns: 4,
  evals: sdk.createEvals({
    agent: {},
    suites,
    execute: async ({ command, signal }) => {
      const message = command.type === "message" ? command.message : "resume";
      calls.push(message);
      const gate = gates.get(message);
      if (gate)
        await Promise.race([
          gate.promise,
          new Promise((done) => {
            if (signal.aborted) done();
            else signal.addEventListener("abort", done, { once: true });
          }),
        ]);
      return { observation: { type: "answer", text: "ok", structured: [] } };
    },
    teardown: async (context) => {
      await pause(300);
      cleaned.push(context.case.id);
    },
    judge: {
      id: "local",
      version: "1",
      location: "app",
      grade: () => ({
        passed: true,
        reason: "Deterministic fixture",
        evidence: [],
      }),
    },
  }),
});
const server = createServer(async (request, response) => {
  try {
    let text = "";
    for await (const chunk of request) text += chunk;
    if (request.url?.startsWith("/_fixture")) {
      if (request.headers.authorization !== `Bearer ${key}`) {
        response.writeHead(401);
        response.end();
        return;
      }
      const body = text ? JSON.parse(text) : {};
      if (request.url === "/_fixture/hold") {
        let release;
        const promise = new Promise((done) => {
          release = done;
        });
        gates.set(body.message, { promise, release });
      }
      if (request.url === "/_fixture/release") {
        for (const gate of gates.values()) gate.release();
        gates.clear();
      }
      if (request.url === "/_fixture/reset") {
        assert.equal(gates.size, 0);
        calls.length = 0;
        cleaned.length = 0;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          pid: process.pid,
          uid: process.getuid(),
          agent: version("@kortyx/agent"),
          runtime: version("@kortyx/runtime"),
          published,
          drainingSupported: typeof handler.drain === "function",
          calls,
          cleaned,
        }),
      );
      return;
    }
    const result = await handler(
      new Request(`http://consumer:6401${request.url}`, {
        method: request.method,
        headers: request.headers,
        ...(text ? { body: text } : {}),
      }),
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(response);
    else response.end();
  } catch {
    response.writeHead(500);
    response.end("Disposable consumer fixture failed");
  }
});
server.listen(6401, "0.0.0.0");
process.on("SIGTERM", async () => {
  for (const gate of gates.values()) gate.release();
  await handler.close();
  server.close();
  server.closeAllConnections();
});
