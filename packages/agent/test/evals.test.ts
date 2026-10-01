// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx server hooks run within workflow nodes.
import { defineWorkflow } from "@kortyx/core";
import {
  defineInterruptContract,
  useInterrupt,
  useStructuredData,
  useWorkflow,
} from "@kortyx/hooks";
import { createInMemoryFrameworkAdapter } from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/chat/create-agent";
import {
  createEvalJudge,
  createEvals,
  type EvalJudge,
  type EvalSuite,
} from "../src/evals/index";
import type { ChatMessage } from "../src/types/chat-message";

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Expected a test fixture or result.");
  return value;
}

const jobs = [
  { id: "barcelona", city: "Barcelona", salary: "EUR 100,000–120,000" },
  { id: "paris", city: "Paris", salary: "EUR 90,000–110,000" },
  { id: "madrid", city: "Madrid", salary: "EUR 80,000–100,000" },
];
const picker = defineInterruptContract({
  schemaId: "wolly.job-picker",
  schemaVersion: "1",
  description: "Choose a job",
  requestSchema: z.object({
    question: z.string(),
    candidates: z.array(z.object({ jobId: z.string(), city: z.string() })),
  }),
  responseSchema: z.object({ type: z.literal("select"), jobId: z.string() }),
});
const jobAgent = (bug = false) =>
  createAgent({
    frameworkAdapter: createInMemoryFrameworkAdapter(),
    workflows: [
      defineWorkflow({
        id: "jobs",
        version: "1",
        nodes: {
          answer: {
            run: async ({ input }: { input: string }) => {
              if (input === "list jobs")
                return {
                  ui: {
                    message: jobs
                      .map((job) => `Product Engineer ${job.city}`)
                      .join("\n"),
                  },
                };
              if (input === "all salaries" && !bug)
                return {
                  ui: {
                    message: jobs
                      .map((job) => `${job.city}: ${job.salary}`)
                      .join("\n"),
                  },
                };
              const response = await useInterrupt({
                contract: picker,
                request: {
                  question: "Which job?",
                  candidates: jobs.map((job) => ({
                    jobId: job.id,
                    city: job.city,
                  })),
                },
              });
              const job = required(
                jobs.find((candidate) => candidate.id === response.jobId),
              );
              return { ui: { message: `${job.city}: ${job.salary}` } };
            },
          },
        },
        edges: [
          ["__start__", "answer"],
          ["answer", "__end__"],
        ],
      }),
    ],
    defaultWorkflowId: "jobs",
  });
const judge: EvalJudge = {
  id: "fixture-check",
  version: "1",
  grade: ({ observation, reference }) => {
    const cities = (reference as { city: string }[]).map((job) => job.city);
    return {
      passed: cities.every((city) => observation.text.includes(city)),
      reason: "Checked all expected jobs.",
      evidence: [observation.text],
    };
  },
};
const salaries: EvalSuite = {
  id: "job-information",
  cases: [
    {
      id: "all-three",
      steps: [
        { message: "list jobs", expect: { type: "answer" } },
        {
          message: "all salaries",
          expect: {
            type: "answer",
            reference: { using: "jobs" },
            criteria: ["Answers for all three jobs."],
          },
        },
      ],
    },
  ],
};
const ambiguity: EvalSuite = {
  id: "ambiguity",
  cases: [
    {
      id: "pick",
      params: { actor: "recruiter" },
      steps: [
        {
          message: "one salary",
          expect: {
            type: "interrupt",
            schemaId: "wolly.job-picker",
            schemaVersion: "1",
          },
        },
        {
          resume: { using: "selectBarcelona" },
          expect: {
            type: "answer",
            reference: { using: "selectedJob" },
            criteria: ["Answers for Barcelona."],
          },
        },
      ],
    },
  ],
};

