import { serve } from "@hono/node-server";
import { createTelemetryDbClient } from "@kortyx/telemetry-db";
import { flushUsageTelemetry } from "@kortyx/usage-telemetry/node";
import { loadEvalWorkerConfig } from "./config";
import { loadStudioEvalJudge } from "./evals/judge";
import { loadEvalTargets } from "./evals/targets";
import { createEvalWorker } from "./evals/worker";
import { reportWorkerRetirementFailure } from "./evals/worker-retirement";
import { createApiLifecycle, registerApiSignals } from "./lifecycle";
import { drainServer } from "./shutdown";

// Cloud owns its restricted store/credentials; never fall back to this OSS host.
if ((process.env.KORTYX_API_DEPLOYMENT ?? "self-hosted") !== "self-hosted")
  throw new Error("The standalone OSS worker requires self-hosted deployment.");
const config = loadEvalWorkerConfig();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const targets = loadEvalTargets();
if (!targets.length)
  throw new Error("Standalone worker requires eval targets.");
const judge = loadStudioEvalJudge();
const database = createTelemetryDbClient(databaseUrl);
await database.sql`SELECT 1 FROM eval_runs LIMIT 1`;
const worker = createEvalWorker(database.db, targets, judge, {
  maxConcurrentEvaluations: config.evalMaxConcurrentEvaluations,
});
// This listener exposes only health, never ingestion or tenant operations.
const server = serve({
  hostname: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.API_PORT ?? "6400"),
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (
      request.method !== "GET" ||
      !["/live", "/health", "/ready"].includes(path)
    )
      return new Response(null, { status: 404 });
    let available = true;
    if (path === "/ready") {
      available = lifecycle.evaluationState() === "running" && worker.isReady();
      try {
        await database.sql`SELECT 1`;
        available =
          lifecycle.evaluationState() === "running" && worker.isReady();
      } catch {
        available = false;
      }
    }
    return Response.json(
      {
        status: available ? "ok" : "unavailable",
        service: "kortyx-eval-worker",
        state: lifecycle.evaluationState(),
      },
      {
        status: available ? 200 : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  },
});
let retirementFailed = false;
const lifecycle = createApiLifecycle({
  worker,
  markNotReady: () => undefined,
  drainHttp: () => drainServer(server, 25_000),
  closeResources: async () => {
    await database.close();
    await flushUsageTelemetry().catch(() => undefined);
  },
  onEvaluationState: (state) => {
    console.log(`Evaluation worker state: ${state}`);
    if (state === "drained" && retirementFailed) {
      retirementFailed = false;
      process.exitCode = 0;
    }
  },
});
registerApiSignals(process, lifecycle, (error) => {
  retirementFailed = true;
  process.exitCode = 1;
  void reportWorkerRetirementFailure(database.db, targets, error);
});
worker.start();
console.log("Kortyx standalone evaluation worker started.");
