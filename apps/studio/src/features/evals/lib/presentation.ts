import type {
  EvalCaseResult,
  EvalCosts,
  EvalIssue,
  EvalStepResult,
  StudioEvalLiveDetail,
} from "@kortyx/agent/evals";
import type { EvalDetail } from "../schema";
import { sumCaseCosts } from "./cost";

export type CaseRow = {
  environment?: string;
  verification?: EvalCaseResult["verification"];
  phaseDurationsMs?: EvalCaseResult["phaseDurationsMs"];
  costs?: EvalCosts;
  key: string;
  caseId: string;
  name: string;
  repetition: number;
  status: string;
  sessionId?: string;
  durationMs?: number;
  steps: EvalStepResult[];
  completedSteps?: number;
  criteriaPassed?: number;
  criteriaTotal?: number;
  failures?: string[];
  expectedSteps: number;
  errors: EvalIssue[];
  retryAt?: string;
  httpStatus?: number;
};
export const isActive = (status?: string) =>
  status === "queued" || status === "running";
export const displayName = (id: string) =>
  id.replace(/[-_]/g, " ").replace(/^./, (s) => s.toUpperCase());

/** Recorded terminal outcomes, excluding statuses inferred from interrupted transport. */
export function recordedCaseResults(run: EvalDetail) {
  const results = new Map<string, EvalCaseResult>();
  for (const { event } of run.events)
    if (event.type === "case-completed")
      results.set(
        `${event.result.caseId}:${event.result.repetition}`,
        event.result,
      );
  for (const item of run.result?.cases ?? [])
    results.set(`${item.caseId}:${item.repetition}`, item);
  return results;
}

/** Assessed behavior only; infrastructure errors never create a mixed quality result. */
export function mixedCaseResults(
  run: EvalDetail | StudioEvalLiveDetail,
  rows = caseRows(run),
) {
  const results = new Map<
    string,
    { passed: number; failed: number; errors: number; other: number }
  >();
  if (isActive(run.status)) return results;
  const recorded =
    "cases" in run
      ? new Map(
          run.cases.map((item) => [`${item.caseId}:${item.repetition}`, item]),
        )
      : recordedCaseResults(run);
  for (const row of rows) {
    const counts = results.get(row.caseId) ?? {
      passed: 0,
      failed: 0,
      errors: 0,
      other: 0,
    };
    const status = recorded.get(row.key)?.status;
    if (status === "passed") counts.passed++;
    else if (status === "failed") counts.failed++;
    else if (status === "error") counts.errors++;
    else counts.other++;
    results.set(row.caseId, counts);
  }
  for (const [id, counts] of results)
    if (!counts.passed || !counts.failed) results.delete(id);
  return results;
}