describe("eval conversations through real agent streams", () => {
  it("captures all requested salary answers and immutable reference facts", async () => {
    const progress = vi.fn();
    const grade = vi.fn(judge.grade);
    const result = await createEvals({
      agent: jobAgent(),
      suites: [salaries],
      references: { jobs: () => jobs },
      judge: { ...judge, grade },
    }).run({ suiteId: salaries.id, onProgress: progress });
    expect(result.status).toBe("passed");
    expect(result.cases[0]?.steps[1]?.observation.text).toContain("Paris");
    expect(result.cases[0]?.steps[1]?.reference).toEqual(jobs);
    expect(result.cases[0]?.steps[1]?.criteria[0]).toMatchObject({
      passed: true,
      id: "0",
    });
    expect(progress.mock.calls.map(([event]) => event.type)).toEqual([
      "case-started",
      "step-completed",
      "step-completed",
      "case-completed",
    ]);
    expect(JSON.stringify(result)).not.toContain("resumeToken");
    expect(grade).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { message: "all salaries" },
        conversation: [
          expect.objectContaining({ input: { message: "list jobs" } }),
        ],
      }),
    );
  });

  it("catches the unnecessary single-job picker and cleans up the waiting branch", async () => {
    const agent = jobAgent(true);
    const grade = vi.fn(judge.grade);
    const result = await createEvals({
      agent,
      suites: [salaries],
      references: { jobs: () => jobs },
      judge: { ...judge, grade },
    }).run({ suiteId: salaries.id });
    expect(result.status).toBe("failed");
    expect(result.cases[0]?.steps[1]).toMatchObject({
      status: "failed",
      observation: {
        type: "interrupt",
        interrupt: { schemaId: "wolly.job-picker" },
      },
    });
    expect(grade).not.toHaveBeenCalled();
    expect(
      await agent.listInterrupts({
        sessionId: required(result.cases[0]).sessionId,
      }),
    ).toEqual([]);
  });

  it("resumes custom child-compatible values with typed private setup and validates params", async () => {
    const teardown = vi.fn();
    const results = await createEvals({
      agent: jobAgent(),
      suites: [ambiguity],
      judge,
      paramsSchema: z.object({ actor: z.literal("recruiter") }).strict(),
      setup: ({ params }) => ({
        token: "PRIVATE_AUTH_TOKEN",
        job: required(jobs[0]),
        actor: params.actor,
      }),
      responders: {
        selectBarcelona: {
          schemaId: "wolly.job-picker",
          respond: ({ prepared, interrupt }) => {
            expectTypeOf(prepared.actor).toEqualTypeOf<"recruiter">();
            expectTypeOf(prepared.job.salary).toEqualTypeOf<string>();
            expect(interrupt.request).toHaveProperty("candidates");
            return {
              type: "value",
              value: { type: "select", jobId: prepared.job.id },
            };
          },
        },
      },
      references: { selectedJob: ({ prepared }) => [prepared.job] },
      execute: ({ prepared, run }) => {
        expect(prepared.token).toBe("PRIVATE_AUTH_TOKEN");
        return run({ context: { actor: prepared.actor } });
      },
      teardown,
    }).run({ suiteId: ambiguity.id });
    expect(results.status).toBe("passed");
    expect(results.cases[0]?.steps[1]?.observation.text).toBe(
      "Barcelona: EUR 100,000–120,000",
    );
    expect(teardown).toHaveBeenCalledOnce();
    expect(JSON.stringify(results)).not.toMatch(
      /PRIVATE_AUTH_TOKEN|resumeToken|continuation/,
    );
  });

  it("allows a final expected interrupt and cancels it after assessment", async () => {
    const agent = jobAgent();
    const suite: EvalSuite = {
      id: "interrupt-only",
      cases: [
        { id: "ask", steps: [required(required(ambiguity.cases[0]).steps[0])] },
      ],
    };
    const result = await createEvals({ agent, suites: [suite] }).run({
      suiteId: suite.id,
    });
    expect(result.status).toBe("passed");
    expect(
      await agent.listInterrupts({
        sessionId: required(result.cases[0]).sessionId,
      }),
    ).toEqual([]);
  });

  it("resumes sequential text and choice interrupts inside a child and captures structured output", async () => {
    const child = defineWorkflow({
      id: "child",
      version: "1",
      inputSchema: z.object({}),
      outputSchema: z.object({ label: z.string(), action: z.string() }),
      nodes: {
        ask: {
          run: async () => {
            const label = String(
              await useInterrupt({
                id: "label",
                request: { kind: "text", question: "Label?" },
              }),
            );
            const action = String(
              await useInterrupt({
                id: "action",
                request: {
                  kind: "choice",
                  question: "Action?",
                  options: [{ id: "review", label: "Review" }],
                },
              }),
            );
            return { data: { label, action } };
          },
        },
      },
      edges: [
        ["__start__", "ask"],
        ["ask", "__end__"],
      ],
    });
    const parent = defineWorkflow({
      id: "parent",
      version: "1",
      nodes: {
        call: {
          run: async () => {
            const result = await useWorkflow({
              id: "child",
              workflow: child,
              input: {},
            });
            useStructuredData({ dataType: "result", data: result.data });
            return {
              ui: { message: `${result.data.label}: ${result.data.action}` },
            };
          },
        },
      },
      edges: [
        ["__start__", "call"],
        ["call", "__end__"],
      ],
    });
    const suite: EvalSuite = {
      id: "child",
      cases: [
        {
          id: "two-pauses",
          steps: [
            { message: "start", expect: { type: "interrupt" } },
            {
              resume: { type: "text", text: "Hiring" },
              expect: { type: "interrupt" },
            },
            {
              resume: { type: "select", ids: ["review"] },
              expect: { type: "answer" },
            },
          ],
        },
      ],
    };
    const result = await createEvals({
      agent: createAgent({
        workflows: [parent, child],
        defaultWorkflowId: "parent",
        frameworkAdapter: createInMemoryFrameworkAdapter(),
      }),
      suites: [suite],
    }).run({ suiteId: suite.id });
    expect(result.status).toBe("passed");
    expect(result.cases[0]?.steps[2]?.observation).toMatchObject({
      text: "Hiring: review",
      structured: [
        { dataType: "result", data: { label: "Hiring", action: "review" } },
      ],
    });
  });

  it("rejects an incompatible named responder before consuming the interrupt and still cancels it", async () => {
    const agent = jobAgent();
    const respond = vi.fn(() => ({ type: "text" as const, text: "wrong" }));
    const result = await createEvals({
      agent,
      suites: [ambiguity],
      judge,
      responders: { selectBarcelona: { schemaId: "wrong-picker", respond } },
      references: { selectedJob: () => jobs },
    }).run({ suiteId: ambiguity.id });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors[0]?.phase).toBe("responder");
    expect(respond).not.toHaveBeenCalled();
    expect(
      await agent.listInterrupts({
        sessionId: required(result.cases[0]).sessionId,
      }),
    ).toEqual([]);
  });
});

