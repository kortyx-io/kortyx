import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { CaseRow } from "../lib/presentation";
import { EvalSuiteStatusBar, suiteStatusCounts } from "./eval-suite-status-bar";

it("represents all recorded and pending attempts without inventing running outcomes", () => {
  const counts = suiteStatusCounts({
    status: "running",
    totalAttempts: 10,
    counts: { passed: 3, failed: 1, error: 1, cancelled: 0 },
  });
  expect(counts).toEqual({
    passed: 3,
    failed: 1,
    error: 1,
    cancelled: 0,
    pending: 5,
  });
  const html = renderToStaticMarkup(<EvalSuiteStatusBar counts={counts} />);
  expect(html).toContain("width:30%");
  expect(html).toContain("width:50%");
  expect(html).not.toContain("NaN");
});
it("uses live attempt statuses for queued, running and terminal proportions", () => {
  const rows = ["passed", "passed", "running", "queued"].map(
    (status) => ({ status }) as CaseRow,
  );
  expect(suiteStatusCounts({ status: "running" }, rows)).toEqual({
    passed: 2,
    running: 1,
    queued: 1,
  });
  expect(renderToStaticMarkup(<EvalSuiteStatusBar counts={{}} />)).toContain(
    "No conversation results",
  );
});
