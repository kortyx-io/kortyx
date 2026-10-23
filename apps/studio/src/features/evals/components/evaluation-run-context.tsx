"use client";

import type { StudioEvaluationDetail } from "@kortyx/agent/evals";
import { KeyValue, Metric } from "@/components/detail/detail-primitives";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { studioHelp } from "@/lib/studio-help";
import { EvalDuration } from "./eval-duration";
import { settingSource } from "./eval-settings-fields";

export function EvaluationRunContext({ run }: { run: StudioEvaluationDetail }) {
  const settings = run.resolvedSettings;
  return (
    <Metric
      label="Execution settings"
      value={
        <InfoTooltip
          label="Execution settings and run metadata"
          documentationUrl={studioHelp.evalSettings.documentationUrl}
          trigger={
            <button
              type="button"
              aria-label="Recorded execution settings"
              className="cursor-help text-xs"
            >
              {settings
                ? `${settings.values.repetitions}× · ${settings.values.concurrency} concurrent`
                : "Recorded context"}
            </button>
          }
        >
          <dl className="text-xs">
            <KeyValue label="Run ID">{run.id}</KeyValue>
            <KeyValue label="Selection">
              {run.selection === "all" ? "All suites" : "Selected suites"}
            </KeyValue>
            <KeyValue label="Created">{formatDateTime(run.createdAt)}</KeyValue>
            <KeyValue label="Duration">
              <EvalDuration run={run} />
            </KeyValue>
            <KeyValue label="Judge">
              {run.judge
                ? `${run.judge.id} · ${run.judge.version}`
                : "Not recorded"}
            </KeyValue>
            {settings ? (
              <>
                <KeyValue label="Repetitions">
                  {settings.values.repetitions} ·{" "}
                  {settingSource(settings.sources.repetitions)}
                </KeyValue>
                <KeyValue label="Concurrency">
                  {settings.values.concurrency} ·{" "}
                  {settingSource(settings.sources.concurrency)}
                </KeyValue>
                <KeyValue label="Case timeout">
                  {formatDurationMs(settings.values.caseTimeoutMs)} ·{" "}
                  {settingSource(settings.sources.caseTimeoutMs)}
                </KeyValue>
                <KeyValue label="Grading timeout">
                  {formatDurationMs(settings.values.gradingTimeoutMs)} ·{" "}
                  {settingSource(settings.sources.gradingTimeoutMs)}
                </KeyValue>
                <KeyValue label="Evaluation timeout">
                  {formatDurationMs(settings.values.runTimeoutMs)} ·{" "}
                  {settingSource(settings.sources.runTimeoutMs)}
                </KeyValue>
              </>
            ) : (
              <>
                <KeyValue label="Repetitions">Not recorded</KeyValue>
                <KeyValue label="Concurrency / timeouts">Not recorded</KeyValue>
              </>
            )}
            {run.metadata.commit ? (
              <KeyValue label="Commit">{run.metadata.commit}</KeyValue>
            ) : null}
            {run.metadata.deploymentUrl ? (
              <KeyValue label="Deployment / CI job">
                <a
                  className="underline"
                  href={run.metadata.deploymentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open deployment / CI job
                </a>
              </KeyValue>
            ) : null}
          </dl>
        </InfoTooltip>
      }
    />
  );
}
