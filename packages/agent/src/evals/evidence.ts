import { EvalConfigurationError } from "./contracts";
import { EVAL_EVIDENCE_EVENT_TYPES } from "./evidence-policy";
import type {
  EvalEvidenceEvent,
  EvalEvidenceFilters,
  EvalEvidencePolicy,
  EvalHandlerRef,
  EvalJson,
  EvalJudgeEvidence,
  EvalObservation,
  EvalStepResult,
} from "./types";

const object = (
  value: EvalJson,
): value is { readonly [key: string]: EvalJson } =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const handler = (value: unknown): value is EvalHandlerRef =>
  value !== null && typeof value === "object" && "using" in value;

export function validateEvidenceFilters(
  policy: EvalEvidencePolicy,
  filters: EvalEvidenceFilters,
): void {
  for (const key of ["events", "outputs"] as const) {
    const selection = policy[key];
    if (
      handler(selection) &&
      (!Object.hasOwn(filters[key] ?? {}, selection.using) ||
        typeof filters[key]?.[selection.using] !== "function")
    )
      throw new EvalConfigurationError(
        `Unknown ${key} evidence filter: ${selection.using}`,
      );
  }
}

function predicate<T>(
  filter: ((value: T, params?: EvalJson) => boolean) | undefined,
  value: T,
  params?: EvalJson,
): boolean {
  if (!filter)
    throw new EvalConfigurationError("Evidence filter is not registered.");
  const selected = filter(
    structuredClone(value),
    params === undefined ? undefined : structuredClone(params),
  );
  if (typeof selected !== "boolean")
    throw new Error("Evidence filters must return a boolean synchronously.");
  return selected;
}

/** Never infer presentation, summarize facts, or truncate tool results. */
export function compactEvalObservation(
  observation: EvalObservation,
  policy: EvalEvidencePolicy = {},
  filters: EvalEvidenceFilters = {},
): EvalObservation {
  const outputs = policy.outputs;
  const includeOutput = (output: EvalJson): boolean => {
    if (outputs === false) return false;
    if (handler(outputs))
      return predicate(
        filters.outputs?.[outputs.using],
        output,
        outputs.params,
      );
    if (!outputs) return true;
    return (
      object(output) &&
      outputs.some((selector) =>
        Object.entries(selector).every(([key, value]) => output[key] === value),
      )
    );
  };
  const selectedOutputs = observation.structured.map((output) => ({
    output,
    included: includeOutput(output),
  }));
  const structured = selectedOutputs
    .filter((item) => item.included)
    .map((item) => item.output);
  const events = observation.events
    ?.filter((value): value is EvalEvidenceEvent => {
      if (
        !object(value) ||
        !EVAL_EVIDENCE_EVENT_TYPES.some((type) => type === value.type)
      )
        return false;
      if (value.type === "structured-data") {
        if (value.kind !== "final") return false;
        // Reuse the decision for the canonical envelope, even when its event copy
        // carries different source metadata. A rejected output must not leak back in.
        const current = selectedOutputs.find(
          ({ output: item }) =>
            object(item) &&
            typeof value.streamId === "string" &&
            item.streamId === value.streamId &&
            item.status === "done" &&
            item.dataType === value.dataType &&
            item.schemaId === value.schemaId &&
            item.schemaVersion === value.schemaVersion &&
            JSON.stringify(item.data) === JSON.stringify(value.data),
        );
        if (current) {
          if (!current.included) return false;
          // Keep finals around invalidation boundaries in their original order.
          if (
            !observation.events?.some(
              (event) =>
                object(event) &&
                event.type === "structured-data-invalidated" &&
                event.streamId === value.streamId,
            )
          )
            return false;
        } else {
          const { type: _type, kind: _kind, ...fields } = value;
          if (!includeOutput({ ...fields, status: "done" })) return false;
        }
      }
      return true;
    })
    .filter((event) => {
      const selection = policy.events;
      if (selection === false) return false;
      if (handler(selection))
        return predicate(
          filters.events?.[selection.using],
          event,
          selection.params,
        );
      return !selection || selection.includes(event.type);
    });
  return structuredClone({
    ...observation,
    structured,
    ...(events ? { events } : {}),
  });
}

export function createEvalJudgeEvidence(
  observation: EvalObservation,
  policy: EvalEvidencePolicy = {},
  filters: EvalEvidenceFilters = {},
): EvalJudgeEvidence {
  return {
    version: "compact-v1",
    history: policy.history ?? true,
    observation: compactEvalObservation(observation, policy, filters),
  };
}

/** Shared by local grading and Studio replay. Never expose the original evidence via history. */
export function getEvalGradeEvidence(
  step: EvalStepResult,
  previous: readonly EvalStepResult[],
): {
  observation: EvalObservation;
  conversation: EvalStepResult[];
} {
  const evidence = step.evidence ?? createEvalJudgeEvidence(step.observation);
  return {
    observation: structuredClone(evidence.observation),
    conversation: evidence.history
      ? previous.map((prior) => {
          const { evidence: selected, ...result } = prior;
          return structuredClone({
            ...result,
            observation:
              selected?.observation ??
              compactEvalObservation(prior.observation),
          });
        })
      : [],
  };
}
