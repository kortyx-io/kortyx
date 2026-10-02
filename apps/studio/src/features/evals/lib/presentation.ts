import type { EvalStepResult } from "@kortyx/agent/evals";
import type { EvalDetail } from "../schema";

export type CaseRow = {
  key: string;
  caseId: string;
  name: string;
  repetition: number;
  status: string;
  sessionId?: string;
  durationMs?: number;
  steps: EvalStepResult[];
  expectedSteps: number;
  errors: { phase: string; code: string; message: string }[];
};
export const isActive = (status?: string) =>
  status === "queued" || status === "running";
export const displayName = (id: string) =>
  id.replace(/[-_]/g, " ").replace(/^./, (s) => s.toUpperCase());

export function caseRows(run: EvalDetail): CaseRow[] {
  const rows = new Map<string, CaseRow>();
  const definitions = new Map(run.suite.cases.map((item) => [item.id, item]));
  const request = run.request;
  const selected = request?.caseIds ?? run.suite.cases.map((item) => item.id);
  const attempts =
    request?.repetitions ??
    Math.max(1, ...(run.result?.cases.map((item) => item.repetition) ?? []));
  const row = (caseId: string, repetition: number): CaseRow => ({
    key: `${caseId}:${repetition}`,
    caseId,
    name: definitions.get(caseId)?.name ?? displayName(caseId),
    repetition,
    status: isActive(run.status) ? "queued" : "not-run",
    steps: [],
    expectedSteps: definitions.get(caseId)?.steps.length ?? 0,
    errors: [],
  });
  for (const id of selected)
    for (let attempt = 1; attempt <= attempts; attempt++)
      rows.set(`${id}:${attempt}`, row(id, attempt));
  for (const { event } of run.events) {
    if (event.type === "case-started")
      rows.set(`${event.caseId}:${event.repetition}`, {
        ...row(event.caseId, event.repetition),
        status: isActive(run.status)
          ? "running"
          : run.status === "cancelled"
            ? "cancelled"
            : "error",
        sessionId: event.sessionId,
      });
    if (event.type === "step-completed") {
      const item = rows.get(`${event.caseId}:${event.repetition}`);
      if (item && !item.steps.some((step) => step.index === event.step.index))
        item.steps.push(event.step);
    }
    if (event.type === "case-completed")
      rows.set(`${event.result.caseId}:${event.result.repetition}`, {
        ...row(event.result.caseId, event.result.repetition),
        ...event.result,
        key: `${event.result.caseId}:${event.result.repetition}`,
      });
  }
  for (const item of run.result?.cases ?? [])
    rows.set(`${item.caseId}:${item.repetition}`, {
      ...row(item.caseId, item.repetition),
      ...item,
      key: `${item.caseId}:${item.repetition}`,
    });
  return [...rows.values()];
}
export function progressCounts(rows: CaseRow[]) {
  return {
    passed: rows.filter((r) => r.status === "passed").length,
    failed: rows.filter((r) => r.status === "failed").length,
    error: rows.filter((r) => r.status === "error").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    completed: rows.filter(
      (r) => !["running", "queued", "not-run"].includes(r.status),
    ).length,
    total: rows.length,
  };
}
// Object key order is not a data change. Array order remains significant.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export type ComparisonRow = {
  id: string;
  name: string;
  baseline: CaseRow[];
  candidate: CaseRow[];
  change: "improved" | "regressed" | "unchanged" | "incomplete" | "changed";
  reason?: string;
};
export function compareRuns(
  baseline: EvalDetail,
  candidate: EvalDetail,
): ComparisonRow[] {
  const a = caseRows(baseline);
  const b = caseRows(candidate);
  const ids = new Set([...a, ...b].map((r) => r.caseId));
  const judgeChanged =
    !baseline.result?.judge ||
    !candidate.result?.judge ||
    canonical(baseline.result.judge) !== canonical(candidate.result.judge);
  return [...ids].map((id) => {
    const left = a.filter((r) => r.caseId === id);
    const right = b.filter((r) => r.caseId === id);
    const common = {
      id,
      name: right[0]?.name ?? left[0]?.name ?? displayName(id),
      baseline: left,
      candidate: right,
    };
    if (
      !left.length ||
      !right.length ||
      [...left, ...right].some((r) => !["passed", "failed"].includes(r.status))
    )
      return {
        ...common,
        change: "incomplete",
        reason: "One side is missing a completed, graded attempt.",
      };
    const definitionA = baseline.suite.cases.find((item) => item.id === id);
    const definitionB = candidate.suite.cases.find((item) => item.id === id);
    if (
      baseline.targetId !== candidate.targetId ||
      baseline.environment !== candidate.environment ||
      judgeChanged ||
      canonical(definitionA) !== canonical(definitionB)
    )
      return {
        ...common,
        change: "changed",
        reason:
          "Application, environment, case definition, or grader differs. Review outputs without a score delta.",
      };
    // Failed conversations can stop before later steps. Compare recorded context
    // at each shared step; the missing continuation is an outcome, not data drift.
    const stepsByIndex = new Map<number, Set<string>>();
    for (const row of [...left, ...right]) {
      for (const step of row.steps) {
        const contexts = stepsByIndex.get(step.index) ?? new Set<string>();
        contexts.add(
          canonical({
            input: step.input,
            reference: step.reference,
            expectation: step.expectation,
          }),
        );
        stepsByIndex.set(step.index, contexts);
      }
    }
    if (
      !left.every((row) => row.steps.length) ||
      !right.every((row) => row.steps.length)
    )
      return {
        ...common,
        change: "incomplete",
        reason: "One side has no recorded conversation context.",
      };
    if ([...stepsByIndex.values()].some((contexts) => contexts.size > 1))
      return {
        ...common,
        change: "changed",
        reason:
          "Recorded inputs or reference facts differ. Review outputs without a score delta.",
      };
    const rate = (rows: CaseRow[]) =>
      rows.filter((r) => r.status === "passed").length / rows.length;
    const delta = rate(right) - rate(left);
    return {
      ...common,
      change: delta > 0 ? "improved" : delta < 0 ? "regressed" : "unchanged",
    };
  });
}
export const passLabel = (rows: CaseRow[]) =>
  rows.length
    ? `${rows.filter((r) => r.status === "passed").length} / ${rows.length} passed`
    : "Not run";
