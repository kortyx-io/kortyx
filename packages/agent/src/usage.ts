import type { UsageTelemetry } from "@kortyx/usage-telemetry";
import { getUsageTelemetry } from "@kortyx/usage-telemetry/node";
import packageJson from "../package.json";

const client = () => getUsageTelemetry("agent", packageJson.version);
export const usage: Pick<UsageTelemetry, "start" | "measure"> = {
  start: (...args) => client().start(...args),
  measure: (...args) => client().measure(...args),
};
