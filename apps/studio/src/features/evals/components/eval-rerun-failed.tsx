"use client";

import {
  type StudioEvalLiveDetail,
  StudioEvaluationComparisonSchema,
  type StudioEvaluationDetail,
} from "@kortyx/agent/evals";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useStudioQueryStates } from "@/lib/nuqs";
import { studioHelp } from "@/lib/studio-help";
import { evalRequest } from "../api/client";
import { evalSetupParsers } from "../hooks/use-eval-setup";
import { isActive, recordedCaseResults } from "../lib/presentation";
import { failedRerunQuery } from "../lib/rerun";
import {
  type EvalDetail,
  type EvalTargets,
  EvalTargetsResponseSchema,
} from "../schema";
import { EvalRunSetup } from "./eval-run-setup";

export function EvalRerunFailed({
  run,
  canRun,
  matchPath,
  suiteRunId,
}: {
  run: EvalDetail | StudioEvalLiveDetail | StudioEvaluationDetail;
  canRun: boolean;
  matchPath?: string;
  suiteRunId?: string | null;
}) {
  const [query, setQuery] = useStudioQueryStates(evalSetupParsers, {
    shallow: true,
  });
  const [targets, setTargets] = useState<EvalTargets | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const selectedSuite =
    "suites" in run && suiteRunId
      ? run.suites.find((suite) => suite.id === suiteRunId)
      : undefined;
  const hasFailures = selectedSuite
    ? Boolean(selectedSuite.counts?.failed || selectedSuite.counts?.error)
    : "suites" in run
      ? Boolean(run.counts.failed || run.counts.error)
      : [
          ...("cases" in run ? run.cases : recordedCaseResults(run).values()),
        ].some((item) => item.status === "failed" || item.status === "error");
  // Rehydrate the launch URL without discovering every target on normal live reads.
  useEffect(() => {
    if (
      !canRun ||
      !hasFailures ||
      !query.launchRerun ||
      !query.launch ||
      targets
    )
      return;
    const controller = new AbortController();
    void evalRequest("targets", undefined, controller.signal)
      .then((value) => setTargets(EvalTargetsResponseSchema.parse(value)))
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load evaluation targets.",
          );
      });
    return () => controller.abort();
  }, [canRun, hasFailures, query.launchRerun, query.launch, targets]);
  if (!canRun || isActive(selectedSuite?.status ?? run.status) || !hasFailures)
    return null;
  const prepare = async () => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const [runs, available] = await Promise.all([
        "suites" in run
          ? evalRequest(
              `evaluations/${encodeURIComponent(run.id)}/comparison`,
            ).then((value) =>
              StudioEvaluationComparisonSchema.parse(value).run.suites.filter(
                (suite) => !suiteRunId || suite.id === suiteRunId,
              ),
            )
          : [run],
        evalRequest("targets").then((value) =>
          EvalTargetsResponseSchema.parse(value),
        ),
      ]);
      setTargets(available);
      await setQuery(
        failedRerunQuery(runs, available, run.resolvedSettings?.values),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not prepare the rerun.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <InfoTooltip
        label="About rerunning failed cases"
        documentationUrl={studioHelp.evalRerun.documentationUrl}
        triggerAction="preserve"
        trigger={
          <Button size="sm" disabled={working} onClick={() => void prepare()}>
            <RotateCcw data-icon="inline-start" />
            {working ? "Preparing rerun…" : "Rerun failed cases"}
          </Button>
        }
      >
        {studioHelp.evalRerun.description}
      </InfoTooltip>
      {error ? (
        <p role="alert" className="max-w-sm text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {targets ? (
        <EvalRunSetup
          targets={targets}
          matchPath={
            matchPath ??
            ("suites" in run
              ? `/evals/evaluations/${run.id}`
              : `/evals/runs/${run.id}`)
          }
        />
      ) : null}
    </div>
  );
}
