import "server-only";
import {
  getUsageTelemetry,
  publicUsageConfiguration,
} from "@kortyx/usage-telemetry/node";
import packageJson from "../../package.json";
import type { StudioUsageAdapter } from "./contracts";
export const studioUsage: StudioUsageAdapter = {
  server: getUsageTelemetry("studio_api", packageJson.version, "oss_studio"),
  browserConfig: () => ({
    ...publicUsageConfiguration(),
    product: "oss_studio",
    version: packageJson.version,
  }),
};
