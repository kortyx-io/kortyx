import type { EvaluatorExecution } from "@kortyx/telemetry-contracts";
import type { EvaluatorEvidence } from "@kortyx/telemetry-db";

function existsAt(root: unknown, path: string) {
  if (!path.startsWith("/")) return false;
  let value = root;
  for (const token of path.slice(1).split("/")) {
    if (/~(?![01])/.test(token)) return false;
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
      return false;
    value = (value as Record<string, unknown>)[key];
  }
  return true;
}
/** Accept only references into the evidence used by this execution. */
export function validateEvaluatorReferences(
  evidence: EvaluatorEvidence,
  scores: NonNullable<EvaluatorExecution["scores"]>,
) {
  for (const field of scores) {
    for (const reference of field.evidence) {
      if (reference.recordingId) {
        if (
          reference.recordingId !== evidence.revision ||
          (reference.path && !existsAt(evidence, reference.path))
        )
          throw new Error("The judge cited an unavailable recording field.");
      } else {
        if (
          !reference.eventId ||
          !evidence.eventIds.includes(reference.eventId)
        )
          throw new Error("The judge cited an unavailable event.");
        if (reference.path) {
          const events =
            (evidence.captured as { events?: { id: string }[] })?.events ?? [];
          const event = events.find((item) => item.id === reference.eventId);
          if (!existsAt(event, reference.path))
            throw new Error("The judge cited an unavailable event field.");
        }
      }
    }
  }
}
