import type { EvaluationResults } from "../schema";
import {
  type ComparisonRow,
  caseRows,
  compareRuns,
  displayName,
  groupCaseRows,
} from "./presentation";

export type EvaluationComparisonRow = ComparisonRow & {
  key: string;
  suiteId: string;
  suiteName: string;
  baselineRunId?: string;
  candidateRunId?: string;
};

/** Pair suites and cases by their identities, never by array order or repetition number. */
export function compareEvaluations(
  baseline: EvaluationResults,
  candidate: EvaluationResults,
): EvaluationComparisonRow[] {
  const left = new Map(baseline.suites.map((suite) => [suite.suiteId, suite]));
  const right = new Map(
    candidate.suites.map((suite) => [suite.suiteId, suite]),
  );
  return [...new Set([...right.keys(), ...left.keys()])].flatMap((suiteId) => {
    const a = left.get(suiteId),
      b = right.get(suiteId);
    const common = {
      suiteId,
      suiteName: b?.suite.name ?? a?.suite.name ?? displayName(suiteId),
      baselineRunId: a?.id,
      candidateRunId: b?.id,
    };
    if (a && b)
      return compareRuns(a, b).map((row) => ({
        ...row,
        ...common,
        key: JSON.stringify([suiteId, row.id]),
      }));
    const available = b ?? a;
    if (!available) return [];
    return groupCaseRows(caseRows(available)).map((group) => ({
      ...common,
      id: group.caseId,
      name: group.name,
      key: JSON.stringify([suiteId, group.caseId]),
      baseline: a ? group.repetitions : [],
      candidate: b ? group.repetitions : [],
      change: "incomplete" as const,
      reason:
        "This suite was not run in both evaluations. No score delta is available.",
    }));
  });
}
