// Build the SDK first. An immediate mock model isolates persistence overhead.
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { randomUUID } = require("node:crypto");
const repo = path.resolve(__dirname, "..");
const { createAgent } = require(`${repo}/packages/agent/dist/index.js`);
const { defineWorkflow } = require(`${repo}/packages/core/dist/index.js`);
const { useReason } = require(`${repo}/packages/hooks/dist/index.js`);
const {
  createInMemoryFrameworkAdapter,
  createRedisFrameworkAdapter,
  createPostgresFrameworkAdapter,
} = require(`${repo}/packages/runtime/dist/index.js`);
const { z } = require(`${repo}/packages/agent/node_modules/zod`);
const postgres = require(`${repo}/packages/runtime/node_modules/postgres`);
const pgUrl = process.env.KORTYX_TEST_POSTGRES_URL;
const redisUrl = process.env.KORTYX_TEST_REDIS_URL;
if (!pgUrl || !redisUrl)
  throw new Error(
    "Set KORTYX_TEST_POSTGRES_URL and KORTYX_TEST_REDIS_URL to disposable services.",
  );
const samples = Number(process.env.BENCH_SAMPLES || 100);
if (!Number.isSafeInteger(samples) || samples < 1)
  throw new Error("BENCH_SAMPLES must be a positive integer.");
const sql = postgres(pgUrl);
const entries = [];
const runTag = randomUUID();
const summary = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  return {
    p50: +ordered[Math.floor(ordered.length * 0.5)].toFixed(2),
    p95: +ordered[Math.floor(ordered.length * 0.95)].toFixed(2),
  };
};
async function sample(entry, record) {
  const start = performance.now();
  let completion;
  let firstToken;
  const stream = await entry.agent.streamChat(
    [{ role: "user", content: "hello" }],
    {
      sessionId: "session",
      onExecution: (value) => {
        completion = value;
      },
    },
  );
  for await (const chunk of stream) {
    if (chunk.type === "error") throw new Error(JSON.stringify(chunk));
    if (chunk.type === "text-delta" && firstToken === undefined)
      firstToken = performance.now() - start;
  }
  await completion;
  if (firstToken === undefined) throw new Error("No token emitted.");
  if (record) {
    entry.timings.generationStart.push(entry.nodeStart - start);
    entry.timings.firstToken.push(firstToken);
    entry.timings.completion.push(performance.now() - start);
  }
}
(async () => {
  try {
    for (const mode of ["memory", "redis", "postgres", "postgres-redis"]) {
      const scope = `latency-${runTag}-${mode}`;
      const adapter =
        mode === "memory"
          ? createInMemoryFrameworkAdapter()
          : mode === "redis"
            ? createRedisFrameworkAdapter({ url: redisUrl, prefix: scope })
            : createPostgresFrameworkAdapter({
                connectionString: pgUrl,
                namespace: scope,
                ...(mode === "postgres-redis"
                  ? { redis: { url: redisUrl } }
                  : {}),
              });
      const entry = {
        mode,
        scope,
        adapter,
        nodeStart: 0,
        timings: { generationStart: [], firstToken: [], completion: [] },
      };
      entries.push(entry);
      if (adapter.kind === "postgres") await adapter.maintenance.setup();
      const provider = {
        id: "mock",
        models: ["mock"],
        getModel: () => ({
          invoke: async () => ({ content: "answer" }),
          stream: async function* () {
            yield { type: "text-delta", delta: "answer" };
          },
        }),
      };
      const workflow = defineWorkflow({
        id: "latency",
        version: "1",
        inputSchema: z.string(),
        outputSchema: z.object({ answer: z.string(), snapshot: z.string() }),
        nodes: {
          answer: {
            run: async () => {
              entry.nodeStart = performance.now();
              const result = await useReason({
                model: { provider, modelId: "mock" },
                input: "hello",
                stream: true,
              });
              return {
                data: { answer: result.text, snapshot: "x".repeat(16384) },
              };
            },
          },
        },
        edges: [
          ["__start__", "answer"],
          ["answer", "__end__"],
        ],
      });
      entry.agent = createAgent({
        workflows: [workflow],
        defaultWorkflowId: "latency",
        frameworkAdapter: adapter,
      });
    }
    for (const entry of entries)
      for (let i = 0; i < 10; i++) await sample(entry, false);
    // Rotate mode order to reduce bias from gradual host or database load changes.
    for (let i = 0; i < samples; i++) {
      for (let offset = 0; offset < entries.length; offset++)
        await sample(entries[(i + offset) % entries.length], true);
    }
    const results = entries.map((entry) => ({
      mode: entry.mode,
      samples,
      warmup: 10,
      payloadBytes: 16384,
      workload:
        "one continuing session, sequential requests, immediate mock model",
      milliseconds: Object.fromEntries(
        Object.entries(entry.timings).map(([key, values]) => [
          key,
          summary(values),
        ]),
      ),
    }));
    if (process.env.BENCH_OUTPUT)
      fs.writeFileSync(
        process.env.BENCH_OUTPUT,
        JSON.stringify(results, null, 2),
      );
    console.log(JSON.stringify(results, null, 2));
  } finally {
    for (const { adapter, scope } of entries) {
      if (adapter.close) await adapter.close();
      if (adapter.kind === "postgres") {
        await sql`DELETE FROM kortyx_runtime_pending_requests WHERE scope = ${scope}`;
        await sql`DELETE FROM kortyx_runtime_sessions WHERE scope = ${scope}`;
        await sql`DELETE FROM kortyx_runtime_runs WHERE scope = ${scope}`;
      }
    }
    await sql.end();
  }
  // The legacy Redis adapter has no public close method; the benchmark owns its process.
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
