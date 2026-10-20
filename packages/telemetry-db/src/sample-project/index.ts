import type { EvalCaseResult, EvalCosts } from "@kortyx/agent/evals";
import {
  SAMPLE_PROJECT,
  StudioCatalogsResponseSchema,
  StudioDetailEventSchema,
  StudioInterruptSchema,
  StudioRunSchema,
  StudioSessionSchema,
  StudioWorkflowsResponseSchema,
} from "@kortyx/telemetry-contracts";
import {
  calculateEvalAttemptCosts,
  sumEvalCosts,
} from "../repositories/eval-costs";
import { createStudioReadModelsFromRecords } from "../repositories/studio-read-models";
import { createStudioWorkflowModelsFromProjections } from "../repositories/studio-workflows";
import { createSampleExecutionRecords } from "./executions";

export { createSampleDiagnostic, sampleDiagnosticId } from "./diagnostics";

export { SAMPLE_SUPPORT_CONVERSATIONS } from "./scenarios";

/** The same cost reducer used by saved evaluations, over authored sample events. */
export function createSampleEvaluationCostReader() {
  const { events } = createSampleExecutionRecords();
  return (cases: EvalCaseResult[]) => {
    const caseCosts = Object.fromEntries(
      cases.map((entry) => {
        const runIds = new Set(
          entry.runtimeExecutions?.map((execution) => execution.runId),
        );
        return [
          `${entry.caseId}:${entry.repetition}`,
          calculateEvalAttemptCosts(
            {
              sessionId: entry.sessionId,
              runtimeExecutions: entry.runtimeExecutions,
              steps: entry.steps,
              finished: true,
            },
            events.filter(
              (event) =>
                event.sessionId === entry.sessionId && runIds.has(event.runId),
            ),
            [],
          ),
        ];
      }),
    );
    const costs: EvalCosts = {
      workflow: sumEvalCosts(
        Object.values(caseCosts).map((cost) => cost.workflow),
      ),
      judge: sumEvalCosts(Object.values(caseCosts).map((cost) => cost.judge)),
      total: sumEvalCosts(Object.values(caseCosts).map((cost) => cost.total)),
    };
    return { caseCosts, costs };
  };
}

export function sumSampleEvaluationCosts(parts: EvalCosts[]): EvalCosts {
  return {
    workflow: sumEvalCosts(parts.map((costs) => costs.workflow)),
    judge: sumEvalCosts(parts.map((costs) => costs.judge)),
    total: sumEvalCosts(parts.map((costs) => costs.total)),
  };
}

/** Pure, deterministic projection of synthetic events. Never opens a database. */
export function createSampleProjectReadModels(
  options: { runIds?: readonly string[] } = {},
) {
  const records = createSampleExecutionRecords();
  const events = options.runIds
    ? records.events.filter((event) => options.runIds?.includes(event.runId))
    : records.events;
  const models = createStudioReadModelsFromRecords({
    ...records,
    events,
    rates: [],
  });
  const workflows = createStudioWorkflowModelsFromProjections({
    runs: models.runs,
    childRuns: models.childRuns ?? [],
    revisions: records.revisions,
    toolEvents: events.filter((event) => event.type.startsWith("tool.")),
    range: models.workflows.cohort,
    now: new Date(SAMPLE_PROJECT.referenceTime),
  });
  return {
    diagnostics: records.diagnostics.filter(
      (diagnostic) =>
        !options.runIds ||
        options.runIds.includes(diagnostic.manifest.correlation.runId ?? ""),
    ),
    runs: StudioRunSchema.array().parse(models.runs),
    childRuns: StudioRunSchema.array().parse(models.childRuns),
    sessions: StudioSessionSchema.array().parse(models.sessions),
    interrupts: StudioInterruptSchema.array().parse(models.interrupts),
    workflows: StudioWorkflowsResponseSchema.parse(workflows),
    catalogs: StudioCatalogsResponseSchema.parse(models.catalogs),
    detailEvents: StudioDetailEventSchema.array().parse(models.detailEvents),
  };
}

export {
  emptyEvalLiveProjection,
  projectEvalProgress,
} from "../repositories/eval-live-projection";
