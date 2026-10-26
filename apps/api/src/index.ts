import { createTelemetryDbClient } from "@kortyx/telemetry-db";
import { flushUsageTelemetry } from "@kortyx/usage-telemetry/node";
import { createApiApp } from "./app";
import { loadApiConfig } from "./config";
import { loadStudioEvalJudge } from "./evals/judge";
import { loadEvalTargets } from "./evals/targets";
import { createEvalWorker } from "./evals/worker";
import { reportWorkerRetirementFailure } from "./evals/worker-retirement";
import { API_KEEP_ALIVE_TIMEOUT_MS, startApiHttpServer } from "./http-server";
import { createApiLifecycle, registerApiSignals } from "./lifecycle";
import { createPostgresStudioChangeBus } from "./realtime/studio-change-bus";
import { closeApiResources, drainServer } from "./shutdown";

const config = loadApiConfig();
const dbClient = createTelemetryDbClient(config.databaseUrl);
const studioChangeBus = createPostgresStudioChangeBus(dbClient.sql);
const evalTargets = loadEvalTargets();
const evalJudge = loadStudioEvalJudge();
let acceptingTraffic = true;
const app = createApiApp({
  db: dbClient.db,
  evalTargets,
  ...(evalJudge ? { evalJudge } : {}),
  apiKeyPepper: config.apiKeyPepper,
  deployment: config.deployment,
  studioChangeBus,
  readiness: async () => {
    if (!acceptingTraffic) throw new Error("API is draining.");
    await dbClient.sql`SELECT 1`;
  },
});

// The OSS worker claims jobs across projects. Cloud must provide a scoped worker
// lifecycle separately; do not silently run this worker with the tenant runtime role.
if (config.deployment === "cloud" && evalTargets.length > 0) {
  throw new Error(
    "Cloud eval targets require a tenant-scoped worker lifecycle.",
  );
}
const evalWorker =
  config.deployment === "self-hosted" && config.evalWorkerEnabled
    ? createEvalWorker(dbClient.db, evalTargets, evalJudge, {
        maxConcurrentEvaluations: config.evalMaxConcurrentEvaluations,
      })
    : undefined;
await studioChangeBus.start();
evalWorker?.start();

const server = startApiHttpServer({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.log(
  `Kortyx API listening on http://${config.host}:${config.port}; HTTP keep-alive timeout ${API_KEEP_ALIVE_TIMEOUT_MS}ms`,
);

let retirementFailed = false;
const lifecycle = createApiLifecycle({
  worker: evalWorker,
  markNotReady: () => {
    acceptingTraffic = false;
  },
  drainHttp: () => drainServer(server, 25_000),
  closeResources: async () => {
    await closeApiResources([studioChangeBus, dbClient]);
    // Optional maintainer delivery cannot turn completed retirement into failure.
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
  void reportWorkerRetirementFailure(dbClient.db, evalTargets, error);
});