const answerSuite: EvalSuite = {
  id: "simple",
  cases: [
    {
      id: "answer",
      steps: [
        {
          message: "hello",
          expect: { type: "answer", criteria: ["Good answer."] },
        },
      ],
    },
  ],
};
const success: EvalJudge = {
  id: "judge",
  version: "1",
  grade: () => ({ passed: true, reason: "Correct.", evidence: [] }),
};
const observation = { type: "answer" as const, text: "hello", structured: [] };
const unusedAgent = {
  streamChat: vi.fn(async () => {
    throw new Error("Should use the app executor.");
  }),
};

describe("eval execution ownership and failure reporting", () => {
  it("rejects simultaneous interrupts and cancels every private continuation", async () => {
    const cancelled: string[] = [];
    const agent = {
      streamChat: vi.fn(async (messages: ChatMessage[]) =>
        (async function* () {
          const resume = messages.at(-1)?.metadata?.resume as
            | { cancel?: boolean; requestId: string }
            | undefined;
          if (resume?.cancel) {
            cancelled.push(resume.requestId);
            yield { type: "cancelled" } as StreamChunk;
            return;
          }
          for (const requestId of ["a", "b"]) {
            yield {
              type: "interrupt",
              requestId,
              resumeToken: `PRIVATE_${requestId}`,
              input: { kind: "text", multiple: false, question: requestId },
            } as StreamChunk;
          }
        })(),
      ),
    } satisfies Pick<ReturnType<typeof createAgent>, "streamChat">;
    const result = await createEvals({
      agent,
      suites: [answerSuite],
      judge: success,
    }).run({ suiteId: answerSuite.id });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.steps[0]?.observation.type).toBe("error");
    expect(cancelled).toEqual(["a", "b"]);
    expect(result.cases[0]?.errors).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|resumeToken/);
  });

  it("does not grade early stream completion as a finished workflow", async () => {
    const agent = {
      streamChat: async () =>
        (async function* () {
          yield { type: "done" } as const;
        })(),
    };
    const grade = vi.fn(success.grade);
    const result = await createEvals({
      agent,
      suites: [answerSuite],
      judge: { ...success, grade },
    }).run({ suiteId: answerSuite.id });
    expect(result.status).toBe("error");
    expect(grade).not.toHaveBeenCalled();
  });

  it.each([
    "error",
    "cancelled",
  ] as const)("retains %s observations and emits the step verdict", async (type) => {
    const progress = vi.fn();
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      judge: success,
      execute: () => ({ observation: { ...observation, type } }),
    }).run({ suiteId: answerSuite.id, onProgress: progress });
    expect(result.status).toBe(type);
    expect(result.cases[0]?.steps[0]).toMatchObject({
      status: type,
      observation: { type },
    });
    expect(progress.mock.calls.map(([event]) => event.type)).toEqual([
      "case-started",
      "step-completed",
      "case-completed",
    ]);
  });

  it("retains the answer when reference resolution fails", async () => {
    const result = await createEvals({
      agent: unusedAgent,
      suites: [
        {
          ...answerSuite,
          cases: [
            {
              id: "reference",
              steps: [
                {
                  message: "hello",
                  expect: {
                    type: "answer",
                    reference: { using: "truth" },
                    criteria: ["Accurate"],
                  },
                },
              ],
            },
          ],
        },
      ],
      judge: success,
      references: {
        truth: () => {
          throw new Error("PRIVATE_TOKEN");
        },
      },
      execute: () => ({ observation }),
    }).run({ suiteId: answerSuite.id });
    expect(result.cases[0]?.steps[0]).toMatchObject({
      status: "error",
      observation,
    });
    expect(result.cases[0]?.errors[0]?.phase).toBe("reference");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TOKEN");
  });

  it("requires every criterion to pass and snapshots supplied reference facts", async () => {
    const suite: EvalSuite = {
      id: "two",
      cases: [
        {
          id: "both",
          steps: [
            {
              message: "hello",
              expect: {
                type: "answer",
                criteria: [
                  { id: "accuracy", text: "Accurate" },
                  { id: "complete", text: "Complete" },
                ],
              },
            },
          ],
        },
      ],
    };
    const result = await createEvals({
      agent: unusedAgent,
      suites: [suite],
      execute: () => ({ observation }),
      judge: {
        ...success,
        grade: ({ criterion }) => ({
          passed: criterion.id === "accuracy",
          reason: criterion.text,
          evidence: [],
        }),
      },
    }).run({ suiteId: suite.id });
    expect(result.status).toBe("failed");
    expect(result.cases[0]?.steps[0]?.criteria).toHaveLength(2);
  });

  it("isolates repetitions, bounds concurrency, and cleans up each prepared actor", async () => {
    const sessions = new Set<string>();
    let active = 0;
    let peak = 0;
    const teardown = vi.fn(() => {
      active--;
    });
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      judge: success,
      setup: ({ sessionId }) => {
        sessions.add(sessionId);
        active++;
        peak = Math.max(peak, active);
        return { identity: sessionId };
      },
      execute: async ({ prepared, sessionId }) => {
        expect(prepared.identity).toBe(sessionId);
        await Promise.resolve();
        return { observation };
      },
      teardown,
    }).run({ suiteId: answerSuite.id, repetitions: 5, concurrency: 2 });
    expect(result.counts).toEqual({
      passed: 5,
      failed: 0,
      error: 0,
      cancelled: 0,
    });
    expect(sessions.size).toBe(5);
    expect(peak).toBe(2);
    expect(active).toBe(0);
    expect(teardown).toHaveBeenCalledTimes(5);
  });

  it.each([
    "setup",
    "execute",
    "grading",
    "cleanup",
  ] as const)("reports %s errors separately without copying private exception messages", async (phase) => {
    const teardown = vi.fn(() => {
      if (phase === "cleanup") throw new Error("PRIVATE_TOKEN");
    });
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      setup: () => {
        if (phase === "setup") throw new Error("PRIVATE_TOKEN");
        return { token: "PRIVATE_TOKEN" };
      },
      execute: () => {
        if (phase === "execute") throw new Error("PRIVATE_TOKEN");
        return { observation };
      },
      judge: {
        ...success,
        grade: () => {
          if (phase === "grading") throw new Error("PRIVATE_TOKEN");
          return success.grade({} as never);
        },
      },
      teardown,
    }).run({ suiteId: answerSuite.id });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors[0]?.phase).toBe(phase);
    expect(teardown).toHaveBeenCalledTimes(phase === "setup" ? 0 : 1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TOKEN");
  });

  it("validates Studio params before setup", async () => {
    const setup = vi.fn(() => ({}));
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      judge: success,
      paramsSchema: z.object({ actor: z.enum(["recruiter"]) }),
      setup,
      execute: () => ({ observation }),
    }).run({ suiteId: answerSuite.id });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors[0]?.phase).toBe("params");
    expect(setup).not.toHaveBeenCalled();
  });

  it("aborts timed-out execution but supplies a fresh cleanup signal", async () => {
    const teardown = vi.fn(({ signal }: { signal: AbortSignal }) => {
      expect(signal.aborted).toBe(false);
    });
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      judge: success,
      defaults: { caseTimeoutMs: 15 },
      setup: () => ({}),
      execute: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
      teardown,
    }).run({ suiteId: answerSuite.id });
    expect(result.cases[0]?.errors[0]?.code).toBe("EVAL_TIMEOUT");
    expect(teardown).toHaveBeenCalledOnce();
  });

  it("does not prepare an actor for pre-cancelled runs", async () => {
    const setup = vi.fn();
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      judge: success,
      setup,
    }).run({ suiteId: answerSuite.id, signal: AbortSignal.abort() });
    expect(result.status).toBe("cancelled");
    expect(setup).not.toHaveBeenCalled();
  });

  it("progress hooks cannot mutate results and reporting failures do not skip cleanup", async () => {
    const teardown = vi.fn();
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      judge: success,
      execute: () => ({ observation }),
      teardown,
    }).run({
      suiteId: answerSuite.id,
      onProgress: (event) => {
        if (event.type === "step-completed") {
          event.step.status = "failed";
          throw new Error("PRIVATE_TOKEN");
        }
      },
    });
    expect(result.cases[0]?.status).toBe("passed");
    expect(result.status).toBe("error");
    expect(result.errors[0]?.phase).toBe("reporting");
    expect(teardown).toHaveBeenCalledOnce();
  });

  it("rejects an invalid judge verdict instead of interpreting it as success", async () => {
    const result = await createEvals({
      agent: unusedAgent,
      suites: [answerSuite],
      execute: () => ({ observation }),
      judge: {
        ...success,
        grade: () =>
          ({ passed: "yes", reason: "wrong", evidence: [] }) as never,
      },
    }).run({ suiteId: answerSuite.id });
    expect(result.status).toBe("error");
    expect(result.cases[0]?.errors[0]?.phase).toBe("grading");
  });
});

