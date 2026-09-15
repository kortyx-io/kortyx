import { serve } from "@hono/node-server";
import { createTelemetryDbClient } from "@kortyx/telemetry-db";
import { createApiApp } from "./app";
import { loadApiConfig } from "./config";
import { createPostgresStudioChangeBus } from "./realtime/studio-change-bus";
import { shutdownApiRuntime } from "./shutdown";

const config = loadApiConfig();
const dbClient = createTelemetryDbClient(config.databaseUrl);
const studioChangeBus = createPostgresStudioChangeBus(dbClient.sql);
await studioChangeBus.start();
let acceptingTraffic = true;
const app = createApiApp({
  db: dbClient.db,
  apiKeyPepper: config.apiKeyPepper,
  studioChangeBus,
  readiness: async () => {
    if (!acceptingTraffic) throw new Error("API is draining.");
    await dbClient.sql`SELECT 1`;
  },
});

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
  shutdown = shutdownApiRuntime({
    markNotReady: () => {
      acceptingTraffic = false;
    },
    server,
    studioChangeBus,
    database: dbClient,
  }).catch((error: unknown) => {
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
