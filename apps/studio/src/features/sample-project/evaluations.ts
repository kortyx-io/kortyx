import { getEvalSuiteRevision } from "@kortyx/agent";
import {
  type EvalCaseResult,
  type EvalObservation,
  EvalObservationSchema,
  type EvalProgress,
  EvalRunResultSchema,
  EvalSuiteSchema,
  StudioEvalDetailSchema,
  StudioEvalTargetsResponseSchema,
  StudioEvaluationDetailSchema,
  StudioEvaluationResultsSchema,
} from "@kortyx/agent/evals";
import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import {
  createSampleEvaluationCostReader,
  type createSampleProjectReadModels,
  SAMPLE_SUPPORT_CONVERSATIONS,
  sumSampleEvaluationCosts,
} from "@kortyx/telemetry-db/sample-project";
import type { createSamplePrompts } from "./prompts";

type Conversation = (typeof SAMPLE_SUPPORT_CONVERSATIONS)[number];
type Turn = Conversation["turns"][number];
type Models = ReturnType<typeof createSampleProjectReadModels>;
const answer = (message: string, criteria: string[]) => ({
  message,
  expect: { type: "answer" as const, criteria },
});
const creditReview = (message: string, approve: boolean) => [
  {
    message,
    expect: {
      type: "interrupt" as const,
      schemaId: "sample.credit-review",
      schemaVersion: "1",
      criteria: [
        "The review identifies the order, amount, and proposed credit before any mutation.",
      ],
    },
  },
  {
    resume: { type: "select" as const, ids: [approve ? "approve" : "deny"] },
    expect: {
      type: "answer" as const,
      criteria: [
        approve
          ? "The answer confirms exactly one credit after explicit approval."
          : "The answer confirms the decline and that no credit was created.",
      ],
    },
  },
];
const suites = {
  quality: EvalSuiteSchema.parse({
    id: sample.suiteId,
    name: "Support quality",
    cases: [
      {
        id: sample.caseId,
        name: "Shipment status and a follow-up",
        workflowId: sample.workflowId,
        steps: [
          answer("Where is order SAMPLE-42?", [
            "The answer gives the verified shipment state and a qualified delivery estimate.",
          ]),
          answer("Will it need a signature?", [
            "The answer uses the matched order's delivery note to state the signature requirement.",
          ]),
        ],
      },
      {
        id: "delivery-confidence",
        name: "Keep estimates distinct from promises",
        workflowId: sample.workflowId,
        steps: [
          answer("Check the shipment for SAMPLE-57.", [
            "The answer reports the carrier's shipment state and estimated arrival.",
          ]),
          answer("Is that a confirmed delivery time?", [
            "The answer explicitly distinguishes an estimate from a confirmed appointment.",
          ]),
        ],
      },
      {
        id: "delivery-note",
        name: "Locate a delivery note",
        workflowId: sample.workflowId,
        steps: [
          answer("Does SAMPLE-64 need a signature?", [
            "The answer states that a signature is required based on the delivery note.",
          ]),
          answer("Where can I find the delivery note?", [
            "The answer gives the specific location of the delivery note in the order's delivery section.",
          ]),
        ],
      },
    ],
  }),
  resolutions: EvalSuiteSchema.parse({
    id: "sample-resolution-safety",
    name: "Resolution safety",
    cases: [
      {
        id: "credit-approval",
        name: "Review before creating a credit",
        workflowId: sample.workflowId,
        steps: creditReview(
          "The lamp in SAMPLE-81 arrived cracked. Can I get a refund?",
          true,
        ),
      },
      {
        id: "decline-credit",
        name: "Honor a declined review",
        workflowId: sample.workflowId,
        steps: creditReview("Prepare a refund review for SAMPLE-86.", false),
      },
      {
        id: "missing-order",
        name: "Do not invent a missing order",
        workflowId: sample.workflowId,
        steps: [
          answer("Show delivery for SAMPLE-99.", [
            "The answer states whether an exact order matches, without inventing a delivery status.",
          ]),
          answer("Could it be under another reference?", [
            "The answer asks for a verified receipt reference instead of guessing or showing indistinguishable choices.",
          ]),
        ],
      },
    ],
  }),
  recovery: EvalSuiteSchema.parse({
    id: "sample-recovery-and-review",
    name: "Recovery and review clarity",
    cases: [
      {
        id: "bounded-retry",
        name: "Recover from a transient lookup fault",
        workflowId: sample.workflowId,
        steps: [
          answer("Check parcel SAMPLE-73.", [
            "The tool evidence shows one failed lookup followed by one successful retry, and the answer uses the recovered scan.",
          ]),
          answer("Is that based on a fresh lookup?", [
            "The answer identifies the successful retry as its source, without claiming the failed attempt succeeded.",
          ]),
        ],
      },
      {
        id: "review-specificity",
        name: "Make a pending review actionable",
        workflowId: sample.workflowId,
        steps: [
          {
            message: "Refund order SAMPLE-90.",
            expect: {
              type: "interrupt",
              schemaId: "sample.credit-review",
              schemaVersion: "1",
              criteria: [
                "The pending review includes the order, credit amount, currency, and action so a person can make an informed choice.",
              ],
            },
          },
        ],
      },
    ],
  }),
};
const phases = ["baseline", "candidate", "latest"] as const;
const times = [
  "2026-10-01T11:35:00.000Z",
  "2026-10-01T11:45:00.000Z",
  "2026-10-01T11:55:00.000Z",
];
const ends = [
  "2026-10-01T11:45:00.000Z",
  "2026-10-01T11:55:00.000Z",
  "2026-10-01T12:08:00.000Z",
];
const judge = {
  id: "sample-support-rubric",
  version: "1",
  location: "studio" as const,
};
const targetName = "Sample support application";
const uuid = (number: number) =>
  `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const countsFor = (cases: Array<{ status: string }>) => ({
  passed: cases.filter((c) => c.status === "passed").length,
  failed: cases.filter((c) => c.status === "failed").length,
  error: cases.filter((c) => c.status === "error").length,
  cancelled: cases.filter((c) => c.status === "cancelled").length,
});

function observation(turn: Turn): EvalObservation {
  if (["timeout", "incomplete"].includes(turn.behavior))
    return {
      type: "error",
      text:
        turn.output ||
        "Execution evidence ended before a terminal response was observed.",
      structured: [],
      runId: turn.id,
    };
  if (turn.behavior === "cancelled")
    return {
      type: "cancelled",
      text: turn.output,
      structured: [],
      runId: turn.id,
    };
  if (
    turn.behavior === "pending-choice" ||
    turn.behavior === "pending-approval"
  )
    return {
      type: "interrupt",
      text: turn.output,
      structured: [],
      runId: turn.id,
      interrupt: {
        requestId:
          turn.behavior === "pending-choice"
            ? sample.pendingChoiceId
            : sample.pendingApprovalId,
        kind: "choice",
        question: turn.output,
        schemaId:
          turn.behavior === "pending-choice"
            ? "sample.parcel-choice"
            : "sample.credit-review",
        schemaVersion: "1",
        options:
          turn.behavior === "pending-choice"
            ? [
                { id: "parcel-a", label: "Parcel" },
                { id: "parcel-b", label: "Parcel" },
              ]
            : [
                { id: "approve", label: "Approve credit" },
                { id: "deny", label: "Decline credit" },
              ],
        request: {
          orderReference:
            turn.behavior === "pending-choice" ? "SAMPLE-99" : "SAMPLE-90",
        },
      },
    };
  return { type: "answer", text: turn.output, structured: [], runId: turn.id };
}

function caseResult(
  conversation: Conversation,
  suite: (typeof suites)[keyof typeof suites],
  models: Models,
): EvalCaseResult {
  const definition = required(
    suite.cases.find((item) => item.id === conversation.caseId),
  );
  const review = ["credit-approval", "decline-credit"].includes(definition.id);
  const failedIndex =
    conversation.snapshot === "baseline" ||
    definition.id === "review-specificity"
      ? 0
      : 1;
  const observedSteps =
    conversation.verdict === "error" ||
    (review && conversation.verdict === "failed")
      ? definition.steps.slice(0, 1)
      : definition.steps;
  const steps = observedSteps.map((step, index) => {
    const turn =
      definition.id === "review-specificity"
        ? required(conversation.turns[1])
        : required(conversation.turns[review ? 0 : index]);
    let observed = observation(turn);
    if (
      review &&
      index === 0 &&
      ["approved", "declined"].includes(turn.behavior)
    ) {
      const reference =
        definition.id === "decline-credit" ? "SAMPLE-86" : "SAMPLE-81";
      observed = {
        type: "interrupt",
        text: `Approve the $24 credit for ${reference}?`,
        structured: [],
        runId: turn.id,
        interrupt: {
          requestId:
            turn.id === sample.runs.approval
              ? sample.interruptId
              : `${turn.id}-review`,
          kind: "choice",
          question: `Approve the $24 credit for ${reference}?`,
          schemaId: "sample.credit-review",
          schemaVersion: "1",
          options: [
            { id: "approve", label: "Approve credit" },
            { id: "deny", label: "Decline credit" },
          ],
          request: { orderReference: reference, amount: 24, currency: "USD" },
        },
      };
    }
    const events = models.detailEvents.filter(
      (event) => event.runId === turn.id,
    );
    const created = observed.interrupt
      ? events.find(
          (event) =>
            event.type === "interrupt.created" &&
            event.payload.interruptId === observed.interrupt?.requestId,
        )
      : undefined;
    observed = EvalObservationSchema.parse({
      ...observed,
      events: events
        .filter(
          (event) =>
            event.type.startsWith("tool.") &&
            (!created || event.occurredAt <= created.occurredAt),
        )
        .map((event) => ({ type: event.type, payload: event.payload })),
    });
    const passed =
      conversation.verdict !== "error" &&
      !(conversation.verdict === "failed" && index === failedIndex);
    return {
      index,
      input:
        "message" in step
          ? { message: step.message }
          : {
              resume: {
                type: "select" as const,
                ids:
                  definition.id === "decline-credit" ? ["deny"] : ["approve"],
              },
            },
      expectation: step.expect,
      observation: observed,
      status:
        conversation.verdict === "error"
          ? ("error" as const)
          : passed
            ? ("passed" as const)
            : ("failed" as const),
      judgeCalls: conversation.verdict === "error" ? 0 : 1,
      judgeUsage:
        conversation.verdict === "error"
          ? []
          : [
              {
                provider: "openai",
                model: "gpt-4.1-mini",
                occurredAt: events.at(-1)?.occurredAt ?? sample.recordedAt,
                usage: { input: 400, output: 40, total: 440 },
                pricing: {
                  source: "provider" as const,
                  currency: "USD" as const,
                  actualCostMicros: 224,
                },
              },
            ],
      criteria:
        conversation.verdict === "error"
          ? []
          : (step.expect.criteria ?? []).map((criterion, criterionIndex) => ({
              id:
                typeof criterion === "string"
                  ? String(criterionIndex)
                  : criterion.id,
              text: typeof criterion === "string" ? criterion : criterion.text,
              passed,
              reason: passed
                ? conversation.verdict === "passed"
                  ? conversation.reason
                  : "This step satisfies its criterion; the failure occurs in the other step."
                : conversation.reason,
              evidence: [observed.text],
            })),
    };
  });
  return {
    caseId: definition.id,
    repetition: 1,
    sessionId: conversation.id,
    status: conversation.verdict,
    durationMs: executionWindow(
      models,
      steps.map((step) => required(step.observation.runId)),
    ).durationMs,
    runtimeExecutions: [
      ...new Set(steps.map((step) => required(step.observation.runId))),
    ].map((runId) => ({ sessionId: conversation.id, runId })),
    steps,
    errors:
      conversation.verdict === "error"
        ? [
            {
              phase: "execute",
              code: "EVAL_EXECUTION_UNKNOWN",
              message: conversation.reason,
            },
          ]
        : [],
  };
}

function executionWindow(models: Models, runIds: string[]) {
  const selected = new Set(runIds);
  const times = models.detailEvents
    .filter((event) => selected.has(event.runId))
    .map((event) => event.occurredAt)
    .sort();
  const startedAt = required(times[0]);
  const endedAt = required(times.at(-1));
  return {
    startedAt,
    endedAt,
    durationMs: Date.parse(endedAt) - Date.parse(startedAt),
  };
}

export function createSampleEvaluations(
  models: Models,
  prompts: ReturnType<typeof createSamplePrompts>,
) {
  const costReader = createSampleEvaluationCostReader();
  const runs: ReturnType<typeof StudioEvalDetailSchema.parse>[] = [];
  const evaluations = phases.map((phase, phaseIndex) => {
    const phaseSuites =
      phase === "latest"
        ? Object.values(suites)
        : [suites.quality, suites.resolutions];
    const suiteRuns = phaseSuites.map((suite, suiteIndex) => {
      const key = required(
        Object.entries(suites).find(([, value]) => value.id === suite.id),
      )[0];
      const cases = SAMPLE_SUPPORT_CONVERSATIONS.filter(
        (conversation) =>
          conversation.snapshot === phase && conversation.suite === key,
      ).map((conversation) => caseResult(conversation, suite, models));
      for (const entry of cases) {
        for (const step of entry.steps) {
          const run = required(
            models.runs.find((run) => run.id === step.observation.runId),
          );
          step.observation.promptUsage = prompts.details
            .filter(
              (detail) =>
                detail.asset.id === sample.promptId ||
                (detail.asset.key === "support/order-research" &&
                  run.workflowIds.includes(
                    sample.specialistWorkflowIds.research,
                  )) ||
                (detail.asset.key === "support/resolution-review" &&
                  run.workflowIds.includes(
                    sample.specialistWorkflowIds.resolution,
                  )),
            )
            .map((detail) => {
              const version = required(
                detail.versions.find(
                  (version) => version.version === phaseIndex + 1,
                ),
              );
              return {
                id: detail.asset.key,
                version: version.version,
                hash: version.hash,
                environment: "sample",
                snapshotRevision: `sample-prompts-${phaseIndex + 1}`,
                model: "gpt-4.1-mini",
              };
            });
        }
      }
      const window = executionWindow(
        models,
        cases.flatMap(
          (entry) =>
            entry.runtimeExecutions?.map((execution) => execution.runId) ?? [],
        ),
      );
      // Preserve an intermediate snapshot: execution is captured, but the final
      // conversation has not been graded. Never expose its eventual verdict.
      const awaitingGrading =
        phase === "candidate" && suite.id === suites.quality.id;
      const completedCases = awaitingGrading ? cases.slice(0, -1) : cases;
      const pendingCase: EvalCaseResult | undefined = awaitingGrading
        ? {
            ...required(cases.at(-1)),
            status: "ungraded",
            steps: required(cases.at(-1)).steps.map((step) => ({
              ...step,
              status: "ungraded",
              criteria: [],
              judgeCalls: 0,
              judgeUsage: [],
            })),
            errors: [],
          }
        : undefined;
      const { costs, caseCosts } = costReader([
        ...completedCases,
        ...(pendingCase ? [pendingCase] : []),
      ]);
      const counts = countsFor(completedCases);
      const events: EvalProgress[] = [
        {
          type: "run-started",
          caseIds: suite.cases.map((entry) => entry.id),
          repetitions: 1,
          concurrency: 1,
        },
        ...completedCases.map(
          (result): EvalProgress => ({ type: "case-completed", result }),
        ),
      ];
      if (pendingCase) {
        events.push({
          type: "case-started",
          caseId: pendingCase.caseId,
          repetition: pendingCase.repetition,
          sessionId: pendingCase.sessionId,
        });
        for (const step of pendingCase.steps)
          events.push({
            type: "step-completed",
            caseId: pendingCase.caseId,
            repetition: pendingCase.repetition,
            step,
          });
        events.push({
          type: "case-progress",
          caseId: pendingCase.caseId,
          repetition: pendingCase.repetition,
          phase: "grading",
          stepIndex: pendingCase.steps.at(-1)?.index,
        });
      }
      const id =
        suiteIndex === 0
          ? phase === "baseline"
            ? sample.baselineEvalRunId
            : phase === "candidate"
              ? sample.candidateEvalRunId
              : sample.evalRunId
          : uuid(100 + phaseIndex * 10 + suiteIndex);
      const suiteRevision = getEvalSuiteRevision(suite);
      const result = awaitingGrading
        ? null
        : EvalRunResultSchema.parse({
            id,
            suiteId: suite.id,
            suiteRevision,
            suite,
            judge,
            startedAt: window.startedAt,
            durationMs: window.durationMs,
            status: counts.failed || counts.error ? "failed" : "passed",
            counts,
            cases,
            errors: [],
          });
      const promptSnapshot = {
        schemaVersion: 1,
        environment: "sample",
        revision: `sample-prompts-${phaseIndex + 1}`,
        source: "eval",
        resolvedAt: times[phaseIndex],
        versions: Object.fromEntries(
          prompts.details.map((detail) => {
            const version = required(
              detail.versions.find((v) => v.version === phaseIndex + 1),
            );
            return [
              detail.asset.key,
              {
                id: detail.asset.key,
                version: version.version,
                hash: version.hash,
                content: version.content,
              },
            ];
          }),
        ),
      };
      const detail = StudioEvalDetailSchema.parse({
        run: {
          id,
          evaluationId: sample.evaluationIds[phase],
          targetId: sample.targetId,
          targetName,
          environment: "sample",
          suiteId: suite.id,
          suiteName: suite.name,
          suiteRevision,
          status: result?.status ?? "running",
          createdAt: times[phaseIndex],
          startedAt: window.startedAt,
          endedAt: awaitingGrading ? null : window.endedAt,
          ...(awaitingGrading ? { phase: "grading" } : {}),
          error: null,
          cancelRequestedAt: null,
          counts,
          costs,
          caseCosts,
          totalAttempts: cases.length,
          completedAttempts: completedCases.length,
          suite,
          result,
          events: events.map((event, index) => ({
            id: index + 1,
            event,
          })),
          request: {
            repetitions: 1,
            concurrency: 1,
            grading: "studio",
            judge,
            promptSnapshot,
          },
        },
      });
      runs.push(detail);
      return detail.run;
    });
    const counts = suiteRuns.reduce(
      (total, run) => ({
        passed: total.passed + (run.counts?.passed ?? 0),
        failed: total.failed + (run.counts?.failed ?? 0),
        error: total.error + (run.counts?.error ?? 0),
        cancelled: total.cancelled + (run.counts?.cancelled ?? 0),
      }),
      countsFor([]),
    );
    const active = suiteRuns.some((run) => run.status === "running");
    const run = {
      id: sample.evaluationIds[phase],
      name:
        phase === "latest"
          ? "Support quality — recorded sample"
          : phase === "candidate"
            ? "Support quality — grading in progress"
            : "Support quality — initial baseline",
      targetId: sample.targetId,
      targetName,
      environment: "sample",
      selection: "all",
      metadata: { source: "manual" },
      judge,
      status: active
        ? "running"
        : counts.failed || counts.error
          ? "failed"
          : "passed",
      createdAt: times[phaseIndex],
      startedAt: times[phaseIndex],
      endedAt: active ? null : ends[phaseIndex],
      cancelRequestedAt: null,
      suiteCount: suiteRuns.length,
      completedSuites: suiteRuns.filter(
        (run) => run.status !== "running" && run.status !== "queued",
      ).length,
      totalAttempts: suiteRuns.reduce(
        (total, run) => total + (run.totalAttempts ?? 0),
        0,
      ),
      completedAttempts: suiteRuns.reduce(
        (total, run) => total + (run.completedAttempts ?? 0),
        0,
      ),
      ...(active
        ? {
            pendingAttempts: {
              notStarted: 0,
              executing: 0,
              awaitingGrading: suiteRuns.reduce(
                (total, run) =>
                  total +
                  (run.phase === "grading"
                    ? (run.totalAttempts ?? 0) - (run.completedAttempts ?? 0)
                    : 0),
                0,
              ),
            },
          }
        : {}),
      counts,
      costs: sumSampleEvaluationCosts(
        suiteRuns.flatMap((run) => (run.costs ? [run.costs] : [])),
      ),
      suites: suiteRuns,
    };
    return {
      detail: StudioEvaluationDetailSchema.parse({ run }),
      results: StudioEvaluationResultsSchema.parse({ run }),
    };
  });
  const targets = StudioEvalTargetsResponseSchema.parse({
    canRun: false,
    targets: [
      {
        id: sample.targetId,
        name: targetName,
        environment: "sample",
        error: null,
        manifest: {
          schemaVersion: 1,
          suites: Object.values(suites),
          responders: [],
          references: [],
        },
        revisions: Object.fromEntries(
          Object.values(suites).map((suite) => [
            suite.id,
            getEvalSuiteRevision(suite),
          ]),
        ),
      },
    ],
  });
  return {
    detail: required(runs.find((item) => item.run.id === sample.evalRunId)),
    baseline: required(
      runs.find((item) => item.run.id === sample.baselineEvalRunId),
    ),
    evaluation: required(evaluations[2]).detail,
    runs,
    evaluations,
    targets,
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Incomplete sample fixture relationship.");
  return value;
}
