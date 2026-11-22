import {
  ASSESSMENT_SCORE_GROUP,
  DEFAULT_JUDGE_CONTENT,
  DEFAULT_SCORE_GROUP_REF,
  EvaluatorDetailSchema,
  EvaluatorExecutionSchema,
  EvaluatorLibrarySchema,
  SAMPLE_PROJECT as sample,
} from "@kortyx/telemetry-contracts";

const evaluatorId = "10000000-0000-4000-8000-000000000060";
const executionId = "10000000-0000-4000-8000-000000000061";
export function sampleEvaluatorResponse(path: string): unknown | undefined {
  const definition = {
    name: "Support response review",
    description:
      "A fictional versioned judge for exploring Kortyx-aware instructions.",
    content: {
      ...DEFAULT_JUDGE_CONTENT,
      instructions:
        "Assess a support assistant against the supplied criterion. Use successful tool results to check order details and delivery estimates. Distinguish offered choices from the customer's selection. Treat a human pause as a request for input, not a final answer. Explain missing evidence without inventing facts.",
    },
    model: "sample/judge",
    evidence: "trajectory",
    scoreGroup: DEFAULT_SCORE_GROUP_REF,
  };
  const evaluator = {
    id: evaluatorId,
    revision: 2,
    publishedVersion: 1,
    archived: false,
    draft: definition,
    updatedAt: sample.recordedAt,
  };
  const execution = EvaluatorExecutionSchema.parse({
    id: executionId,
    evaluatorId,
    evaluatorVersion: 1,
    evaluatorName: definition.name,
    environment: "production",
    target: { type: "run", runId: sample.runs.success },
    source: "preview",
    status: "completed",
    verdict: null,
    result: {
      group: ASSESSMENT_SCORE_GROUP,
      fields: {
        assessment: {
          status: "scored",
          value:
            "The recorded support response gives the delivery status and the next action. This fictional sample demonstrates a judge preview.",
          reason: "The response is supported by the fictional recording.",
          evidence: [],
        },
      },
    },
    evidence: {
      captured: "Read-only fictional sample evidence.",
      omitted: ["Illustrative sample."],
    },
    renderedMessages: [
      { role: "system", content: definition.content.instructions },
      {
        role: "user",
        content:
          "Criterion: Explain the current delivery status. Recorded response: Your parcel is in transit.",
      },
    ],
    usage: { inputTokens: 120, outputTokens: 40, costUsd: null },
    error: null,
    createdAt: sample.recordedAt,
    endedAt: sample.recordedAt,
  });
  const detail = EvaluatorDetailSchema.parse({
    evaluator,
    versions: [
      {
        version: 1,
        definition,
        hash: "sample-support-judge-v1",
        createdAt: sample.recordedAt,
      },
    ],
    executions: [execution],
  });
  if (path === "/v1/studio/evaluators")
    return EvaluatorLibrarySchema.parse({
      evaluators: [evaluator],
      models: ["sample/judge"],
      canEdit: false,
      canRun: false,
      workerAvailable: false,
    });
  const assessmentGroup = {
    id: DEFAULT_SCORE_GROUP_REF.id,
    revision: 1,
    publishedVersion: 1,
    builtin: true,
    archived: false,
    draft: ASSESSMENT_SCORE_GROUP.definition,
    latest: ASSESSMENT_SCORE_GROUP,
    updatedAt: ASSESSMENT_SCORE_GROUP.createdAt,
  };
  if (path === "/v1/studio/evaluators/score-groups")
    return { groups: [assessmentGroup], canEdit: false };
  if (
    path === `/v1/studio/evaluators/score-groups/${DEFAULT_SCORE_GROUP_REF.id}`
  )
    return { group: assessmentGroup, versions: [ASSESSMENT_SCORE_GROUP] };
  if (path === `/v1/studio/evaluators/${evaluatorId}`) return detail;
  if (path === `/v1/studio/evaluators/executions/${executionId}`)
    return execution;
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
}
