import {
  DEFAULT_ASSESSMENT_GROUP,
  type EvaluatorDefinition,
  EvaluatorDetailSchema,
  EvaluatorExecutionSchema,
  EvaluatorLibrarySchema,
  SAMPLE_PROJECT as sample,
} from "@kortyx/telemetry-contracts";

const evaluatorId = "10000000-0000-4000-8000-000000000060";
const executionId = "10000000-0000-4000-8000-000000000061";
export function sampleEvaluatorResponse(path: string): unknown | undefined {
  const definition: EvaluatorDefinition = {
    name: "Support response review",
    description:
      "A fictional published evaluator for exploring assessment results.",
    prompt: { id: sample.promptId, version: 1 },
    model: "sample/judge",
    scoreGroup: { id: "assessment", version: 1 },
    evidence: "response",
  };
  const evaluator = {
    id: evaluatorId,
    revision: 2,
    publishedVersion: 1,
    archived: false,
    draft: definition,
    updatedAt: sample.recordedAt,
  };
  const execution = {
    id: executionId,
    evaluatorId,
    evaluatorVersion: 1,
    evaluatorName: definition.name,
    environment: "production",
    target: { type: "run", runId: sample.runs.success },
    source: "manual",
    status: "completed",
    scoreGroup: DEFAULT_ASSESSMENT_GROUP,
    scores: [
      {
        fieldId: "assessment",
        status: "scored",
        value:
          "The recorded response explains the delivery status and provides the next action. This fictional example demonstrates a saved text assessment.",
        evidence: [],
      },
    ],
    evidence: {
      captured: "Read-only fictional sample evidence.",
      omitted: ["This sample is illustrative."],
    },
    renderedMessages: [
      { role: "system", content: "Assess the recorded support response." },
    ],
    usage: { inputTokens: 120, outputTokens: 40, costUsd: null },
    error: null,
    createdAt: sample.recordedAt,
    endedAt: sample.recordedAt,
  };
  const library = EvaluatorLibrarySchema.parse({
    evaluators: [evaluator],
    scoreGroups: [DEFAULT_ASSESSMENT_GROUP],
    models: ["sample/judge"],
    canEdit: false,
    canRun: false,
    workerAvailable: false,
  });
  const detail = EvaluatorDetailSchema.parse({
    evaluator,
    versions: [{ version: 1, definition, createdAt: sample.recordedAt }],
    rules: [],
    executions: [execution],
    datasets: [
      {
        targetId: sample.targetId,
        suiteId: sample.suiteId,
        evaluatorVersion: 1,
      },
    ],
  });
  if (path === "/v1/studio/evaluators") return library;
  if (path === `/v1/studio/evaluators/${evaluatorId}`) return detail;
  if (path === "/v1/studio/evaluators/scores")
    return { executions: [detail.executions[0]] };
  if (path === "/v1/studio/evaluators/dataset-defaults")
    return {
      bindings: [
        {
          targetId: sample.targetId,
          suiteId: sample.suiteId,
          evaluatorId,
          evaluatorVersion: 1,
        },
      ],
    };
  if (path === "/v1/studio/evaluators/recordings")
    return {
      recordings: [
        {
          target: execution.target,
          label: "Successful support response",
          environment: "production",
        },
      ],
    };
  if (path === `/v1/studio/evaluators/executions/${executionId}`)
    return EvaluatorExecutionSchema.parse(execution);
}
