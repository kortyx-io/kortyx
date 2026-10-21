import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sampleEvaluationComparison } from "@/features/sample-project/comparison";
import { readSampleDataset } from "@/features/sample-project/data";
import {
  summarizeChanges,
  summarizeSnapshotChanges,
} from "./evaluation-changes";

it("preserves every recorded sample comparison, including prices, missing suites and changed context", () => {
  const runs = readSampleDataset().evals.evaluations.map((e) => e.results.run);
  for (const a of runs)
    for (const b of runs)
      expect(
        summarizeSnapshotChanges(
          sampleEvaluationComparison(a),
          sampleEvaluationComparison(b),
        ),
      ).toEqual(summarizeChanges(a, b));
});
