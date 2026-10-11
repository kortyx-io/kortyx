import type { UsageTelemetry } from "@kortyx/usage-telemetry";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import packageJson from "../package.json";

const client = () => getUsageTelemetry("cli", packageJson.version);
export const usage: Pick<
  UsageTelemetry,
  "start" | "feature" | "measure" | "flush"
> = {
  start: (...args) => client().start(...args),
  feature: (...args) => client().feature(...args),
  measure: (...args) => client().measure(...args),
  flush: () => client().flush(),
};

export const studioUsage = {
  start: (...args: Parameters<UsageTelemetry["start"]>) =>
    getUsageTelemetry("studio_cli", packageJson.version, "oss_studio").start(
      ...args,
    ),
  flush: () =>
    getUsageTelemetry("studio_cli", packageJson.version, "oss_studio").flush(),
};
