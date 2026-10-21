import type { EvalStepResult } from "@kortyx/agent/evals";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EvalStepAssessment } from "./eval-step-assessment";

vi.mock("./eval-disclosure", () => ({
  EvalDisclosure: ({
    label,
    defaultOpen,
    children,
  }: {
    label: string;
    defaultOpen: boolean;
    children: ReactNode;
  }) => (
    <div data-default-open={defaultOpen}>
      <button type="button">{label}</button>
      {children}
    </div>
  ),
}));
const step: EvalStepResult = {
  index: 0,
  input: { message: "Status?" },
  observation: { type: "answer", text: "In transit", structured: [] },
  expectation: {
    type: "answer",
    criteria: [{ id: "accuracy", text: "Use the verified shipment state." }],
    checks: [{ type: "text-matches", pattern: "\\S" }],
  },
  status: "passed",
  criteria: [
    {
      id: "accuracy",
      text: "Use the verified shipment state.",
      passed: true,
      reason: "Accurately reports the shipment state.",
      evidence: ["In transit"],
    },
  ],
  checks: [
    {
      index: 0,
      check: { type: "text-matches", pattern: "\\S" },
      passed: true,
      reason: "The answer contains text.",
      evidence: ["In transit"],
    },
  ],
};
it("keeps the explanation before criterion, evidence and automatic checks", () => {
  const markup = renderToStaticMarkup(
    <EvalStepAssessment step={step} scope="test" />,
  );
  expect(markup.match(/>Assessment details<\/button>/g)).toHaveLength(1);
  expect(markup).toContain(
    "This execution did not record its grading request.",
  );
  expect(markup).toContain("Assessment details");
  expect(markup).toContain("Criterion");
  expect(markup).toContain("Evidence");
  expect(markup).toContain("Automatic checks");
  expect(markup).toContain("Answer contains text");
  expect(markup.indexOf("Accurately reports")).toBeLessThan(
    markup.indexOf("Assessment details"),
  );
  expect(markup).not.toContain("Expected behavior and evidence");
  expect(markup).not.toContain("Checks and expectations");
  expect(markup).not.toContain("Check definition and evidence");
});
it("retains expected criteria and missing check verdicts without inventing passes", () => {
  const markup = renderToStaticMarkup(
    <EvalStepAssessment
      step={{ ...step, status: "ungraded", criteria: [], checks: [] }}
      scope="test"
    />,
  );
  expect(markup).toContain("Use the verified shipment state.");
  expect(markup.match(/Not assessed/g)?.length).toBeGreaterThanOrEqual(2);
  expect(markup).toContain("No assessment evidence was recorded.");
  expect(markup).not.toContain(">Passed<");
});
it("opens failed details and escapes evidence without executing markup", () => {
  const markup = renderToStaticMarkup(
    <EvalStepAssessment
      step={{
        ...step,
        status: "failed",
        criteria: [
          {
            ...step.criteria[0],
            passed: false,
            evidence: ["<script>alert(1)</script>"],
          },
        ],
      }}
      scope="test"
    />,
  );
  expect(markup).toContain('data-default-open="true"');
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script");
});
