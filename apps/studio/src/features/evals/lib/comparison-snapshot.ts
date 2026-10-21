import type { StudioEvaluationComparison } from "@kortyx/agent/evals";
import { displayName } from "./presentation";

type Suite = StudioEvaluationComparison["suites"][number];
type Attempt = Suite["cases"][number];
export type SnapshotComparisonRow = {
  key: string;
  id: string;
  name: string;
  suiteId: string;
  suiteName: string;
  baselineRunId?: string;
  candidateRunId?: string;
  baseline: Attempt[];
  candidate: Attempt[];
  change: "improved" | "regressed" | "unchanged" | "incomplete" | "changed";
  reason?: string;
};

/** Compare fingerprints, never load conversation evidence just to calculate a delta. */
export function compareEvaluationSnapshots(
  baseline: StudioEvaluationComparison,
  candidate: StudioEvaluationComparison,
): SnapshotComparisonRow[] {
  const left = new Map(baseline.suites.map((s) => [s.suiteId, s]));
  const right = new Map(candidate.suites.map((s) => [s.suiteId, s]));
  return [...new Set([...right.keys(), ...left.keys()])].flatMap((suiteId) => {
    const a = left.get(suiteId),
      b = right.get(suiteId);
    const groups = (suite: Suite | undefined) => {
      const cases = new Map<string, Attempt[]>();
      for (const item of suite?.cases ?? []) {
        const rows = cases.get(item.caseId) ?? [];
        rows.push(item);
        cases.set(item.caseId, rows);
      }
      return cases;
    };
    const ag = groups(a),
      bg = groups(b);
    return [...new Set([...ag.keys(), ...bg.keys()])].map((id) => {
      const x = ag.get(id) ?? [],
        y = bg.get(id) ?? [];
      const da = a?.definitions.find((d) => d.id === id),
        db = b?.definitions.find((d) => d.id === id);
      const common = {
        key: JSON.stringify([suiteId, id]),
        id,
        name: db?.name ?? da?.name ?? displayName(id),
        suiteId,
        suiteName: b?.name ?? a?.name ?? displayName(suiteId),
        baselineRunId: a?.id,
        candidateRunId: b?.id,
        baseline: x,
        candidate: y,
      };
      const outcome = (
        change: SnapshotComparisonRow["change"],
        reason?: string,
      ): SnapshotComparisonRow => ({
        ...common,
        change,
        ...(reason ? { reason } : {}),
      });
      if (!a || !b)
        return outcome(
          "incomplete",
          "This suite was not run in both evaluations. No score delta is available.",
        );
      if (
        !x.length ||
        !y.length ||
        [...x, ...y].some((r) => !["passed", "failed"].includes(r.status))
      )
        return outcome(
          "incomplete",
          "One side is missing a completed, graded attempt.",
        );
      if (
        a.targetId !== b.targetId ||
        a.environment !== b.environment ||
        !a.judge ||
        !b.judge ||
        a.judge !== b.judge ||
        da?.fingerprint !== db?.fingerprint
      )
        return outcome(
          "changed",
          "Application, environment, case definition, or grader differs. Review outputs without a score delta.",
        );
      if ([...x, ...y].some((r) => !r.contexts.length))
        return outcome(
          "incomplete",
          "One side has no recorded conversation context.",
        );
      const contexts = new Map<number, Set<string>>();
      for (const row of [...x, ...y])
        for (const step of row.contexts) {
          const values = contexts.get(step.index) ?? new Set<string>();
          values.add(step.fingerprint);
          contexts.set(step.index, values);
        }
      if ([...contexts.values()].some((values) => values.size > 1))
        return outcome(
          "changed",
          "Recorded inputs or reference facts differ. Review outputs without a score delta.",
        );
      const rate = (rows: Attempt[]) =>
        rows.filter((r) => r.status === "passed").length / rows.length;
      const delta = rate(y) - rate(x);
      return outcome(
        delta > 0 ? "improved" : delta < 0 ? "regressed" : "unchanged",
      );
    });
  });
}
