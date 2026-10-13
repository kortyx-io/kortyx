import type { WorkflowDefinition } from "@kortyx/core";
import { KortyxError } from "@kortyx/core/errors";
import { deepMergeWithArrayOverwrite } from "@kortyx/utils";

export function hasDataReducer(
  workflow: WorkflowDefinition,
  key: string,
): boolean {
  return (
    Object.hasOwn(workflow.reduce ?? {}, key) &&
    typeof workflow.reduce?.[key] === "function"
  );
}

/** Accumulate a raw node delta. Unconfigured fields retain the existing merge. */
export function mergeWorkflowData(
  previous: Record<string, unknown>,
  update: Record<string, unknown>,
  workflow?: WorkflowDefinition,
): Record<string, unknown> {
  const result = deepMergeWithArrayOverwrite(previous, update);
  for (const key of Object.keys(update)) {
    const reducer = Object.hasOwn(workflow?.reduce ?? {}, key)
      ? workflow?.reduce?.[key]
      : undefined;
    if (!reducer) continue;
    try {
      const value = reducer(
        Object.hasOwn(previous, key) ? previous[key] : undefined,
        update[key],
      );
      if (value instanceof Promise) {
        void value.catch(() => {});
        throw new TypeError("Workflow reducers must be synchronous.");
      }
      if (value === undefined) delete result[key];
      else
        Object.defineProperty(result, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
    } catch (cause) {
      throw new KortyxError(
        "WORKFLOW_REDUCER_FAILED",
        "Workflow reducer failed.",
        {
          category: "workflow",
          retryable: false,
          safeMessage:
            "A workflow data reducer failed. Check the reducer for the reported field.",
          context: { workflow: workflow?.id ?? "", field: key },
          cause,
        },
      );
    }
  }
  return result;
}

/** Copy already-reduced fields into flowing input without applying callbacks again. */
export function copyReducedFields(
  input: Record<string, unknown>,
  data: Record<string, unknown>,
  returned: Record<string, unknown>,
  workflow: WorkflowDefinition,
): Record<string, unknown> {
  for (const key of Object.keys(returned)) {
    if (!hasDataReducer(workflow, key)) continue;
    if (!Object.hasOwn(data, key)) delete input[key];
    else
      Object.defineProperty(input, key, {
        value: data[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return input;
}
