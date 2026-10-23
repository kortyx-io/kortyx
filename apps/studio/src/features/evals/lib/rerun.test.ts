import type { EvalCaseResult, StudioEvalLiveDetail } from "@kortyx/agent/evals";
import { resolveEvalSettings } from "@kortyx/agent/evals";
import { expect, it } from "vitest";
import type { EvalDetail, EvalTargets } from "../schema";
import { mixedCaseResults } from "./presentation";
import { failedRerunQuery } from "./rerun";

const outcomes = [
  "passed",
  "failed",
  "error",
  "cancelled",
  "ungraded",
] as const;
function fixture(statuses: readonly EvalCaseResult["status"][] = outcomes) {
  const cases = statuses.map((_, index) => ({
    id: `case-${index}`,
    steps: [{ message: "Test", expect: { type: "answer" as const } }],
  }));
  const suite = { id: "catalog", cases };
  const result = {
    id: "saved",
    suiteId: suite.id,
    suiteRevision: "old",
    suite,
    startedAt: "2026-10-01T00:00:00Z",
    durationMs: 10,
    status: "failed" as const,
    counts: { passed: 1, failed: 1, error: 1, cancelled: 1 },
    errors: [],
    cases: statuses.map(
      (status, index): NonNullable<EvalDetail["result"]>["cases"][number] => ({
        caseId: cases[index]!.id,
        repetition: 1,
        sessionId: `session-${index}`,
        status,
        durationMs: 1,
        steps: [],
        errors: [],
      }),
    ),
  };
  const run: EvalDetail = {
    id: "saved",
    targetId: "app",
    targetName: "App",
    environment: "staging",
    suiteId: suite.id,
    suiteRevision: "old",
    suite,
    createdAt: result.startedAt,
    startedAt: result.startedAt,
    endedAt: result.startedAt,
    cancelRequestedAt: null,
    error: null,
    status: "failed",
    counts: result.counts,
    request: {
      repetitions: 3,
      concurrency: 2,
      caseTimeoutMs: 10000,
      runTimeoutMs: 60000,
      grading: "app",
    },
    result,
    events: [],
  };
  const targets: EvalTargets = {
    canRun: true,
    targets: [
      {
        id: "app",
        name: "App",
        environment: "staging",
        error: null,
        revisions: { catalog: "current" },
        manifest: {
          schemaVersion: 1,
          suites: [suite],
          responders: [],
          references: [],
          judge: { id: "judge", version: "1" },
        },
      },
    ],
  };
  return { run, targets };
}

it("selects only recorded failed and errored cases, once each, and preserves execution settings without historical state", () => {
  const { run, targets } = fixture();
  run.result!.cases.push({ ...run.result!.cases[1]!, repetition: 2 });
  const before = structuredClone(run);
  expect(failedRerunQuery([run], targets)).toMatchObject({
    launch: true,
    launchRerun: true,
    launchApplication: "app",
    launchScope: "selected",
    launchSuites: ["catalog"],
    launchSuiteCases: [{ suiteId: "catalog", caseIds: ["case-1", "case-2"] }],
    launchAttempts: "3",
    launchConcurrency: "2",
    launchCaseTimeout: "10000",
    launchRunTimeout: "60000",
    launchJudge: "app",
    launchPrompts: "live",
  });
  expect(run).toEqual(before);
});

it("keeps suite identities when a grouped evaluation contains duplicate case IDs", () => {
  const { run, targets } = fixture(["failed"]);
  const second = structuredClone(run);
  second.suiteId = second.suite.id = "second";
  targets.targets[0]!.manifest!.suites.push(second.suite);
  const query = failedRerunQuery([run, second], targets, {
    repetitions: 5,
    judge: "studio",
    concurrency: 4,
  });
  expect(query.launchSuiteCases).toEqual([
    { suiteId: "catalog", caseIds: ["case-0"] },
    { suiteId: "second", caseIds: ["case-0"] },
  ]);
  expect(query).toMatchObject({
    launchAttempts: "5",
    launchJudge: "studio",
    launchConcurrency: "4",
  });
});

