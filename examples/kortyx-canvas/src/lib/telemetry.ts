import "server-only";

import {
  createKortyxTelemetryAdapter,
  type KortyxTelemetryAdapter,
} from "@kortyx/telemetry";

declare global {
  var __kortyxCanvasTelemetryAdapter: KortyxTelemetryAdapter | undefined;
}

const booleanFromEnv = (value: string | undefined): boolean | undefined => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const telemetryEndpoint = () =>
  process.env.KORTYX_TELEMETRY_API_URL ?? process.env.KORTYX_API_URL;

export const isCanvasTelemetryConfigured = (): boolean =>
  Boolean(telemetryEndpoint() && process.env.KORTYX_TELEMETRY_API_KEY);

export const getCanvasTelemetryAdapter = ():
  | KortyxTelemetryAdapter
  | undefined => {
  const endpoint = telemetryEndpoint();
  const apiKey = process.env.KORTYX_TELEMETRY_API_KEY;
  if (!endpoint || !apiKey) return undefined;

  globalThis.__kortyxCanvasTelemetryAdapter ??= createKortyxTelemetryAdapter({
    endpoint,
    apiKey,
    environment: process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
    service: {
      name: process.env.KORTYX_TELEMETRY_SERVICE_NAME ?? "kortyx-canvas",
      ...(process.env.KORTYX_TELEMETRY_DEPLOYMENT_REF
        ? { deploymentRef: process.env.KORTYX_TELEMETRY_DEPLOYMENT_REF }
        : {}),
    },
    captureContent: booleanFromEnv(
      process.env.KORTYX_TELEMETRY_CAPTURE_CONTENT,
    ),
    tags: ["canvas-example"],
    metadata: {
      source: "examples/kortyx-canvas",
    },
  });

  return globalThis.__kortyxCanvasTelemetryAdapter;
};

export const flushCanvasTelemetry = async (): Promise<void> => {
  try {
    await getCanvasTelemetryAdapter()?.flush();
  } catch (error) {
    console.warn("[kortyx-canvas] failed to flush telemetry", error);
  }
};
