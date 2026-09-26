import { createHash } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import postgres from "postgres";

const PREFIX = "demo-kortyx-recruitment";
const apiUrl = (process.env.KORTYX_API_URL ?? "http://localhost:6400").replace(
  /\/$/,
  "",
);
const telemetryKey =
  process.env.KORTYX_TELEMETRY_API_KEY ??
  "ktyx_test_localtelemetry_oss-demo-telemetry-secret-change-me";
const studioKey =
  process.env.KORTYX_STUDIO_API_KEY ??
  "ktyx_test_localstudio_oss-demo-studio-secret-change-me";

export const DEMO = {
  workflowId: "recruiter-marketplace-assistant",
  runId: `${PREFIX}-run-olivia`,
  sessionId: `${PREFIX}-session-olivia`,
  interruptId: `${PREFIX}-approval-move-candidate`,
} as const;

const topology = {
  nodes: [
    {
      id: "understandRequest",
      label: "Understand recruiter request",
      type: "llm",
      provider: "openai",
      model: "gpt-5.6-sol",
    },
    {
      id: "checkPermissions",
      label: "Check workspace permissions",
      type: "tool",
      tools: [
        {
          name: "permissions.check",
          description: "Verify recruiter access to candidate and position data",
          callingMode: "direct",
          provenance: "source",
          inputFields: [{ name: "action", type: "string", required: true }],
        },
      ],
    },
    {
      id: "searchMarketplace",
      label: "Search candidate marketplace",
      type: "llm",
      provider: "google",
      model: "gemini-2.5-flash",
      tools: [
        {
          name: "candidates.search",
          description: "Search consented candidate profiles",
          callingMode: "model",
          provenance: "source",
          inputFields: [{ name: "query", type: "string", required: true }],
        },
      ],
    },
    {
      id: "evaluateCandidates",
      label: "Evaluate candidates",
      type: "workflow",
    },
    {
      id: "requestApproval",
      label: "Request recruiter approval",
      type: "interrupt",
    },
    {
      id: "moveCandidate",
      label: "Move candidate in pipeline",
      type: "tool",
      tools: [
        {
          name: "pipeline.moveCandidate",
          description: "Move a candidate after policy and approval checks",
          callingMode: "direct",
          provenance: "source",
          inputFields: [
            { name: "candidateId", type: "string", required: true },
            { name: "stage", type: "string", required: true },
          ],
        },
      ],
    },
    {
      id: "respond",
      label: "Stream recruiter response",
      type: "llm",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    },
  ],
  edges: [
    { sourceNodeId: "__start__", targetNodeId: "understandRequest" },
    { sourceNodeId: "understandRequest", targetNodeId: "checkPermissions" },
    { sourceNodeId: "checkPermissions", targetNodeId: "searchMarketplace" },
    { sourceNodeId: "searchMarketplace", targetNodeId: "evaluateCandidates" },
    { sourceNodeId: "evaluateCandidates", targetNodeId: "requestApproval" },
    { sourceNodeId: "requestApproval", targetNodeId: "moveCandidate" },
    { sourceNodeId: "moveCandidate", targetNodeId: "respond" },
    { sourceNodeId: "respond", targetNodeId: "__end__" },
  ],
  calls: [
    {
      sourceNodeId: "evaluateCandidates",
      targetWorkflowId: "candidate-fit-evaluation",
    },
  ],
  transitions: [
    {
      sourceNodeId: "requestApproval",
      targetWorkflowId: "recruiter-marketplace-assistant",
      intent: "continue after recruiter approval",
    },
  ],
};

const topologyHash = createHash("sha256")
  .update(JSON.stringify(topology))
  .digest("hex");
const bearer = (key: string) => ({
  authorization: `Bearer ${key}`,
  accept: "application/json",
});

export async function cleanupDemoShowcase() {
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgres://kortyx:kortyx@127.0.0.1:6543/kortyx",
    { max: 1 },
  );
  const idPattern = `${PREFIX}-%`;
  try {
    await sql.begin(async (tx) => {
      await tx`delete from studio_interrupts where interrupt_id like ${idPattern}`;
      await tx`delete from studio_runs where run_id like ${idPattern}`;
      await tx`delete from studio_sessions where session_id like ${idPattern}`;
      await tx`delete from telemetry_events where run_id like ${idPattern} or session_id like ${idPattern}`;
      await tx`delete from workflow_revisions where workflow_id in ('recruiter-marketplace-assistant', 'candidate-fit-evaluation', 'candidate-data-governance')`;
    });
  } finally {
    await sql.end();
  }
}

