import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createAgent,
  createEvals,
} = require("../../packages/agent/dist/index.js");
const {
  DomainError,
  serializeFailure,
} = require("../../packages/core/dist/errors.js");
const {
  createInMemoryFrameworkAdapter,
} = require("../../packages/runtime/dist/index.js");
const {
  createKortyxTelemetryAdapter,
} = require("../../packages/telemetry/dist/index.js");
const {
  createTelemetryDbClient,
  ensureLocalDevelopmentProject,
} = require("../../packages/telemetry-db/dist/index.js");
const api = process.env.KORTYX_API_URL;
const writer = process.env.KORTYX_TELEMETRY_API_KEY;
const reader = process.env.KORTYX_STUDIO_API_KEY;
const database = process.env.DATABASE_URL;
assert(
  api && writer && reader && database,
  "Configure the disposable local API, database, writer and reader.",
);
for (const url of [api, database])
  assert(
    ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
    "This synthetic fixture is local-only.",
  );
const telemetry = createKortyxTelemetryAdapter({
  endpoint: api,
  apiKey: writer,
  environment: "development",
  service: { name: "eval-error-regression" },
  diagnostics: { enabled: true },
  flushIntervalMs: 60_000,
});
const body = "X".repeat(60 * 1024);
const original = Object.assign(
  new DomainError(
    "REVIEW_CARD_COUNT",
    "Expected exactly one pending review card",
    {
      details: { expected: 1, actual: 2 },
      cause: new Error("Underlying fixture query failed"),
    },
  ),
  {
    responseBody: body,
    provider: {
      metadata: {
        raw: {
          requestId: "synthetic-provider-request",
          apiKey: "SYNTHETIC_CREDENTIAL_MUST_BE_REDACTED",
        },
      },
    },
  },
);
original.provider.metadata.raw.circular = original;
const workflow = {
  id: "eval-error-native-workflow",
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
  telemetry,
});
const cases = [
  "hook-failure",
  "postcondition-failed",
  "reset-failed",
  "native-workflow-failure",
].map((id) => ({
  id,
  name: id.replaceAll("-", " "),
  steps: [
    { message: "Confirm the synthetic fixture", expect: { type: "answer" } },
  ],
}));
let resets = 0;
const progress = [];
const runner = createEvals({
  agent,
  suites: [
    {
      id: "eval-error-standard",
      name: "Eval error diagnostics regression",
      cases,
    },
  ],
  setup: () => ({}),
  execute: async ({ case: item, run }) => {
    if (item.id === "hook-failure") throw original;
    if (item.id === "native-workflow-failure") return run();
    return {
      observation: {
        type: "answer",
        text: "The synthetic workflow completed.",
        structured: [],
        ...(item.id === "postcondition-failed"
          ? {
              events: [
                {
                  type: "tool-call-error",
                  tool: "synthetic-read",
                  toolCallId: "handled",
                  failure: serializeFailure(original),
                  diagnosticId: agent.reportError(original),
                },
              ],
            }
          : {}),
      },
    };
  },
  verify: () => ({
    passed: false,
    reason: "Required approved save is absent",
    evidence: ["Synthetic fixture contains zero approved saves"],
  }),
  teardown: ({ case: item }) => {
    resets++;
    if (item.id === "reset-failed")
      throw new DomainError(
        "FIXTURE_RESET_FAILED",
        "Fixture reset did not complete",
      );
  },
});
const result = await runner.run({
  suiteId: "eval-error-standard",
  includeActivity: true,
  onProgress: (event) => progress.push(event),
});
assert.deepEqual(
  result.cases.map((item) => item.status),
  ["error", "failed", "error", "error"],
);
assert.equal(resets, 4);
const hook = result.cases[0];
assert.equal(hook.errors[0].failure.domainCode, "REVIEW_CARD_COUNT");
assert(hook.errors[0].diagnosticId);
assert(
  !JSON.stringify(result).includes("SYNTHETIC_CREDENTIAL_MUST_BE_REDACTED"),
);
assert(!JSON.stringify(result).includes(body));
assert.equal(result.cases[1].errors.length, 0);
assert.equal(
  result.cases[2].errors[0].failure.domainCode,
  "FIXTURE_RESET_FAILED",
);
const native = result.cases[3].steps[0].observation;
assert(
  native.diagnosticId && native.runId,
  "Native stream failures must retain exact diagnostic and run references.",
);
await telemetry.flush();
for (const diagnosticId of [hook.errors[0].diagnosticId, native.diagnosticId]) {
  const response = await fetch(
    `${api}/v1/studio/diagnostics/${diagnosticId}?env=development`,
    { headers: { authorization: `Bearer ${reader}` } },
  );
  assert.equal(response.status, 200);
  const diagnostic = await response.json();
  assert.equal(diagnostic.state, "available");
  assert.equal(diagnostic.content.capture.status, "complete");
  if (diagnosticId === native.diagnosticId) {
    assert.equal(diagnostic.manifest.correlation.runId, native.runId);
    assert(
      diagnostic.manifest.correlation.traceId &&
        diagnostic.manifest.correlation.spanId,
    );
  }
  assert(JSON.stringify(diagnostic.content).includes(body));
  assert(
    !JSON.stringify(diagnostic.content).includes(
      "SYNTHETIC_CREDENTIAL_MUST_BE_REDACTED",
    ),
  );
}
const client = createTelemetryDbClient(database);
let storedId;
let legacyId;
try {
  const project = await ensureLocalDevelopmentProject(client.db);
  storedId = randomUUID();
  const now = new Date().toISOString();
  const sql = client.sql;
  await sql`insert into eval_runs (id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,result,requested_by,created_at,started_at,ended_at) values (${storedId},${project.organizationId},${project.projectId},'development','local-eval-error-fixture','Local eval error fixture',${result.suiteId},${result.suiteRevision},${JSON.stringify(result.suite)}::jsonb,${JSON.stringify({ repetitions: 1, concurrency: 1 })}::jsonb,${result.status},${JSON.stringify(result)}::jsonb,'local-manual-fixture',${now},${now},${now})`;
  legacyId = randomUUID();
  const legacy = structuredClone(result);
  for (const item of legacy.cases) {
    delete item.verification;
    delete item.phaseDurationsMs;
    for (const error of item.errors) {
      delete error.failure;
      delete error.diagnosticId;
    }
    for (const step of item.steps) {
      delete step.observation.failure;
      delete step.observation.diagnosticId;
      delete step.observation.events;
    }
  }
  await sql`insert into eval_runs (id,organization_id,project_id,environment,target_id,target_name,suite_id,suite_revision,suite,request,status,result,requested_by,created_at,started_at,ended_at) values (${legacyId},${project.organizationId},${project.projectId},'development','local-eval-error-fixture','Legacy eval fixture',${result.suiteId},${result.suiteRevision},${JSON.stringify(result.suite)}::jsonb,${JSON.stringify({ repetitions: 1, concurrency: 1 })}::jsonb,${legacy.status},${JSON.stringify(legacy)}::jsonb,'local-manual-fixture',${now},${now},${now})`;
  for (const event of progress)
    await sql`insert into eval_run_events (organization_id,project_id,run_id,event) values (${project.organizationId},${project.projectId},${storedId},${JSON.stringify(event)}::jsonb)`;
} finally {
  await client.close();
}
const proof = {
  storedId,
  legacyId,
  hookDiagnosticId: hook.errors[0].diagnosticId,
  nativeDiagnosticId: native.diagnosticId,
  nativeRunId: native.runId,
  cases: result.cases.map(({ caseId, status, phaseDurationsMs }) => ({
    caseId,
    status,
    phaseDurationsMs,
  })),
  caseUrl: `http://localhost:6366/evals/cases/${storedId}/hook-failure/1?env=development`,
  diagnosticUrl: `http://localhost:6366/diagnostics/${hook.errors[0].diagnosticId}?env=development`,
};
await writeFile(
  process.env.KORTYX_EVAL_ERROR_FIXTURE_OUTPUT ??
    "/tmp/kortyx-eval-error-proof.json",
  JSON.stringify(proof, null, 2),
);
console.log(JSON.stringify(proof, null, 2));
