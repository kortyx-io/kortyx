// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { defineWorkflow } from "@kortyx/core";
import { useInterrupt, useTool, useWorkflow } from "@kortyx/hooks";
import type { KortyxPromptMessage } from "@kortyx/providers";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import { type StreamChunk, StreamChunkSchema } from "@kortyx/stream";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import { EvalRunResultSchema } from "../src/evals/contracts";
import { getEvalGradeEvidence } from "../src/evals/evidence";
import {
  createEvalJudge,
  createEvals,
  type EvalObservation,
  type EvalRunResult,
  type EvalSuite,
} from "../src/evals/index";
import { captureEvalEvent } from "../src/evals/stream-evidence";

const brief = { jobId: "barcelona", salary: "EUR 100,000", modality: "Remote" };

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing expected test evidence");
  return value;
}

function toolEvent<T extends "tool-call-start" | "tool-call-result">(
  observation: EvalObservation,
  type: T,
): Extract<StreamChunk, { type: T }> {
  const value = observation.events?.find(
    (event) =>
      event !== null &&
      typeof event === "object" &&
      "type" in event &&
      event.type === type,
  );
  return StreamChunkSchema.parse(value) as Extract<StreamChunk, { type: T }>;
}

function fixture(
  emit: boolean | { input?: boolean; output?: boolean },
  pause = false,
) {
  const execute = vi.fn(async () => brief);
  const child = defineWorkflow({
    id: "brief",
    version: "1",
    inputSchema: z.object({ jobId: z.string() }),
    outputSchema: z.object({ salary: z.string(), modality: z.string() }),
    nodes: {
      read: {
        run: async ({ input }: { input: { jobId: string } }) => ({
          data: await useTool({
            id: "read",
            emit,
            input,
            tool: { name: "read_job_brief", inputSchema: {}, execute },
          }),
        }),
      },
    },
    edges: [
      ["__start__", "read"],
      ["read", "__end__"],
    ],
  });
  const parent = defineWorkflow({
    id: "jobs",
    version: "1",
    nodes: {
      answer: {
        run: async () => {
          const result = await useWorkflow({
            id: "brief",
            workflow: child,
            input: { jobId: "barcelona" },
          });
          if (pause)
            await useInterrupt({
              request: { kind: "text", question: "Continue?" },
            });
          return {
            ui: { message: `${result.data.salary}; ${result.data.modality}` },
          };
        },
      },
    },
    edges: [
      ["__start__", "answer"],
      ["answer", "__end__"],
    ],
  });
  return {
    execute,
    agent: createAgent({
      workflows: [parent, child],
      defaultWorkflowId: parent.id,
      frameworkAdapter: createInMemoryFrameworkAdapter(),
    }),
  };
}

function judge() {
  const invoke = vi.fn(async (_messages: KortyxPromptMessage[]) => ({
    content: JSON.stringify({
      passed: true,
      reason: "Checked retrieved brief.",
      evidence: [brief.salary],
    }),
  }));
  return {
    invoke,
    judge: createEvalJudge({
      model: {
        provider: {
          id: "fixture",
          models: ["fixture"],
          getModel: () => ({ invoke, stream: async function* () {} }),
        },
        modelId: "fixture",
      },
    }),
  };
}

const suite: EvalSuite = {
  id: "direct-read",
  cases: [
    {
      id: "salary",
      steps: [
        {
          message: "Read the brief",
          expect: {
            type: "answer",
            criteria: ["Uses the retrieved salary and work modality."],
          },
        },
      ],
    },
  ],
};

