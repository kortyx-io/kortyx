import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";

process.env.KORTYX_USAGE_TELEMETRY_DISABLED = "1";
const root = resolve(import.meta.dirname, "../../..");
const published = createRequire(
  resolve(root, "node_modules/.cache/kortyx-retirement-release/package.json"),
);
const current = createRequire(resolve(root, "packages/agent/package.json"));
const { createEvals, createEvalRouteHandler, getEvalSuiteRevision } =
  current("./dist/index.js");
const { createInMemoryEvalExecutionStore } = published("@kortyx/runtime");
const store = createInMemoryEvalExecutionStore();
assert.equal(store.queued, undefined);
assert.equal(store.claimQueued, undefined);
const suite = {
  id: "mixed-runtime",
  cases: [
    { id: "one", steps: [{ message: "hello", expect: { type: "answer" } }] },
  ],
};
let executed = 0;
const serviceKey = "disposable-mixed-runtime-service-key-only";
const handler = createEvalRouteHandler({
  serviceKey,
  executionStore: store,
  evals: createEvals({
    agent: {},
    suites: [suite],
    execute: async () => {
      executed++;
      return { observation: { type: "answer", text: "ok", structured: [] } };
    },
  }),
});
try {
  const response = await handler(
    new Request("http://fixture/evals", {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        "x-kortyx-eval-protocol": "jobs-v1",
        "x-kortyx-eval-generation": await store.generation(),
        "x-kortyx-eval-submitted-at": new Date().toISOString(),
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        repetitions: 1,
        concurrency: 1,
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /"type":"result"/);
  assert.equal(executed, 1);
  await assert.rejects(handler.drain(), /queued and claimQueued/);
  console.log(
    "PASS: candidate agent executes on published runtime 0.25.0; drain explicitly refuses unsupported store capabilities",
  );
} finally {
  await handler.close();
}
