import type { UsageCatalog, UsageTelemetry } from "@kortyx/usage-telemetry";
export interface StudioUsageConfig {
  enabled: boolean;
  debug: boolean;
  product: string;
  version: string;
  environment: "production" | "staging";
  key: string;
  host: string;
  runtimeMode?: "development" | "production" | "ci" | "unknown";
  trafficSource?: "internal" | "synthetic" | "external" | "unknown";
  endpoint?: string;
  catalog?: UsageCatalog;
}
/** Edition adapters own their server client and approved browser bootstrap. */
export interface StudioUsageAdapter {
  server: UsageTelemetry;
  browserConfig(): StudioUsageConfig;
}
