import type { EvalSettings } from "@kortyx/agent/evals";
import type { EvalDetail, EvalTargets } from "../schema";
import { isActive, recordedCaseResults } from "./presentation";

type CompactRerunRun = Pick<
  EvalDetail,
  "suiteId" | "targetId" | "environment" | "resolvedSettings"
> & {
  status: string;
  cases: readonly { caseId: string; status: string }[];
  request?: EvalDetail["request"];
  result?: EvalDetail["result"];
};

/** Prepare a fresh launch, never replay historical continuations or mutate saved results. */
export function failedRerunQuery(
  runs: readonly (EvalDetail | CompactRerunRun)[],
  targets: EvalTargets,
  settings?: EvalSettings,
) {
  if (!targets.canRun)
    throw new Error("You do not have permission to run evaluations.");
  const first = runs[0];
  if (!first || runs.some((run) => isActive(run.status)))
    throw new Error(
      "Wait for the evaluation to finish before rerunning cases.",
    );
  const target = targets.targets.find(
    (item) =>
      item.id === first.targetId && item.environment === first.environment,
  );
  if (
    !target?.manifest ||
    runs.some(
      (run) =>
        run.targetId !== first.targetId ||
        run.environment !== first.environment,
    )
  )
    throw new Error(
      "The original application and environment are not available. Refresh the evaluation targets.",
    );
  const selections = new Map<string, Set<string>>();
  for (const run of runs) {
    const failed = [
      ...("cases" in run ? run.cases : recordedCaseResults(run).values()),
    ].filter((item) => item.status === "failed" || item.status === "error");
    if (!failed.length) continue;
    const suite = target.manifest.suites.find(
      (item) => item.id === run.suiteId,
    );
    if (
      !suite ||
      failed.some(
        (item) => !suite.cases.some((current) => current.id === item.caseId),
      )
    )
      throw new Error(
        "Some failed cases are no longer in the deployed suites. Review the current suite definitions and select cases manually.",
      );
    const ids = selections.get(suite.id) ?? new Set<string>();
    for (const item of failed) ids.add(item.caseId);
    selections.set(suite.id, ids);
  }
  if (!selections.size)
    throw new Error("There are no recorded failed or errored cases to rerun.");
  const previous =
    settings ??
    first.resolvedSettings?.values ??
    first.request?.resolvedSettings?.values ??
    first.request;
  const judge =
    settings?.judge ??
    first.resolvedSettings?.values.judge ??
    first.request?.resolvedSettings?.values.judge ??
    first.request?.grading ??
    first.request?.judge?.location ??
    first.result?.judge?.location;
  return {
    launch: true,
    launchRerun: true,
    launchApplication: target.id,
    launchSuite: "",
    launchScope: "selected" as const,
    launchSuites: [...selections.keys()],
    launchSuiteCases: [...selections].map(([suiteId, ids]) => ({
      suiteId,
      caseIds: [...ids],
    })),
    launchExpandedSuites: [...selections.keys()],
    launchCases: null,
    launchAttempts:
      previous?.repetitions === undefined ? null : String(previous.repetitions),
    launchConcurrency:
      previous?.concurrency === undefined ? null : String(previous.concurrency),
    launchCaseTimeout:
      previous?.caseTimeoutMs === undefined
        ? null
        : String(previous.caseTimeoutMs),
    launchRunTimeout:
      previous?.runTimeoutMs === undefined
        ? null
        : String(previous.runTimeoutMs),
    launchJudge: judge ?? null,
    launchPrompts: "live" as const,
    launchPrompt: null,
    launchVersion: null,
    launchGroup: null,
  };
}
