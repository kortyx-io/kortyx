import { deepMergeWithArrayOverwrite } from "./merge";

/** Runtime-owned records are complete snapshots, not application data deltas. */
export function mergeRuntimeState(
  ...sources: Record<string, unknown>[]
): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  for (const source of sources) {
    const ordinary = Object.fromEntries(
      Object.entries(source).filter(
        ([key]) => key !== "__kortyx" && key !== "__kortyxParallelGraph",
      ),
    );
    result = deepMergeWithArrayOverwrite(result, ordinary);
    for (const key of ["__kortyx", "__kortyxParallelGraph"]) {
      if (Object.hasOwn(source, key)) result[key] = source[key];
    }
  }
  return result;
}