it("supplies attributable child useTool input and results to the real judge request", async () => {
  const { agent, execute } = fixture(true);
  const { judge: evaluator, invoke } = judge();
  const result = await createEvals({
    agent,
    suites: [suite],
    judge: evaluator,
  }).run({ suiteId: suite.id });
  expect(result.status).toBe("passed");
  expect(execute).toHaveBeenCalledOnce();
  const request = JSON.parse(
    required(invoke.mock.calls[0]?.[0][1]?.content),
  ) as { observation: EvalObservation };
  const tools = required(request.observation.events);
  const start = toolEvent(request.observation, "tool-call-start");
  expect(tools).toHaveLength(2);
  expect(tools[0]).toMatchObject({
    type: "tool-call-start",
    tool: "read_job_brief",
    input: { jobId: "barcelona" },
    execution: {
      workflowId: "brief",
      nodeId: "read",
      invocationId: expect.any(String),
      runId: expect.any(String),
      branchId: expect.any(String),
      callingMode: "direct",
      executed: true,
    },
  });
  expect(tools[1]).toMatchObject({
    type: "tool-call-result",
    tool: "read_job_brief",
    structuredContent: brief,
    toolCallId: start.toolCallId,
    execution: { ...start.execution, outcome: "success" },
  });
  expect(request.observation.text).toBe("EUR 100,000; Remote");
  for (const event of tools)
    expect(StreamChunkSchema.safeParse(event).success).toBe(true);
  expect(EvalRunResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(
    result,
  );
});

it("replays a completed child from its checkpoint and saved judge evidence without another read", async () => {
  const { agent, execute } = fixture(true, true);
  const { judge: evaluator, invoke } = judge();
  const pausedSuite: EvalSuite = {
    ...suite,
    cases: [
      {
        id: "salary",
        steps: [
          { message: "Read the brief", expect: { type: "interrupt" } },
          {
            resume: { type: "text", text: "Continue" },
            expect: {
              type: "answer",
              criteria: ["Uses the retrieved salary."],
            },
          },
        ],
      },
    ],
  };
  const result = await createEvals({
    agent,
    suites: [pausedSuite],
    judge: evaluator,
  }).run({ suiteId: suite.id });
  expect(result.status).toBe("passed");
  expect(execute).toHaveBeenCalledOnce();
  const saved = JSON.parse(JSON.stringify(result)) as EvalRunResult;
  EvalRunResultSchema.parse(saved);
  const steps = required(saved.cases[0]).steps;
  const selected = getEvalGradeEvidence(required(steps[1]), [
    required(steps[0]),
  ]);
  const first = toolEvent(required(steps[0]).observation, "tool-call-result");
  const reused = toolEvent(selected.observation, "tool-call-result");
  const firstOwner = required(first.execution);
  expect(reused).toMatchObject({
    node: first.node,
    tool: "read_job_brief",
    toolCallId: first.toolCallId,
    structuredContent: brief,
    execution: {
      workflowId: "brief",
      nodeId: "read",
      invocationId: firstOwner.invocationId,
      executed: false,
      outcome: "success",
      source: {
        runId: firstOwner.runId,
        invocationId: firstOwner.invocationId,
        toolCallId: first.toolCallId,
        attemptId: firstOwner.attemptId,
      },
    },
  });
  await evaluator.grade({
    ...selected,
    criterion: { id: "salary", text: "Uses the retrieved salary." },
    input: { resume: { type: "text", text: "Continue" } },
    signal: AbortSignal.timeout(1000),
  });
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(execute).toHaveBeenCalledOnce();
});

it.each([
  false,
  { input: true, output: false },
])("diagnoses omitted direct results for capture %j", async (emit) => {
  const { agent, execute } = fixture(emit);
  const { judge: evaluator, invoke } = judge();
  const result = await createEvals({
    agent,
    suites: [suite],
    judge: evaluator,
  }).run({ suiteId: suite.id });
  const observation = required(required(result.cases[0]).steps[0]).observation;
  const output = toolEvent(observation, "tool-call-result");
  expect(output.execution).toMatchObject({
    outcome: "success",
    resultOmitted: "disabled: enable useTool({ emit: true })",
  });
  expect(output).not.toHaveProperty("structuredContent");
  expect(JSON.stringify(output)).not.toContain(brief.salary);
  const input = toolEvent(observation, "tool-call-start");
  if (emit) expect(input.input).toEqual({ jobId: "barcelona" });
  else expect(input.execution?.inputOmitted).toContain("disabled");
  expect(execute).toHaveBeenCalledOnce();
  expect(JSON.stringify(invoke.mock.calls)).toContain("resultOmitted");
});

it("honors evidence selection for direct results in both live grading and saved replay", async () => {
  const { agent, execute } = fixture(true);
  const { judge: evaluator, invoke } = judge();
  const filtered = { ...suite, evidence: { events: false as const } };
  const result = await createEvals({
    agent,
    suites: [filtered],
    judge: evaluator,
  }).run({ suiteId: suite.id });
  const step = required(required(result.cases[0]).steps[0]);
  expect(JSON.stringify(step.observation.events)).toContain("read_job_brief");
  expect(step.evidence?.observation.events).toEqual([]);
  expect(getEvalGradeEvidence(step, []).observation.events).toEqual([]);
  expect(JSON.stringify(invoke.mock.calls)).not.toContain("read_job_brief");
  expect(execute).toHaveBeenCalledOnce();
});

it("strips injected private attribution fields when collecting public evidence", () => {
  const chunk = {
    type: "tool-call-result",
    tool: "read",
    toolCallId: "call",
    content: "ok",
    execution: {
      callingMode: "direct",
      attemptId: "attempt",
      executed: true,
      workflowId: "brief",
      state: "PRIVATE",
      source: {
        toolCallId: "source",
        attemptId: "source-attempt",
        resumeToken: "PRIVATE",
      },
    },
  } as unknown as StreamChunk;
  expect(JSON.stringify(captureEvalEvent(chunk))).not.toContain("PRIVATE");
  expect(captureEvalEvent(chunk)).toMatchObject({
    execution: { workflowId: "brief", source: { toolCallId: "source" } },
  });
});

it("drops malformed attribution without discarding the public tool result", () => {
  const chunk = {
    type: "tool-call-result",
    tool: "read",
    toolCallId: "call",
    content: "public result",
    execution: { callingMode: "PRIVATE_INVALID_MODE", executed: true },
  } as unknown as StreamChunk;
  expect(captureEvalEvent(chunk)).toEqual({
    type: "tool-call-result",
    tool: "read",
    toolCallId: "call",
    content: "public result",
  });
});

it("ignores attribution injected into an unrelated public event", () => {
  const chunk = {
    type: "status",
    message: "Reading brief",
    execution: { callingMode: "direct", attemptId: "PRIVATE", executed: true },
  } as unknown as StreamChunk;
  expect(captureEvalEvent(chunk)).toEqual({
    type: "status",
    message: "Reading brief",
  });
});

it("keeps both parallel node reads in a completed child's replay evidence", async () => {
  const execute = vi.fn(async () => brief);
  const read = async (name: string) =>
    useTool({
      emit: true,
      input: { jobId: "barcelona" },
      tool: { name, inputSchema: {}, execute },
    });
  const child = defineWorkflow({
    id: "parallel-brief",
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({ salary: z.string(), modality: z.string() }),
    nodes: {
      salary: {
        run: async () => ({
          data: { salary: (await read("read_salary")).salary },
        }),
      },
      modality: {
        run: async () => ({
          data: { modality: (await read("read_modality")).modality },
        }),
      },
      join: { run: async () => ({}) },
    },
    edges: [
      ["__start__", "salary"],
      ["__start__", "modality"],
      ["salary", "join"],
      ["modality", "join"],
      ["join", "__end__"],
    ],
  });
  const parent = defineWorkflow({
    id: "jobs",
    version: "1",
    nodes: {
      answer: {
        run: async () => {
          const result = await useWorkflow({
            id: "brief",
            workflow: child,
            input: {},
          });
          await useInterrupt({
            request: { kind: "text", question: "Continue?" },
          });
          return {
            ui: { message: `${result.data.salary}; ${result.data.modality}` },
          };
        },
      },
    },
    edges: [
      ["__start__", "answer"],
      ["answer", "__end__"],
    ],
  });
  const parallelSuite: EvalSuite = {
    ...suite,
    cases: [
      {
        id: "parallel",
        steps: [
          { message: "Read the brief", expect: { type: "interrupt" } },
          {
            resume: { type: "text", text: "Continue" },
            expect: {
              type: "answer",
              criteria: ["Uses both retrieved fields."],
            },
          },
        ],
      },
    ],
  };
  const result = await createEvals({
    agent: createAgent({
      workflows: [parent, child],
      defaultWorkflowId: parent.id,
      frameworkAdapter: createInMemoryFrameworkAdapter(),
    }),
    suites: [parallelSuite],
    judge: judge().judge,
  }).run({ suiteId: suite.id });
  expect(result.status).toBe("passed");
  expect(execute).toHaveBeenCalledTimes(2);
  const resumed = required(required(result.cases[0]).steps[1]);
  const results =
    resumed.evidence?.observation.events?.flatMap((event) => {
      const parsed = StreamChunkSchema.safeParse(event);
      return parsed.success && parsed.data.type === "tool-call-result"
        ? [parsed.data]
        : [];
    }) ?? [];
  expect(results.map((event) => event.tool).sort()).toEqual([
    "read_modality",
    "read_salary",
  ]);
  for (const event of results)
    expect(event).toMatchObject({
      structuredContent: brief,
      execution: {
        workflowId: child.id,
        executed: false,
        outcome: "success",
        source: { toolCallId: event.toolCallId },
      },
    });
});
