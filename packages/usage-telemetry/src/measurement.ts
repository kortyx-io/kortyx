import type { UsageProperties } from "./client";
import { usageErrorProperty as property } from "./failure";

/** Stable counting boundaries. Edition catalogs can supply a different approved kind. */
export function usageMeasurement(
  event: string,
  operation: string,
  input: UsageProperties,
): string {
  if (event === "usage.feature")
    return property(input, "origin") === "background" ||
      property(input, "origin") === "server"
      ? "observation"
      : "feature";
  if (operation === "cli.command" || operation === "sdk.eval")
    return "invocation";
  if (operation === "studio.setup") return "stage";
  if (operation === "sdk.execution" || operation === "studio.eval.execution")
    return "execution";
  if (operation === "sdk.export" || operation === "sdk.model") return "attempt";
  if (operation === "sdk.structured") {
    const format = property(input, "format");
    return format === "text-delta"
      ? "chunk"
      : format === "final"
        ? "output"
        : "update";
  }
  if (property(input, "origin") === "background") return "poll";
  if (operation.startsWith("studio.")) return "request";
  return "call";
}