it("restores effective defaults saved inside legacy request settings", () => {
  const { run, targets } = fixture(["failed"]);
  run.request = {
    repetitions: 4,
    resolvedSettings: resolveEvalSettings({
      repetitions: 4,
      concurrency: 3,
      judge: "app",
    }),
  };
  expect(failedRerunQuery([run], targets)).toMatchObject({
    launchAttempts: "4",
    launchConcurrency: "3",
    launchJudge: "app",
  });
});

it("accepts recorded progress outcomes for legacy runs but excludes inferred transport errors and ungraded results", () => {
  const { run, targets } = fixture(["error", "ungraded"]);
  const completed = run.result!.cases[0]!;
  run.result = null;
  run.events = [
    { id: 1, event: { type: "case-completed", result: completed } },
    {
      id: 2,
      event: {
        type: "case-started",
        caseId: "case-1",
        repetition: 1,
        sessionId: "uncertain",
      },
    },
  ];
  expect(failedRerunQuery([run], targets).launchSuiteCases).toEqual([
    { suiteId: "catalog", caseIds: ["case-0"] },
  ]);
});

it.each([
  "permission",
  "running",
  "target",
  "environment",
  "case",
  "suite",
  "no-results",
])("refuses an unsafe or unavailable rerun: %s", (reason) => {
  const { run, targets } = fixture(["failed"]);
  if (reason === "permission") targets.canRun = false;
  if (reason === "running") run.status = "running";
  if (reason === "target") targets.targets = [];
  if (reason === "environment") run.environment = "production";
  if (reason === "case") targets.targets[0]!.manifest!.suites[0]!.cases = [];
  if (reason === "suite") targets.targets[0]!.manifest!.suites = [];
  if (reason === "no-results") run.result = null;
  expect(() => failedRerunQuery([run], targets)).toThrow();
});

it("reports mixed assessed outcomes only after completion and separates errors and other attempts", () => {
  const { run } = fixture();
  run.request = { repetitions: 5, caseIds: ["case-0"] };
  run.result!.cases = run.result!.cases.map((item, index) => ({
    ...item,
    caseId: "case-0",
    repetition: index + 1,
  }));
  expect(mixedCaseResults(run).get("case-0")).toEqual({
    passed: 1,
    failed: 1,
    errors: 1,
    other: 2,
  });
  run.status = "running";
  expect(mixedCaseResults(run).size).toBe(0);
});

it("shows mixed results from compact live summaries without reading full conversation evidence", () => {
  const { run } = fixture();
  const { result, events: _, ...metadata } = run;
  const live: StudioEvalLiveDetail = {
    ...metadata,
    version: "projection-1",
    errors: [],
    request: { repetitions: 5, caseIds: ["case-0"] },
    cases: (result?.cases ?? []).map((item, index) => ({
      caseId: "case-0",
      repetition: index + 1,
      status: item.status,
      completedSteps: 0,
      criteriaPassed: 0,
      criteriaTotal: 0,
      failures: [],
      errors: [],
    })),
  };
  expect(mixedCaseResults(live).get("case-0")).toEqual({
    passed: 1,
    failed: 1,
    errors: 1,
    other: 2,
  });
  live.status = "running";
  expect(mixedCaseResults(live).size).toBe(0);
});

it.each([
  ["passed", "error"],
  ["failed", "error"],
  ["error", "cancelled"],
  ["passed", "passed"],
  ["failed", "failed"],
  ["passed", "ungraded"],
] as const)("does not call %j plus %j mixed quality results", (first, second) => {
  const { run } = fixture([first, second]);
  run.request = { repetitions: 2, caseIds: ["case-0"] };
  run.result!.cases = run.result!.cases.map((item, index) => ({
    ...item,
    caseId: "case-0",
    repetition: index + 1,
  }));
  expect(mixedCaseResults(run).size).toBe(0);
});

it("preserves the frozen grading budget on Studio reruns", () => {
  const { run, targets } = fixture();
  run.request = {
    ...run.request!,
    grading: "studio",
    gradingTimeoutMs: 180_000,
  };
  expect(failedRerunQuery([run], targets).launchGradingTimeout).toBe("180000");
});
