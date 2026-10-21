import {
  EvalCostsSchema,
  type StudioEvaluationSummary,
} from "@kortyx/agent/evals";
import { z } from "zod";
import type { EvaluationResults } from "../schema";
import { sumCaseCosts } from "./cost";
import { compareEvaluations } from "./evaluation-comparison";
import { type CaseRow, isActive } from "./presentation";

const ChangeKindSchema = z.enum([
  "regressed",
  "improved",
  "still-failing",
  "unchanged",
  "review",
]);
const RunReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});
const ChangeSideSchema = z.object({
  runId: z.string().optional(),
  passed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
  costs: EvalCostsSchema.optional(),
  repetitions: z.array(
    z.object({ repetition: z.number().int().positive(), status: z.string() }),
  ),
});
const ConversationChangeSchema = z.object({
  key: z.string(),
  caseId: z.string(),
  name: z.string(),
  suiteId: z.string(),
  suiteName: z.string(),
  kind: ChangeKindSchema,
  label: z.string(),
  reason: z.string().optional(),
  earlier: ChangeSideSchema,
  current: ChangeSideSchema,
});
export const EvaluationChangesSchema = z.object({
  candidate: RunReferenceSchema,
  signature: z.string(),
  earlier: RunReferenceSchema.optional(),
  choices: z.array(RunReferenceSchema),
  state: z.enum(["ready", "active", "none", "error"]),
  rows: z.array(ConversationChangeSchema),
  message: z.string().optional(),
});
export type ChangeKind = z.infer<typeof ChangeKindSchema>;
export type RunReference = z.infer<typeof RunReferenceSchema>;
export type ChangeSide = z.infer<typeof ChangeSideSchema>;
export type ConversationChange = z.infer<typeof ConversationChangeSchema>;
export type EvaluationChanges = z.infer<typeof EvaluationChangesSchema>;

export function evaluationSignature(run: StudioEvaluationSummary) {
  return JSON.stringify([
    run.id,
    run.status,
    run.endedAt,
    run.completedAttempts,
    run.counts,
    run.costs,
  ]);
}

/** Reference selection is independent of table search, ordering, and pagination. */
export function earlierEvaluations(
  run: StudioEvaluationSummary,
  history: StudioEvaluationSummary[],
) {
  return history
    .filter(
      (other) =>
        !other.legacy &&
        other.id !== run.id &&
        !isActive(other.status) &&
        other.targetId === run.targetId &&
        other.environment === run.environment &&
        other.createdAt < run.createdAt,
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
}

export function summarizeChanges(
  earlier: EvaluationResults,
  current: EvaluationResults,
): ConversationChange[] {
  const side = (rows: CaseRow[], runId?: string): ChangeSide => ({
    runId,
    passed: rows.filter((row) => row.status === "passed").length,
    total: rows.length,
    // A missing duration stays unknown; summing known portions would understate it.
    durationMs:
      rows.length && rows.every((row) => row.durationMs !== undefined)
        ? rows.reduce((total, row) => total + (row.durationMs ?? 0), 0)
        : undefined,
    costs: sumCaseCosts(rows.map((row) => row.costs)),
    repetitions: rows.map((row) => ({
      repetition: row.repetition,
      status: row.status,
    })),
  });
  return compareEvaluations(earlier, current).map((row) => {
    const a = side(row.baseline, row.baselineRunId),
      b = side(row.candidate, row.candidateRunId);
    const kind: ChangeKind =
      row.change === "changed" || row.change === "incomplete"
        ? "review"
        : row.change === "unchanged" &&
            row.candidate.some((item) => item.status === "failed")
          ? "still-failing"
          : row.change;
    const label =
      kind === "regressed"
        ? a.passed === a.total
          ? "Started failing"
          : "Lower pass rate"
        : kind === "improved"
          ? b.passed === b.total
            ? "Now passing"
            : "Higher pass rate"
          : kind === "still-failing"
            ? "Still failing"
            : kind === "unchanged"
              ? "Unchanged"
              : !a.total
                ? "No earlier result"
                : !b.total
                  ? "Not run this time"
                  : row.change === "changed"
                    ? "Context changed"
                    : "Unassessed results";
    return {
      key: row.key,
      caseId: row.id,
      name: row.name,
      suiteId: row.suiteId,
      suiteName: row.suiteName,
      kind,
      label,
      reason: row.reason,
      earlier: a,
      current: b,
    };
  });
}

export const changeKinds: { kind: ChangeKind; label: string }[] = [
  { kind: "regressed", label: "Regressions" },
  { kind: "improved", label: "Improvements" },
  { kind: "still-failing", label: "Still failing" },
  { kind: "review", label: "Needs review" },
  { kind: "unchanged", label: "Unchanged" },
];
