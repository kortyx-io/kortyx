import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createKortyxTelemetryAdapter,
} = require("../../packages/telemetry/dist/index.js");
const {
  createAgent,
  createChatRouteHandler,
  createFailureResponse,
} = require("../../packages/agent/dist/index.js");
const {
  assertProviderResponse,
} = require("../../packages/core/dist/errors.js");
const {
  createInMemoryFrameworkAdapter,
} = require("../../packages/runtime/dist/index.js");

const apiUrl = process.env.KORTYX_API_URL ?? "http://127.0.0.1:6458";
const writer = process.env.KORTYX_TELEMETRY_API_KEY;
const reader = process.env.KORTYX_STUDIO_API_KEY;
assert(
  writer && reader,
  "Provide fixture telemetry and diagnostic read credentials.",
);
const manifests = [];
const adapter = createKortyxTelemetryAdapter({
  endpoint: apiUrl,
  apiKey: writer,
  environment: "development",
  service: { name: "diagnostic-manual-e2e" },
  diagnostics: { enabled: true },
  flushIntervalMs: 60000,
  fetch: async (url, init) => {
    if (new URL(url).pathname === "/v1/telemetry/diagnostics")
      manifests.push(JSON.parse(init.body));
    return fetch(url, init);
  },
});
const providerBody = JSON.stringify({
  error: {
    message: "rejected schema: unsupported response_format",
    code: "invalid_response_format",
  },
  metadata: { raw: { rejection: "MANUAL_PROVIDER_REJECTION" } },
  responseBody: "ü".repeat(60 * 1024),
  token: "CREDENTIAL_MUST_NOT_SURVIVE",
});
const provider = createServer((_req, res) => {
  res.writeHead(400, {
    "content-type": "application/json",
    "x-request-id": "provider-request-fixture",
    "set-cookie": "credential-cookie",
  });
  res.end(providerBody);
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
let providerError;
try {
  await assertProviderResponse(
    "openai",
    await fetch(`http://127.0.0.1:${provider.address().port}`),
    "invoke",
  );
} catch (error) {
  providerError = error;
}
await new Promise((resolve) => provider.close(resolve));
assert(providerError);
let deep = providerError;
for (let index = 0; index < 16; index++)
  deep = new Error(`cause ${index}`, { cause: deep });
const original = Object.assign(
  new AggregateError(
    [deep, new Error("second aggregate member")],
    `Provider rejected the Brief specialist request. ${"M".repeat(9000)}`,
    { cause: deep },
  ),
  {
    status: 400,
    responseBody: "ü".repeat(60 * 1024),
    metadata: {
      raw: {
        rejection: "MANUAL_PROVIDER_REJECTION",
        apiKey: "CREDENTIAL_MUST_NOT_SURVIVE",
      },
    },
  },
);
original.stack = `AggregateError: diagnostic fixture\n${"S".repeat(40000)}`;
original.metadata.raw.circular = original;
const workflow = {
  id: "manual-error-diagnostic",
  version: "1",
  nodes: {
    brief: {
      run: async () => {
        throw original;
      },
    },
  },
  edges: [
    ["__start__", "brief"],
    ["brief", "__end__"],
  ],
};
const agent = createAgent({
  workflows: [workflow],
  defaultWorkflowId: workflow.id,
  frameworkAdapter: createInMemoryFrameworkAdapter(),
  telemetry: adapter,
});
const route = createChatRouteHandler({ agent });
const sse = await route(
  new Request("http://consumer.test/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "run" }],
      sessionId: "manual-error-session",
    }),
  }),
);
const publicSse = await sse.text();
const publicHttp = await createFailureResponse(original).text();
for (const publicBytes of [publicSse, publicHttp]) {
  assert(!publicBytes.includes("MANUAL_PROVIDER_REJECTION"));
  assert(!publicBytes.includes("CREDENTIAL_MUST_NOT_SURVIVE"));
  assert(!publicBytes.includes("S".repeat(1000)));
}
await adapter.flush();
const manifest = manifests.find(
  (value) =>
    value.correlation.nodeId === "brief" &&
    value.summary.type === "AggregateError",
);
assert(
  manifest,
  "Native agent node failure must retain its original diagnostic.",
);
const response = await fetch(
  `${apiUrl}/v1/studio/diagnostics/${manifest.diagnosticId}?env=development`,
  { headers: { authorization: `Bearer ${reader}` } },
);
assert.equal(response.status, 200);
const diagnostic = await response.json();
assert.equal(diagnostic.state, "available");
assert.equal(diagnostic.content.capture.status, "complete");
assert.equal(diagnostic.content.data.responseBody, original.responseBody);
assert.equal(diagnostic.content.data.message, original.message);
assert.equal(diagnostic.content.data.stack, original.stack);
let cause = diagnostic.content.data.cause;
for (let index = 0; index < 16; index++) cause = cause.cause;
assert.equal(
  cause.providerResponse.body,
  providerBody.replace('"CREDENTIAL_MUST_NOT_SURVIVE"', '"[REDACTED]"'),
);
assert.equal(
  diagnostic.content.data.errors[1].message,
  "second aggregate member",
);
assert.equal(diagnostic.content.data.metadata.raw.circular.$ref, "#/data");
assert(!JSON.stringify(diagnostic).includes("CREDENTIAL_MUST_NOT_SURVIVE"));
assert(
  diagnostic.manifest.correlation.runId &&
    diagnostic.manifest.correlation.traceId &&
    diagnostic.manifest.correlation.spanId,
);
// Simulate a transport interruption after the first native part is stored.
const interrupted = createKortyxTelemetryAdapter({
  endpoint: apiUrl,
  apiKey: writer,
  environment: "development",
  service: { name: "diagnostic-manual-e2e" },
  diagnostics: { enabled: true },
  flushIntervalMs: 60000,
  fetch: async (url, init) => {
    if (
      new URL(url).pathname.endsWith("/parts") &&
      JSON.parse(init.body).index === 1
    )
      return new Response(null, { status: 503 });
    return fetch(url, init);
  },
});
const incompleteDiagnosticId = interrupted.trace.reportError(
  Object.assign(new Error("Interrupted diagnostic upload"), {
    responseBody: "X".repeat(90000),
  }),
);
const interruptedFlush = await interrupted.flushDiagnostics();
assert.equal(interruptedFlush.pending, 1);
const incompleteResponse = await fetch(
  `${apiUrl}/v1/studio/diagnostics/${incompleteDiagnosticId}?env=development`,
  { headers: { authorization: `Bearer ${reader}` } },
);
const incomplete = await incompleteResponse.json();
assert.equal(incomplete.state, "pending");
assert.equal(incomplete.receivedParts, 1);
assert.equal(incomplete.content, null);
const proof = {
  incompleteDiagnosticId,
  incompleteStudioUrl: `http://localhost:6358/diagnostics/${incompleteDiagnosticId}?env=development`,
  diagnosticId: manifest.diagnosticId,
  runId: manifest.correlation.runId,
  environment: "development",
  studioUrl: `http://localhost:6358/diagnostics/${manifest.diagnosticId}?env=development`,
  retainedBytes: diagnostic.contentByteLength,
  parts: manifest.partCount,
  causeDepth: 17,
  status: "available",
  capture: "complete",
  publicHttpSafe: true,
  publicSseSafe: true,
};
await writeFile(
  process.env.KORTYX_DIAGNOSTIC_FIXTURE_OUTPUT ??
    "/tmp/kortyx-diagnostic-manual-proof.json",
  JSON.stringify(proof, null, 2),
);
console.log(JSON.stringify(proof, null, 2));