export function caseRows(run: EvalDetail | StudioEvalLiveDetail): CaseRow[] {
  const result = "result" in run ? run.result : null;
  const rows = new Map<string, CaseRow>();
  const definitions = new Map(run.suite.cases.map((item) => [item.id, item]));
  const request = run.request;
  const selected = request?.caseIds ?? run.suite.cases.map((item) => item.id);
  const attempts =
    request?.repetitions ??
    Math.max(1, ...(result?.cases.map((item) => item.repetition) ?? []));
  const row = (caseId: string, repetition: number): CaseRow => ({
    environment: run.environment,
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
  for (const { event } of "events" in run ? run.events : []) {
    if (event.type === "case-dispatch") {
      const item = rows.get(`${event.caseId}:${event.repetition}`);
      if (
        item &&
        !["passed", "failed", "error", "cancelled"].includes(item.status)
      ) {
        item.status = isActive(run.status) ? event.status : "unknown";
        if (event.retryAt) item.retryAt = event.retryAt;
        else delete item.retryAt;
        if (event.httpStatus) item.httpStatus = event.httpStatus;
        else delete item.httpStatus;
      }
    }
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
      if (item) {
        const index = item.steps.findIndex(
          (step) => step.index === event.step.index,
        );
        if (index === -1) item.steps.push(event.step);
        else item.steps[index] = event.step;
      }
    }
    if (event.type === "case-completed")
      rows.set(`${event.result.caseId}:${event.result.repetition}`, {
        ...row(event.result.caseId, event.result.repetition),
        ...event.result,
        steps: [...event.result.steps],
        key: `${event.result.caseId}:${event.result.repetition}`,
      });
  }
  for (const item of result?.cases ?? [])
    rows.set(`${item.caseId}:${item.repetition}`, {
      ...row(item.caseId, item.repetition),
      ...item,
      key: `${item.caseId}:${item.repetition}`,
    });
  if ("cases" in run)
    for (const item of run.cases)
      rows.set(`${item.caseId}:${item.repetition}`, {
        ...row(item.caseId, item.repetition),
        ...item,
        phaseDurationsMs: item.phaseDurationsMs as CaseRow["phaseDurationsMs"],
        key: `${item.caseId}:${item.repetition}`,
        steps: [],
      });
  return [...rows.values()].map((original) => {
    const item = {
      ...original,
      costs:
        "caseCosts" in run ? run.caseCosts?.[original.key] : original.costs,
    };
    if (isActive(run.status)) return item;
    if (run.termination?.code === "EVAL_RUN_TIMEOUT") {
      const timeoutIssue = {
        phase: "execute" as const,
        code: "EVAL_RUN_TIMEOUT",
        message: run.termination.message,
        ...(run.termination.timeoutMs
          ? { details: { timeoutMs: run.termination.timeoutMs } }
          : {}),
      };
      if (item.status === "ungraded")
        return { ...item, errors: [...item.errors, timeoutIssue] };
      if (item.status === "not-run") return item;
      if (
        item.errors.some((issue) => issue.code === "EVAL_RUN_TIMEOUT") ||
        ["running", "unknown", "queued", "reconnecting", "retrying"].includes(
          item.status,
        )
      )
        return {
          ...item,
          status: "interrupted",
          errors: item.errors.some((issue) => issue.code === "EVAL_RUN_TIMEOUT")
            ? item.errors
            : [...item.errors, timeoutIssue],
        };
    }
    const status =
      run.status === "cancelled" ? ("cancelled" as const) : ("error" as const);
    return {
      ...item,
      status: item.errors.some(
        (issue) => issue.code === "EVAL_EXECUTION_UNKNOWN",
      )
        ? "unknown"
        : ["queued", "retrying", "reconnecting", "running"].includes(
              item.status,
            )
          ? run.status === "cancelled"
            ? "cancelled"
            : "unknown"
          : item.status === "ungraded"
            ? status
            : item.status,
      steps: item.steps.map((step) =>
        step.status === "ungraded"
          ? { ...step, status, reason: "Evaluation did not complete." }
          : step,
      ),
    };
  });
}
export function progressCounts(rows: CaseRow[]) {
  return {
    passed: rows.filter((r) => r.status === "passed").length,
    failed: rows.filter((r) => r.status === "failed").length,
    error: rows.filter((r) => ["error", "unknown"].includes(r.status)).length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    completed: rows.filter(
      (r) =>
        ![
          "running",
          "queued",
          "retrying",
          "reconnecting",
          "ungraded",
          "not-run",
        ].includes(r.status),
    ).length,
    total: rows.length,
  };
}

export type CaseGroup = {
  caseId: string;
  name: string;
  repetitions: CaseRow[];
  counts: ReturnType<typeof progressCounts>;
  status: string;
  costs?: EvalCosts;
  durationMs?: number;
  defaultRepetition: number;
};

export function groupCaseRows(
  rows: CaseRow[],
  {
    active = false,
    mixedCases,
  }: { active?: boolean; mixedCases?: ReadonlySet<string> } = {},
): CaseGroup[] {
  const groups = new Map<string, CaseRow[]>();
  for (const row of rows) {
    const group = groups.get(row.caseId) ?? [];
    group.push(row);
    groups.set(row.caseId, group);
  }
  return [...groups].map(([caseId, values]) => {
    const repetitions = [...values].sort((a, b) => a.repetition - b.repetition);
    const counts = progressCounts(repetitions);
    const statuses = new Set(repetitions.map((row) => row.status));
    const pending = repetitions.find((row) =>
      ["running", "queued", "retrying", "reconnecting", "ungraded"].includes(
        row.status,
      ),
    );
    const failed = repetitions.find((row) =>
      ["failed", "error", "unknown", "interrupted"].includes(row.status),
    );
    return {
      caseId,
      name: repetitions[0].name,
      repetitions,
      counts,
      status:
        statuses.size === 1
          ? repetitions[0].status
          : !active &&
              (mixedCases?.has(caseId) ??
                (counts.passed > 0 && counts.failed > 0))
            ? "mixed"
            : pending
              ? pending.status === "ungraded"
                ? "ungraded"
                : "running"
              : ([
                  "unknown",
                  "error",
                  "interrupted",
                  "failed",
                  "cancelled",
                  "not-run",
                  "passed",
                ].find((status) => statuses.has(status)) ?? "not-run"),
      costs: sumCaseCosts(repetitions.map((row) => row.costs)),
      durationMs: repetitions.every((row) => row.durationMs !== undefined)
        ? repetitions.reduce((sum, row) => sum + (row.durationMs ?? 0), 0)
        : undefined,
      defaultRepetition: (failed ?? pending ?? repetitions[0]).repetition,
    };
  });
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
  selected?: { baseline: CaseRow[]; candidate: CaseRow[] },
): ComparisonRow[] {
  const a = selected?.baseline ?? caseRows(baseline);
  const b = selected?.candidate ?? caseRows(candidate);
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
