import "server-only";
import {
  getStudioInterrupts,
  getStudioRuns,
  getStudioSessions,
  getStudioWorkflows,
} from "@/lib/studio-api";

export function isFirstUseQuery(
  query: Record<string, string | string[] | undefined>,
) {
  return Object.entries(query).every(([key, value]) => {
    if (value === undefined || value === "") return true;
    if (["env", "sort", "dir", "pageSize", "mode", "metric"].includes(key))
      return true;
    if (key === "range") return value === "24 hours" || value === "All time";
    if (key === "cursor") return value === "0";
    return false;
  });
}

/** Check all-time data only after an empty page. Errors never mean first use. */
export async function hasNoObservations(
  resource: "runs" | "sessions" | "workflows" | "interrupts",
  environment: string | string[] | undefined,
) {
  const query = { range: "All time", env: environment, pageSize: "1" };
  if (resource === "workflows") {
    const result = await getStudioWorkflows(query);
    return !result.error && result.data.workflows.length === 0;
  }
  const read =
    resource === "runs"
      ? getStudioRuns
      : resource === "sessions"
        ? getStudioSessions
        : getStudioInterrupts;
  const result = await read(query);
  return !result.error && result.data.totalCount === 0;
}
