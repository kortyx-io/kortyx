import type { UsageTelemetry } from "@kortyx/usage-telemetry";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import packageJson from "../package.json";

const client = () => getUsageTelemetry("exporter", packageJson.version);
export const usage: Pick<
  UsageTelemetry,
  "start" | "feature" | "measure" | "flush"
> = {
  start: (...args) => client().start(...args),
  feature: (...args) => client().feature(...args),
  measure: (...args) => client().measure(...args),
  flush: () => client().flush(),
};
