import "server-only";
import type { StudioEvaluationSummary } from "@kortyx/agent/evals";
import {
  type EvaluationChanges,
  earlierEvaluations,
  evaluationSignature,
  summarizeChanges,
} from "../lib/evaluation-changes";
import { isActive } from "../lib/presentation";
import type { EvaluationResults } from "../schema";
import { readEvaluationResults } from "./server";

/** Compute on the server; never ship transcripts with the table's change cells.
 * Results are deduplicated within this request and reads have bounded concurrency.
 */
export async function readEvaluationChanges(
  runs: StudioEvaluationSummary[],
  history: StudioEvaluationSummary[],
  requested?: string,
  request?: Request,
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
      choices: choices.map(({ id, name, createdAt }) => ({
        id,
        name,
        createdAt,
      })),
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
  const ids = [
    ...new Set(
      Object.values(changes).flatMap((value) =>
        value.state === "ready" && value.earlier
          ? [value.candidate.id, value.earlier.id]
          : [],
      ),
    ),
  ];
  const values = new Map<string, EvaluationResults>();
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (index < ids.length) {
        const id = ids[index++];
        try {
          const result = await readEvaluationResults(id, request);
          if (result.run.id === id) values.set(id, result.run);
        } catch {
          /* Each affected cell has its own unavailable state. */
        }
      }
    }),
  );
  for (const value of Object.values(changes)) {
    if (value.state !== "ready" || !value.earlier) continue;
    const a = values.get(value.earlier.id),
      b = values.get(value.candidate.id);
    if (a && b) value.rows = summarizeChanges(a, b);
    else {
      value.state = "error";
      value.message = "Changes could not be loaded. Refresh to retry.";
    }
  }
  return changes;
}
