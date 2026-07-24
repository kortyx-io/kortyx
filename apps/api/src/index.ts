import { serve } from "@hono/node-server";
import { createTelemetryDbClient } from "@kortyx/telemetry-db";
import { createApiApp } from "./app";
import { loadApiConfig } from "./config";

const config = loadApiConfig();
const dbClient = createTelemetryDbClient(config.databaseUrl);
const app = createApiApp({
  db: dbClient.db,
  apiKeyPepper: config.apiKeyPepper,
});

const server = serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.log(`Kortyx API listening on http://${config.host}:${config.port}`);

const closeGracefully = async (signal: string) => {
  console.log(`Received ${signal}; closing Kortyx API.`);
  server.close();
  await dbClient.close();
  process.exit(0);
};

process.on("SIGTERM", () => void closeGracefully("SIGTERM"));
process.on("SIGINT", () => void closeGracefully("SIGINT"));