export async function seedDemoShowcase(request: APIRequestContext) {
  const revisionResponse = await request.post(
    `${apiUrl}/v1/telemetry/workflow-revisions:ensure`,
    {
      headers: { ...bearer(telemetryKey), "content-type": "application/json" },
      data: {
        schemaVersion: 1,
        environment: "production",
        service: {
          name: "recruitment-copilot",
          deploymentRef: "eu-west-1.14.2",
        },
        workflow: {
          id: DEMO.workflowId,
          declaredVersion: "1.14.2",
          description:
            "Recruiter copilot for marketplace search, candidate evaluation, approvals, and governed pipeline actions.",
          tags: ["recruitment", "marketplace", "gdpr", "human-in-the-loop"],
          topologyHash,
          ...topology,
        },
      },
    },
  );
  assert(revisionResponse.ok(), await revisionResponse.text());
  const { workflowRevisionId } = (await revisionResponse.json()) as {
    workflowRevisionId: string;
  };

  const now = Date.now();
  const events: Record<string, unknown>[] = [];
  let serial = 0;
  const add = (args: {
    runId: string;
    sessionId: string;
    workflowId?: string;
    minute: number;
    offset: number;
    type: string;
    nodeId: string;
    payload: Record<string, unknown>;
    spanId?: string;
    parentSpanId?: string;
  }) => {
    serial += 1;
    events.push({
      schemaVersion: 1,
      eventId: `${PREFIX}-event-${serial}`,
      occurredAt: new Date(
        now - args.minute * 60_000 + args.offset,
      ).toISOString(),
      environment: "production",
      service: { name: "recruitment-copilot", deploymentRef: "eu-west-1.14.2" },
      correlation: {
        runId: args.runId,
        sessionId: args.sessionId,
        workflowId: args.workflowId ?? DEMO.workflowId,
        ...(!args.workflowId || args.workflowId === DEMO.workflowId
          ? { workflowRevisionId }
          : {}),
        topologyHash,
        nodeId: args.nodeId,
        traceId: `${args.runId}-trace`,
        ...(args.spanId ? { spanId: args.spanId } : {}),
        ...(args.parentSpanId ? { parentSpanId: args.parentSpanId } : {}),
      },
      context: {
        userId: args.sessionId.includes("olivia")
          ? "recruiter-olivia"
          : "recruiter-team-eu",
        tenantId: "acme-talent-eu",
        tags: ["demo", "recruitment", "eu-production"],
        metadata: { region: "eu-west", dataResidency: "EU", synthetic: true },
      },
      type: args.type,
      payload: args.payload,
    });
  };

  const seedCompactRun = (
    suffix: string,
    session: string,
    minute: number,
    result: string,
    status: "completed" | "failed" | "interrupted",
    model: string,
  ) => {
    const runId = `${PREFIX}-run-${suffix}`;
    const sessionId = `${PREFIX}-session-${session}`;
    const root = `${runId}-root`;
    add({
      runId,
      sessionId,
      minute,
      offset: 0,
      type: "span.started",
      nodeId: "understandRequest",
      spanId: root,
      payload: { name: "kortyx.run" },
    });
    add({
      runId,
      sessionId,
      minute,
      offset: 220,
      type: "generation.completed",
      nodeId: "understandRequest",
      spanId: `${runId}-model`,
      parentSpanId: root,
      payload: {
        provider: model.includes("gemini") ? "google" : "openai",
        model,
        durationMs: 1180,
        ttftMs: 210,
        streamDurationMs: 720,
        postStreamDurationMs: 250,
        usage: { input: 920, output: 188, reasoning: 54, total: 1108 },
        finishReason: { unified: "stop", raw: "stop" },
        result,
      },
    });
    if (status === "interrupted") {
      add({
        runId,
        sessionId,
        minute,
        offset: 1450,
        type: "interrupt.created",
        nodeId: "requestApproval",
        spanId: root,
        payload: {
          interruptId: `${PREFIX}-interrupt-${suffix}`,
          requestId: `${PREFIX}-request-${suffix}`,
          kind: "choice",
          interactionMode: "static-options",
          question: "Approve this candidate pipeline action?",
          options: [
            { id: "approve", label: "Approve" },
            { id: "reject", label: "Reject" },
          ],
          optionCount: 2,
          expiresAt: new Date(now + 86_400_000).toISOString(),
        },
      });
    } else if (status === "failed") {
      add({
        runId,
        sessionId,
        minute,
        offset: 1650,
        type: "span.failed",
        nodeId: "searchMarketplace",
        spanId: root,
        payload: {
          name: "kortyx.run",
          message: "Marketplace policy service timed out after 3 attempts",
          durationMs: 1650,
        },
      });
    } else {
      add({
        runId,
        sessionId,
        minute,
        offset: 1800,
        type: "span.ended",
        nodeId: "respond",
        spanId: root,
        payload: { name: "kortyx.run", durationMs: 1800, result },
      });
      add({
        runId,
        sessionId,
        minute,
        offset: 1820,
        type: "response.completed",
        nodeId: "respond",
        spanId: root,
        payload: { result },
      });
    }
  };

  seedCompactRun(
    "morning-brief",
    "olivia",
    54,
    "Summarised 12 new marketplace candidates across 3 priority positions.",
    "completed",
    "gpt-5.6-sol",
  );
  seedCompactRun(
    "shortlist",
    "olivia",
    39,
    "Shortlisted 4 candidates for Senior Platform Engineer with evidence-linked reasons.",
    "completed",
    "gemini-2.5-flash",
  );
  seedCompactRun(
    "policy-timeout",
    "marco",
    31,
    "Candidate search could not complete.",
    "failed",
    "gpt-5.6-sol",
  );
  seedCompactRun(
    "salary-approval",
    "sarah",
    24,
    "Offer-band exception requires hiring manager approval.",
    "interrupted",
    "gpt-5.6-sol",
  );
  seedCompactRun(
    "pipeline-cleanup",
    "marco",
    17,
    "Updated 18 stale candidate stages after validating permissions and retention policy.",
    "completed",
    "gemini-2.5-flash",
  );
  seedCompactRun(
    "interview-prep",
    "sarah",
    11,
    "Prepared structured interview topics for 3 candidates without exposing sensitive attributes.",
    "completed",
    "gpt-5.6-sol",
  );

  const runId = DEMO.runId;
  const sessionId = DEMO.sessionId;
  const minute = 4;
  const root1 = `${runId}-execution-1`;
  const nodeUnderstand = `${runId}-node-understand`;
  const reason1 = `${runId}-reason-understand`;
  const model1 = `${runId}-model-understand`;
  add({
    runId,
    sessionId,
    minute,
    offset: 0,
    type: "span.started",
    nodeId: "understandRequest",
    spanId: root1,
    payload: { name: "kortyx.run", phase: 1 },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 80,
    type: "span.started",
    nodeId: "understandRequest",
    spanId: nodeUnderstand,
    parentSpanId: root1,
    payload: { name: "kortyx.node" },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 120,
    type: "span.started",
    nodeId: "understandRequest",
    spanId: reason1,
    parentSpanId: nodeUnderstand,
    payload: {
      name: "useReason",
      attributes: {
        id: "classify-recruiter-intent",
        opId: "intent-01",
        emit: false,
        hasStructured: true,
        hasOutputSchema: true,
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 160,
    type: "span.started",
    nodeId: "understandRequest",
    spanId: model1,
    parentSpanId: reason1,
    payload: {
      name: "runReasonEngine",
      input: [
        {
          role: "system",
          content:
            "Classify the recruiter request. Do not include candidate special-category data.",
        },
        {
          role: "user",
          content:
            "Find strong platform engineers in Barcelona and move the best matching candidate to recruiter screen.",
        },
      ],
      attributes: {
        providerId: "openai",
        modelId: "gpt-5.6-sol",
        stream: true,
        emit: false,
        id: "classify-recruiter-intent",
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 980,
    type: "generation.completed",
    nodeId: "understandRequest",
    spanId: model1,
    parentSpanId: reason1,
    payload: {
      provider: "openai",
      model: "gpt-5.6-sol",
      durationMs: 820,
      ttftMs: 184,
      streamDurationMs: 510,
      postStreamDurationMs: 126,
      usage: {
        input: 1240,
        output: 174,
        reasoning: 62,
        cacheRead: 480,
        total: 1414,
      },
      finishReason: { unified: "stop", raw: "completed" },
      result: {
        intent: "search_and_move_candidate",
        location: "Barcelona",
        roleFamily: "platform engineering",
        requiresApproval: true,
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1010,
    type: "span.ended",
    nodeId: "understandRequest",
    spanId: model1,
    parentSpanId: reason1,
    payload: {
      name: "runReasonEngine",
      durationMs: 850,
      output: {
        intent: "search_and_move_candidate",
        location: "Barcelona",
        requiresApproval: true,
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1030,
    type: "span.ended",
    nodeId: "understandRequest",
    spanId: reason1,
    parentSpanId: nodeUnderstand,
    payload: {
      name: "useReason",
      durationMs: 910,
      output: {
        intent: "search_and_move_candidate",
        location: "Barcelona",
        requiresApproval: true,
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1080,
    type: "span.ended",
    nodeId: "understandRequest",
    spanId: nodeUnderstand,
    parentSpanId: root1,
    payload: { name: "kortyx.node", durationMs: 1000 },
  });

  const permissionSpan = `${runId}-tool-permissions`;
  add({
    runId,
    sessionId,
    minute,
    offset: 1150,
    type: "span.started",
    nodeId: "checkPermissions",
    spanId: `${runId}-node-permissions`,
    parentSpanId: root1,
    payload: { name: "kortyx.node" },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1190,
    type: "tool.started",
    nodeId: "checkPermissions",
    spanId: permissionSpan,
    parentSpanId: root1,
    payload: {
      name: "permissions.check",
      tool: "permissions.check",
      toolCallId: "permission-01",
      attemptId: "attempt-1",
      input: {
        action: "candidate.search_and_move",
        scope: "workspace:acme-talent-eu",
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1370,
    type: "tool.completed",
    nodeId: "checkPermissions",
    spanId: permissionSpan,
    parentSpanId: root1,
    payload: {
      name: "permissions.check",
      tool: "permissions.check",
      toolCallId: "permission-01",
      attemptId: "attempt-1",
      durationMs: 180,
      result: {
        allowed: true,
        policy: "recruiter-marketplace-v4",
        fields: ["skills", "experience", "location", "salary_expectation"],
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1410,
    type: "span.ended",
    nodeId: "checkPermissions",
    spanId: `${runId}-node-permissions`,
    parentSpanId: root1,
    payload: { name: "kortyx.node", durationMs: 260 },
  });

  const searchNode = `${runId}-node-search`;
  const searchReason = `${runId}-reason-search`;
  const searchModel = `${runId}-model-search`;
  add({
    runId,
    sessionId,
    minute,
    offset: 1480,
    type: "span.started",
    nodeId: "searchMarketplace",
    spanId: searchNode,
    parentSpanId: root1,
    payload: { name: "kortyx.node" },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1520,
    type: "span.started",
    nodeId: "searchMarketplace",
    spanId: searchReason,
    parentSpanId: searchNode,
    payload: {
      name: "useReason",
      attributes: { id: "marketplace-search", opId: "search-01", emit: false },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 1550,
    type: "span.started",
    nodeId: "searchMarketplace",
    spanId: searchModel,
    parentSpanId: searchReason,
    payload: {
      name: "runReasonEngine",
      input: [
        {
          role: "system",
          content:
            "Use only consented profile fields. Exclude age, gender, nationality, photo, and health data from model context.",
        },
        {
          role: "user",
          content:
            "Find platform engineers in Barcelona with Kubernetes and TypeScript experience.",
        },
      ],
      attributes: {
        providerId: "google",
        modelId: "gemini-2.5-flash",
        stream: false,
        emit: false,
        id: "marketplace-search",
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 2250,
    type: "generation.completed",
    nodeId: "searchMarketplace",
    spanId: searchModel,
    parentSpanId: searchReason,
    payload: {
      provider: "google",
      model: "gemini-2.5-flash",
      durationMs: 700,
      usage: { input: 860, output: 102, total: 962 },
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      result: {
        toolCalls: [
          {
            id: "search-call-01",
            name: "candidates.search",
            input: {
              query: "platform engineer kubernetes typescript",
              location: "Barcelona",
              consent: "active",
              limit: 20,
            },
          },
        ],
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 2280,
    type: "span.ended",
    nodeId: "searchMarketplace",
    spanId: searchModel,
    parentSpanId: searchReason,
    payload: {
      name: "runReasonEngine",
      durationMs: 730,
      output: {
        toolCalls: [{ id: "search-call-01", name: "candidates.search" }],
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 2320,
    type: "tool.started",
    nodeId: "searchMarketplace",
    spanId: `${runId}-tool-search`,
    parentSpanId: searchReason,
    payload: {
      name: "candidates.search",
      tool: "candidates.search",
      toolCallId: "search-call-01",
      attemptId: "attempt-1",
      input: {
        query: "platform engineer kubernetes typescript",
        location: "Barcelona",
        consent: "active",
        limit: 20,
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 2840,
    type: "tool.completed",
    nodeId: "searchMarketplace",
    spanId: `${runId}-tool-search`,
    parentSpanId: searchReason,
    payload: {
      name: "candidates.search",
      tool: "candidates.search",
      toolCallId: "search-call-01",
      attemptId: "attempt-1",
      durationMs: 520,
      result: {
        total: 18,
        returned: 8,
        redactedFields: ["dateOfBirth", "nationality", "photo"],
        candidates: [
          {
            id: "cand_7K2",
            headline: "Senior Platform Engineer",
            skills: ["Kubernetes", "TypeScript", "AWS"],
            location: "Barcelona",
          },
          {
            id: "cand_4P9",
            headline: "Staff Cloud Engineer",
            skills: ["Kubernetes", "Go", "GCP"],
            location: "Barcelona",
          },
        ],
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 2920,
    type: "span.ended",
    nodeId: "searchMarketplace",
    spanId: searchReason,
    parentSpanId: searchNode,
    payload: {
      name: "useReason",
      durationMs: 1400,
      output: { candidatesFound: 18 },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 2960,
    type: "span.ended",
    nodeId: "searchMarketplace",
    spanId: searchNode,
    parentSpanId: root1,
    payload: { name: "kortyx.node", durationMs: 1480 },
  });

  const invocationId = "evaluation-call-01";
  const branchId = "primary-branch";
  add({
    runId,
    sessionId,
    minute,
    offset: 3030,
    type: "workflow.call.started",
    nodeId: "evaluateCandidates",
    spanId: root1,
    payload: {
      invocationId,
      branchId,
      callId: "evaluate-shortlist",
      callerNodeId: "evaluateCandidates",
      callerNodeExecutionId: "evaluate-01",
      parentInvocationId: null,
      sourceWorkflowId: DEMO.workflowId,
      targetWorkflowId: "candidate-fit-evaluation",
      targetVersion: "2.3.0",
      sequence: 1,
    },
  });
  add({
    runId,
    sessionId,
    workflowId: "candidate-fit-evaluation",
    minute,
    offset: 3090,
    type: "span.started",
    nodeId: "scoreEvidence",
    spanId: `${runId}-child-node`,
    parentSpanId: root1,
    payload: { name: "kortyx.node", invocationId, branchId },
  });
  add({
    runId,
    sessionId,
    workflowId: "candidate-fit-evaluation",
    minute,
    offset: 3910,
    type: "generation.completed",
    nodeId: "scoreEvidence",
    spanId: `${runId}-child-model`,
    parentSpanId: `${runId}-child-node`,
    payload: {
      invocationId,
      branchId,
      provider: "openai",
      model: "gpt-5.6-sol",
      durationMs: 760,
      ttftMs: 205,
      streamDurationMs: 410,
      postStreamDurationMs: 145,
      usage: { input: 1860, output: 286, reasoning: 118, total: 2146 },
      finishReason: { unified: "stop", raw: "completed" },
      result: {
        candidateId: "cand_7K2",
        fitScore: 0.91,
        evidence: [
          "6 years operating Kubernetes",
          "Strong TypeScript platform experience",
          "Barcelona location match",
        ],
        excludedFromScoring: ["nationality", "age", "photo"],
      },
    },
  });
  add({
    runId,
    sessionId,
    workflowId: "candidate-fit-evaluation",
    minute,
    offset: 3970,
    type: "span.ended",
    nodeId: "scoreEvidence",
    spanId: `${runId}-child-node`,
    parentSpanId: root1,
    payload: { name: "kortyx.node", durationMs: 880, invocationId, branchId },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 4040,
    type: "workflow.call.completed",
    nodeId: "evaluateCandidates",
    spanId: root1,
    payload: {
      invocationId,
      branchId,
      callId: "evaluate-shortlist",
      callerNodeId: "evaluateCandidates",
      callerNodeExecutionId: "evaluate-01",
      parentInvocationId: null,
      sourceWorkflowId: DEMO.workflowId,
      targetWorkflowId: "candidate-fit-evaluation",
      targetVersion: "2.3.0",
      sequence: 2,
      durationMs: 1010,
      result: { candidateId: "cand_7K2", fitScore: 0.91 },
    },
  });

  add({
    runId,
    sessionId,
    minute,
    offset: 4100,
    type: "interrupt.created",
    nodeId: "requestApproval",
    spanId: root1,
    payload: {
      interruptId: DEMO.interruptId,
      requestId: `${PREFIX}-approval-request`,
      kind: "choice",
      interactionMode: "static-options",
      schemaId: "candidate-pipeline-approval",
      schemaVersion: "1",
      question: "Move candidate cand_7K2 to Recruiter screen?",
      description:
        "91% role fit. Sensitive profile fields were removed before model evaluation.",
      options: [
        {
          id: "approve",
          label: "Approve move",
          description: "Move to Recruiter screen and save the evidence.",
        },
        {
          id: "review",
          label: "Review candidate",
          description: "Open the governed candidate profile before deciding.",
        },
        {
          id: "reject",
          label: "Keep in Sourced",
          description: "Do not change the pipeline.",
        },
      ],
      optionCount: 3,
      expiresAt: new Date(now + 86_400_000).toISOString(),
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 4180,
    type: "session.checkpointed",
    nodeId: "requestApproval",
    spanId: root1,
    payload: {
      nodes: [
        "understandRequest",
        "checkPermissions",
        "searchMarketplace",
        "evaluateCandidates",
        "requestApproval",
      ],
      reason: "human approval boundary",
      state: {
        selectedCandidateId: "cand_7K2",
        targetStage: "recruiter_screen",
        policyVersion: "pipeline-policy-7",
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 4240,
    type: "span.ended",
    nodeId: "requestApproval",
    spanId: root1,
    payload: {
      name: "kortyx.run",
      durationMs: 4240,
      result: "Waiting for recruiter approval",
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 64_000,
    type: "interrupt.resolved",
    nodeId: "requestApproval",
    spanId: root1,
    payload: {
      interruptId: DEMO.interruptId,
      response: "approve",
      responseValue: {
        decision: "approve",
        note: "Evidence is strong. Continue.",
      },
      resolvedBy: "recruiter-olivia",
      resolvedAt: new Date(now - minute * 60_000 + 64_000).toISOString(),
      resumeOutcome: "resumed",
      responseCaptured: true,
    },
  });
  const root2 = `${runId}-execution-2`;
  add({
    runId,
    sessionId,
    minute,
    offset: 64_120,
    type: "span.started",
    nodeId: "moveCandidate",
    spanId: root2,
    payload: { name: "kortyx.run", phase: 2 },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 64_260,
    type: "tool.started",
    nodeId: "moveCandidate",
    spanId: `${runId}-tool-move`,
    parentSpanId: root2,
    payload: {
      name: "pipeline.moveCandidate",
      tool: "pipeline.moveCandidate",
      toolCallId: "move-call-01",
      attemptId: "attempt-1",
      input: {
        candidateId: "cand_7K2",
        fromStage: "sourced",
        toStage: "recruiter_screen",
        approvalId: DEMO.interruptId,
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 64_720,
    type: "tool.completed",
    nodeId: "moveCandidate",
    spanId: `${runId}-tool-move`,
    parentSpanId: root2,
    payload: {
      name: "pipeline.moveCandidate",
      tool: "pipeline.moveCandidate",
      toolCallId: "move-call-01",
      attemptId: "attempt-1",
      durationMs: 460,
      result: {
        candidateId: "cand_7K2",
        previousStage: "sourced",
        stage: "recruiter_screen",
        auditId: "audit_eu_91c2",
        changedBy: "kortyx-agent",
        approvedBy: "recruiter-olivia",
      },
    },
  });
  const responseReason = `${runId}-reason-response`;
  const responseModel = `${runId}-model-response`;
  add({
    runId,
    sessionId,
    minute,
    offset: 64_820,
    type: "span.started",
    nodeId: "respond",
    spanId: responseReason,
    parentSpanId: root2,
    payload: {
      name: "useReason",
      attributes: { id: "recruiter-response", opId: "response-01", emit: true },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 64_850,
    type: "span.started",
    nodeId: "respond",
    spanId: responseModel,
    parentSpanId: responseReason,
    payload: {
      name: "runReasonEngine",
      input: [
        {
          role: "system",
          content:
            "Give the recruiter a concise, evidence-linked confirmation.",
        },
        {
          role: "user",
          content:
            "Candidate cand_7K2 was approved and moved to recruiter_screen.",
        },
      ],
      attributes: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        stream: true,
        emit: true,
        id: "recruiter-response",
      },
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 65_730,
    type: "generation.completed",
    nodeId: "respond",
    spanId: responseModel,
    parentSpanId: responseReason,
    payload: {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      durationMs: 880,
      ttftMs: 238,
      streamDurationMs: 505,
      postStreamDurationMs: 137,
      usage: { input: 640, output: 132, total: 772 },
      finishReason: { unified: "stop", raw: "end_turn" },
      result:
        "Candidate cand_7K2 moved to Recruiter screen. The decision and supporting evidence are recorded in audit_eu_91c2.",
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 65_760,
    type: "span.ended",
    nodeId: "respond",
    spanId: responseModel,
    parentSpanId: responseReason,
    payload: {
      name: "runReasonEngine",
      durationMs: 910,
      output:
        "Candidate cand_7K2 moved to Recruiter screen. The decision and supporting evidence are recorded in audit_eu_91c2.",
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 65_790,
    type: "span.ended",
    nodeId: "respond",
    spanId: responseReason,
    parentSpanId: root2,
    payload: {
      name: "useReason",
      durationMs: 970,
      output: "Candidate cand_7K2 moved to Recruiter screen.",
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 65_860,
    type: "span.ended",
    nodeId: "respond",
    spanId: root2,
    payload: {
      name: "kortyx.run",
      durationMs: 1740,
      result:
        "Candidate cand_7K2 moved to Recruiter screen with recruiter approval and a complete audit record.",
    },
  });
  add({
    runId,
    sessionId,
    minute,
    offset: 65_900,
    type: "response.completed",
    nodeId: "respond",
    spanId: root2,
    payload: { result: "Candidate moved and audit record saved." },
  });

  const response = await request.post(`${apiUrl}/v1/telemetry/events:batch`, {
    headers: { ...bearer(telemetryKey), "content-type": "application/json" },
    data: { events },
  });
  assert(response.ok(), await response.text());
  await poll(request, "runs", DEMO.runId);
  await poll(request, "sessions", DEMO.sessionId);
  await poll(request, "interrupts", DEMO.interruptId);
}

async function poll(
  request: APIRequestContext,
  resource: "runs" | "sessions" | "interrupts",
  id: string,
) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await request.get(
      `${apiUrl}/v1/studio/${resource}/${encodeURIComponent(id)}`,
      { headers: bearer(studioKey) },
    );
    if (response.ok()) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${resource}/${id}`);
}

function assert(ok: boolean, body: string) {
  if (!ok) throw new Error(`Demo fixture request failed: ${body}`);
}
