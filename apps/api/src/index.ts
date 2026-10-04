import { serve } from "@hono/node-server";
import { createTelemetryDbClient } from "@kortyx/telemetry-db";
import { createApiApp } from "./app";
import { loadApiConfig } from "./config";
import { loadStudioEvalJudge } from "./evals/judge";
import { loadEvalTargets } from "./evals/targets";
import { createEvalWorker } from "./evals/worker";
import { createPostgresStudioChangeBus } from "./realtime/studio-change-bus";
import { shutdownApiRuntime } from "./shutdown";

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
  config.deployment === "self-hosted"
    ? createEvalWorker(dbClient.db, evalTargets, evalJudge)
    : undefined;
await studioChangeBus.start();
evalWorker?.start();

const server = serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.log(`Kortyx API listening on http://${config.host}:${config.port}`);

let shutdown: Promise<void> | undefined;
const closeGracefully = (signal: string): Promise<void> => {
  if (shutdown) return shutdown;
  console.log(`Received ${signal}; closing Kortyx API.`);
  acceptingTraffic = false;
  shutdown = (evalWorker?.stop() ?? Promise.resolve())
    .then(() =>
      shutdownApiRuntime({
        markNotReady: () => {
          acceptingTraffic = false;
        },
        server,
        studioChangeBus,
        database: dbClient,
      }),
    )
    .catch((error: unknown) => {
      console.error(
        "Kortyx API shutdown did not complete cleanly.",
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    });
  return shutdown;
};

process.on("SIGTERM", () => void closeGracefully("SIGTERM"));
process.on("SIGINT", () => void closeGracefully("SIGINT"));
