import type { EvalObservation, EvalOutputExpectation } from "./types";

/** Match current visible finalized envelopes, never old/invalidated stream events or model data. */
export function missingOutputReason(
  outputs: readonly EvalOutputExpectation[] | undefined,
  observation: EvalObservation,
): string | undefined {
  const missing = (outputs ?? []).filter(
    (expected) =>
      !observation.structured.some(
        (value) =>
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "status" in value &&
          value.status === "done" &&
          "data" in value &&
          value.schemaId === expected.schemaId &&
          (expected.schemaVersion === undefined ||
            value.schemaVersion === expected.schemaVersion),
      ),
  );
  if (!missing.length) return undefined;
  return `Required completed structured outputs were not observed: ${missing
    .map(
      ({ schemaId, schemaVersion }) =>
        `${schemaId} (${schemaVersion === undefined ? "any version" : `version ${schemaVersion}`})`,
    )
    .join(", ")}.`;
}