describe("serializable suite validation", () => {
  it("rejects functions, missing registered behavior, missing judges and invalid ordering", () => {
    expect(() =>
      createEvals({
        agent: unusedAgent,
        suites: [
          {
            ...answerSuite,
            cases: [
              {
                ...required(answerSuite.cases[0]),
                params: (() => "secret") as never,
              },
            ],
          },
        ],
        judge: success,
      }),
    ).toThrow("Invalid suite");
    expect(() =>
      createEvals({ agent: unusedAgent, suites: [salaries], judge }),
    ).toThrow("Unknown reference");
    expect(() =>
      createEvals({ agent: unusedAgent, suites: [ambiguity], judge }),
    ).toThrow("Unknown responder");
    expect(() =>
      createEvals({ agent: unusedAgent, suites: [answerSuite] }),
    ).toThrow("configured judge");
    expect(() =>
      createEvals({
        agent: unusedAgent,
        suites: [
          {
            id: "bad",
            cases: [
              {
                id: "resume-first",
                steps: [
                  {
                    resume: { type: "text", text: "wrong" },
                    expect: { type: "answer" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrow("resume step");
  });
  it("exports a schema and named handlers without setup data", () => {
    const evals = createEvals({
      agent: unusedAgent,
      suites: [ambiguity],
      judge,
      paramsSchema: z.object({ actor: z.enum(["recruiter"]) }),
      setup: () => ({ token: "PRIVATE_TOKEN" }),
      responders: {
        selectBarcelona: {
          schemaId: "wolly.job-picker",
          respond: () => ({
            type: "value",
            value: { type: "select", jobId: "barcelona" },
          }),
        },
      },
      references: { selectedJob: () => jobs },
    });
    expect(evals.describe().responders).toEqual([
      { name: "selectBarcelona", schemaId: "wolly.job-picker" },
    ]);
    expect(evals.describe().paramsSchema).toHaveProperty(
      "properties.actor.enum",
      ["recruiter"],
    );
    expect(JSON.stringify(evals.describe())).not.toContain("PRIVATE_TOKEN");
    const exported = evals.listSuites();
    required(exported[0]).id = "mutated";
    expect(evals.listSuites()[0]?.id).toBe("ambiguity");
  });
});

describe("provider-backed grading", () => {
  it.each([
    { content: "not JSON" },
    { content: JSON.stringify({ passed: true, reason: "", evidence: [] }) },
    {
      content: JSON.stringify({
        passed: true,
        reason: "Looks fine",
        evidence: [],
      }),
      finishReason: { unified: "length" },
    },
  ])("rejects malformed or unfinished model verdicts", async (response) => {
    const judge = createEvalJudge({
      model: {
        provider: {
          id: "judge",
          models: ["model"],
          getModel: () => ({
            invoke: async () => response as never,
            stream: async function* () {},
          }),
        },
        modelId: "model",
      },
    });
    await expect(
      judge.grade({
        criterion: { id: "correct", text: "Correct" },
        input: { message: "hello" },
        observation,
        conversation: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  });

  it("invokes a separately configured model with only public evaluation evidence", async () => {
    const invoke = vi.fn(
      async (_messages: { role: string; content: string }[]) => ({
        content: JSON.stringify({
          passed: false,
          reason: "Missing Paris.",
          evidence: [],
        }),
      }),
    );
    const getModel = vi.fn(() => ({ invoke, stream: async function* () {} }));
    const judge = createEvalJudge({
      model: {
        provider: { id: "judge-provider", models: ["judge-model"], getModel },
        modelId: "judge-model",
      },
    });
    const verdict = await judge.grade({
      criterion: { id: "all", text: "Answers for all jobs" },
      input: { message: "Give all salaries" },
      observation,
      reference: jobs,
      conversation: [],
      signal: new AbortController().signal,
    });
    expect(verdict.passed).toBe(false);
    expect(getModel).toHaveBeenCalledWith(
      "judge-model",
      expect.objectContaining({
        streaming: false,
        responseFormat: expect.objectContaining({ type: "json" }),
      }),
    );
    expect(
      JSON.parse(required(required(invoke.mock.calls[0])?.[0]?.[1]).content),
    ).toMatchObject({
      reference: jobs,
      observation,
      input: { message: "Give all salaries" },
    });
  });
});
