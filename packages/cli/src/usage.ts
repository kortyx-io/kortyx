import type { UsageTelemetry } from "@kortyx/usage-telemetry";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import packageJson from "../package.json";

export const studioUsage = {
  start: (...args: Parameters<UsageTelemetry["start"]>) =>
    getUsageTelemetry("studio_cli", packageJson.version, "oss_studio").start(
      ...args,
    ),
  flush: () =>
    getUsageTelemetry("studio_cli", packageJson.version, "oss_studio").flush(),
};
