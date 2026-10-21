import "server-only";
import {
  EVAL_COMPARISON_LIMITS,
  type StudioEvaluationComparison,
  type StudioEvaluationSummary,
} from "@kortyx/agent/evals";
import {
  type EvaluationChanges,
  earlierEvaluations,
  evaluationSignature,
  summarizeSnapshotChanges,
} from "../lib/evaluation-changes";
import { isActive } from "../lib/presentation";
import { readEvaluationComparison } from "./server";

let activeReads = 0;

/** Bounded snapshots and a two-entry request cache, never full saved results. */
export async function readEvaluationChanges(
  runs: StudioEvaluationSummary[],
  history: StudioEvaluationSummary[],
  requested?: string,
  request?: Request,
  includeChoices = true,
): Promise<Record<string, EvaluationChanges>> {
  const changes: Record<string, EvaluationChanges> = {};
  for (const run of runs) {
    const choices = earlierEvaluations(run, history);
    const earlier = requested
      ? choices.find((item) => item.id === requested)
      : choices[0];
    changes[run.id] = {
      candidate: { id: run.id, name: run.name, createdAt: run.createdAt },
      signature: evaluationSignature(run),
      earlier: earlier && {
        id: earlier.id,
        name: earlier.name,
        createdAt: earlier.createdAt,
      },
      choices: (includeChoices ? choices : []).map(
        ({ id, name, createdAt }) => ({
          id,
          name,
          createdAt,
        }),
      ),
      rows: [],
      state: run.legacy
        ? "none"
        : isActive(run.status)
          ? "active"
          : requested && !earlier
            ? "error"
            : earlier
              ? "ready"
              : "none",
      ...(requested && !earlier
        ? {
            message:
              "The chosen earlier run is unavailable in the recent history for this application and environment.",
          }
        : {}),
    };
  }
  const ready = Object.values(changes).filter(
    (v) => v.state === "ready" && v.earlier,
  );
  const unavailable = (value: EvaluationChanges) => {
    value.state = "error";
    value.message =
      "Changes could not be loaded. Refresh to retry or inspect individual conversations.";
  };
  // Reject overload instead of queuing requests and multiplying retained memory.
  if (activeReads >= 2) {
    for (const value of ready) unavailable(value);
    return changes;
  }
  activeReads++;
  const values = new Map<string, StudioEvaluationComparison>();
  const read = async (id: string) => {
    const cached = values.get(id);
    if (cached) {
      values.delete(id);
      values.set(id, cached);
      return cached;
    }
    request?.signal.throwIfAborted();
    const result = await readEvaluationComparison(id, request);
    if (result.run.id !== id) throw new Error("Unexpected evaluation.");
    const oldest = values.keys().next().value;
    if (values.size >= 2 && oldest !== undefined) values.delete(oldest);
    values.set(id, result.run);
    return result.run;
  };
  let bytes = 0;
  try {
    for (const value of ready) {
      if (!value.earlier) continue;
      if (bytes >= EVAL_COMPARISON_LIMITS.responseBytes) {
        unavailable(value);
        continue;
      }
      try {
        // Newest-first pages reuse the preceding row as the next row's candidate.
        const b = await read(value.candidate.id),
          a = await read(value.earlier.id);
        const rows = summarizeSnapshotChanges(a, b);
        const size = Buffer.byteLength(JSON.stringify(rows));
        if (bytes + size > EVAL_COMPARISON_LIMITS.responseBytes) {
          unavailable(value);
          continue;
        }
        value.rows = rows;
        bytes += size;
      } catch {
        request?.signal.throwIfAborted();
        unavailable(value);
      }
    }
  } finally {
    values.clear();
    activeReads--;
  }
  return changes;
}
